/**
 * Risk ratios: annualised volatility, Sharpe, Sortino, max drawdown,
 * beta/alpha/R2/tracking error/information ratio, and up/down capture
 * (PLAN: "Metric defaults and math").
 *
 * Every function here takes an explicit `years` window (one of the
 * standard 1/3/5/10Y windows from `returns.ts`'s `TrailingWindowYears`) and
 * an explicit `rf` (annual risk-free rate, e.g. 0.065) rather than reading
 * config itself - this file stays pure and side-effect-free, like the rest
 * of `src/lib/metrics/`. Callers (API routes, pages) are responsible for
 * picking the default window per PLAN (3Y for the ratios, 5Y for max
 * drawdown) and for passing `getEnv().RISK_FREE_RATE` as `rf`.
 */
import { alignByDate, asOf, resampleMonthly, resampleWeekly, simpleReturns, subtractYears } from "./series";
import type { NavSeries } from "./series";
import type { TrailingWindowYears } from "./returns";
import { na, ok } from "./types";
import type { MetricResult } from "./types";

export type RiskFailureReason =
  | "empty_series"
  | "no_data_at_date"
  | "insufficient_history"
  | "insufficient_benchmark_history"
  | "invalid_nav"
  | "zero_variance"
  | "zero_downside_deviation"
  | "zero_benchmark_variance"
  | "zero_tracking_error"
  | "no_up_months"
  | "no_down_months";

function fail(reason: RiskFailureReason): MetricResult<never> {
  return na(reason);
}

export interface RiskWindowOptions {
  /** End date of the window; defaults to the series' last date. */
  readonly asOf?: string;
}

/**
 * Slices `series` down to the trailing `years`-window ending at
 * `asOfDate` (default: the series' last date), inclusive of the NAV point
 * at the window's start (the last NAV on or before `end - years`) so that
 * `simpleReturns` on the slice yields a return for the first day in the
 * window too - same `asOf`/`subtractYears` pattern as `trailingReturn` in
 * returns.ts, and the same n/a reasons.
 */
function sliceTrailingWindow(
  series: NavSeries,
  years: TrailingWindowYears,
  asOfDate?: string
): MetricResult<NavSeries> {
  if (series.length === 0) return fail("empty_series");

  const end = asOfDate ?? series[series.length - 1].date;
  const endPoint = asOf(series, end);
  if (!endPoint) return fail("no_data_at_date");

  const startTarget = subtractYears(end, years);
  const startPoint = asOf(series, startTarget);
  if (!startPoint) return fail("insufficient_history");

  const windowed = series.filter((p) => p.date >= startPoint.date && p.date <= endPoint.date);
  return ok(windowed);
}

function mean(xs: readonly number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

/** Sample standard deviation (n-1 denominator), the convention used throughout this file. */
function sampleStdDev(xs: readonly number[]): number {
  const m = mean(xs);
  const variance = xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

const TRADING_DAYS_PER_YEAR = 252;
const ANNUALIZATION_SQRT_DAILY = Math.sqrt(TRADING_DAYS_PER_YEAR);

/**
 * Annualised volatility: sample standard deviation of daily simple returns
 * over the trailing `years` window, annualised by `sqrt(252)`.
 *
 * n/a reasons: `empty_series`, `no_data_at_date`, `insufficient_history`
 * (propagated from the window slice, or too few return observations in the
 * window to compute a sample std dev).
 */
export function annualizedVolatility(
  series: NavSeries,
  years: TrailingWindowYears,
  opts: RiskWindowOptions = {}
): MetricResult<number> {
  const sliced = sliceTrailingWindow(series, years, opts.asOf);
  if (!sliced.ok) return sliced;

  const dailyReturns = simpleReturns(sliced.value).map((r) => r.value);
  if (dailyReturns.length < 2) return fail("insufficient_history");

  const volatility = sampleStdDev(dailyReturns) * ANNUALIZATION_SQRT_DAILY;
  if (!Number.isFinite(volatility)) return fail("invalid_nav");

  return ok(volatility);
}

/**
 * Sharpe ratio: annualised arithmetic mean daily excess return (daily
 * return minus the daily risk-free rate `rf/252`, averaged then * 252 -
 * PLAN: "not CAGR / daily vol") divided by annualised volatility (the same
 * sample-std-dev-of-daily-returns basis as `annualizedVolatility`).
 *
 * n/a reasons: propagated from the window slice (`empty_series`,
 * `no_data_at_date`, `insufficient_history`), or `zero_variance` when daily
 * returns in the window have no variance (undefined ratio).
 */
export function sharpeRatio(
  series: NavSeries,
  years: TrailingWindowYears,
  rf: number,
  opts: RiskWindowOptions = {}
): MetricResult<number> {
  const sliced = sliceTrailingWindow(series, years, opts.asOf);
  if (!sliced.ok) return sliced;

  const dailyReturns = simpleReturns(sliced.value).map((r) => r.value);
  if (dailyReturns.length < 2) return fail("insufficient_history");

  const dailyRf = rf / TRADING_DAYS_PER_YEAR;
  const annualizedExcessReturn = mean(dailyReturns.map((r) => r - dailyRf)) * TRADING_DAYS_PER_YEAR;
  const volatility = sampleStdDev(dailyReturns) * ANNUALIZATION_SQRT_DAILY;
  if (volatility === 0) return fail("zero_variance");

  return ok(annualizedExcessReturn / volatility);
}

/**
 * Sortino ratio: same annualised arithmetic mean daily excess return as
 * `sharpeRatio`, divided by annualised downside deviation vs `rf` - the
 * standard "target downside deviation": only periods below the daily
 * target (`rf/252`) contribute, squared deviations are averaged over
 * *all* periods (population, divide by N, not just the below-target
 * count), then annualised by `sqrt(252)`.
 *
 * n/a reasons: propagated from the window slice, or
 * `zero_downside_deviation` when no period in the window falls below the
 * daily target (undefined ratio).
 */
export function sortinoRatio(
  series: NavSeries,
  years: TrailingWindowYears,
  rf: number,
  opts: RiskWindowOptions = {}
): MetricResult<number> {
  const sliced = sliceTrailingWindow(series, years, opts.asOf);
  if (!sliced.ok) return sliced;

  const dailyReturns = simpleReturns(sliced.value).map((r) => r.value);
  if (dailyReturns.length < 2) return fail("insufficient_history");

  const dailyRf = rf / TRADING_DAYS_PER_YEAR;
  const excess = dailyReturns.map((r) => r - dailyRf);
  const annualizedExcessReturn = mean(excess) * TRADING_DAYS_PER_YEAR;

  const downsideVariance = mean(excess.map((e) => Math.min(0, e) ** 2));
  const annualizedDownsideDeviation = Math.sqrt(downsideVariance) * ANNUALIZATION_SQRT_DAILY;
  if (annualizedDownsideDeviation === 0) return fail("zero_downside_deviation");

  return ok(annualizedExcessReturn / annualizedDownsideDeviation);
}

export interface MaxDrawdownResult {
  /** Worst peak-to-trough decline in the window, as a negative decimal (e.g. -0.6 for -60%). Never positive; 0 when NAV never declined. */
  readonly drawdown: number;
  /** Date of the peak the worst trough fell from. */
  readonly peakDate: string;
  /** Date of the worst trough itself. */
  readonly troughDate: string;
}

/**
 * Max drawdown: the single worst peak-to-trough NAV decline within the
 * trailing `years` window (PLAN default window: 5Y), plus the dates of
 * that peak and trough.
 *
 * n/a reasons: propagated from the window slice, or `invalid_nav` if any
 * NAV in the window is non-positive (a drawdown ratio against it would be
 * meaningless).
 */
export function maxDrawdown(
  series: NavSeries,
  years: TrailingWindowYears,
  opts: RiskWindowOptions = {}
): MetricResult<MaxDrawdownResult> {
  const sliced = sliceTrailingWindow(series, years, opts.asOf);
  if (!sliced.ok) return sliced;

  const windowed = sliced.value;
  if (windowed.some((p) => p.nav <= 0)) return fail("invalid_nav");

  let peakNav = windowed[0].nav;
  let peakDate = windowed[0].date;
  let worstDrawdown = 0;
  let worstPeakDate = peakDate;
  let worstTroughDate = windowed[0].date;

  for (const point of windowed) {
    if (point.nav > peakNav) {
      peakNav = point.nav;
      peakDate = point.date;
    }
    const drawdown = point.nav / peakNav - 1;
    if (drawdown < worstDrawdown) {
      worstDrawdown = drawdown;
      worstPeakDate = peakDate;
      worstTroughDate = point.date;
    }
  }

  return ok({ drawdown: worstDrawdown, peakDate: worstPeakDate, troughDate: worstTroughDate });
}

/** Population covariance of two equal-length arrays (divide by n). */
function covariance(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  return mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
}

/** Population variance (divide by n) - the denominator convention for beta/R2. */
function populationVariance(xs: readonly number[]): number {
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
}

export interface BetaAlphaResult {
  readonly beta: number;
  /** Annualised Jensen's alpha. */
  readonly alpha: number;
  readonly r2: number;
  /** Annualised tracking error. */
  readonly trackingError: number;
  /** n/a (`zero_tracking_error`) when tracking error is 0 - the ratio is undefined, even though beta/alpha/R2 above remain well-defined. */
  readonly informationRatio: MetricResult<number>;
}

const WEEKS_PER_YEAR = 52;
const ANNUALIZATION_SQRT_WEEKLY = Math.sqrt(WEEKS_PER_YEAR);

/**
 * Beta, annualised Jensen's alpha, R2, annualised tracking error and
 * information ratio, regressing the fund's weekly (Friday) excess returns
 * against the benchmark's over the trailing `years` window (PLAN: weekly
 * Friday returns, excess of rf, annualise with 52).
 *
 * The fund's trailing window is computed first (same `sliceTrailingWindow`
 * as the other risk ratios); the benchmark is then restricted to that same
 * calendar date range (not its own independent trailing window) so both
 * series are compared over identical dates before resampling to weekly.
 *
 * n/a reasons: propagated from the fund's window slice, plus
 * `insufficient_benchmark_history` (no benchmark NAV in the fund's window),
 * `insufficient_history` (fewer than 2 overlapping weekly Fridays - not
 * enough to compute a variance/covariance), and `zero_benchmark_variance`
 * (the benchmark's weekly excess returns have no variance, so beta is
 * undefined).
 */
export function betaAlpha(
  fund: NavSeries,
  benchmark: NavSeries,
  years: TrailingWindowYears,
  rf: number,
  opts: RiskWindowOptions = {}
): MetricResult<BetaAlphaResult> {
  const fundSliced = sliceTrailingWindow(fund, years, opts.asOf);
  if (!fundSliced.ok) return fundSliced;

  const windowStart = fundSliced.value[0].date;
  const windowEnd = fundSliced.value[fundSliced.value.length - 1].date;
  const benchmarkSliced = benchmark.filter((p) => p.date >= windowStart && p.date <= windowEnd);
  if (benchmarkSliced.length === 0) return fail("insufficient_benchmark_history");

  const fundWeeklyReturns = simpleReturns(resampleWeekly(fundSliced.value));
  const benchmarkWeeklyReturns = simpleReturns(resampleWeekly(benchmarkSliced));
  const pairs = alignByDate(fundWeeklyReturns, benchmarkWeeklyReturns);
  if (pairs.length < 2) return fail("insufficient_history");

  const rfWeekly = rf / WEEKS_PER_YEAR;
  const fundExcess = pairs.map((p) => p.a.value - rfWeekly);
  const benchmarkExcess = pairs.map((p) => p.b.value - rfWeekly);

  const varBenchmark = populationVariance(benchmarkExcess);
  if (varBenchmark === 0) return fail("zero_benchmark_variance");

  const cov = covariance(fundExcess, benchmarkExcess);
  const beta = cov / varBenchmark;
  const alpha = (mean(fundExcess) - beta * mean(benchmarkExcess)) * WEEKS_PER_YEAR;

  const varFund = populationVariance(fundExcess);
  const correlation = varFund === 0 ? 0 : cov / Math.sqrt(varFund * varBenchmark);
  const r2 = correlation * correlation;

  // rf cancels in the pairwise difference, so the raw (non-excess) weekly
  // returns give the same tracking error as the excess returns would.
  const diffs = pairs.map((p) => p.a.value - p.b.value);
  const trackingError = sampleStdDev(diffs) * ANNUALIZATION_SQRT_WEEKLY;
  const informationRatio: MetricResult<number> =
    trackingError === 0 ? fail("zero_tracking_error") : ok((mean(diffs) * WEEKS_PER_YEAR) / trackingError);

  return ok({ beta, alpha, r2, trackingError, informationRatio });
}

function geometricMean(returns: readonly number[]): number {
  return Math.pow(returns.reduce((product, r) => product * (1 + r), 1), 1 / returns.length) - 1;
}

export interface UpDownCaptureResult {
  readonly upCapture: MetricResult<number>;
  readonly downCapture: MetricResult<number>;
}

/**
 * Up/down capture: geometric mean of the fund's full-month returns during
 * months the benchmark was positive ("up") or negative ("down"), divided
 * by the benchmark's own geometric mean for the same months (PLAN: full
 * months only, geometric means).
 *
 * Same fund-window-first-then-restrict-benchmark approach as `betaAlpha`.
 * `upCapture`/`downCapture` are independently n/a (`no_up_months` /
 * `no_down_months`) when the benchmark never moved that direction, even
 * though the other one may still be computable.
 */
export function upDownCapture(
  fund: NavSeries,
  benchmark: NavSeries,
  years: TrailingWindowYears,
  opts: RiskWindowOptions = {}
): MetricResult<UpDownCaptureResult> {
  const fundSliced = sliceTrailingWindow(fund, years, opts.asOf);
  if (!fundSliced.ok) return fundSliced;

  const windowStart = fundSliced.value[0].date;
  const windowEnd = fundSliced.value[fundSliced.value.length - 1].date;
  const benchmarkSliced = benchmark.filter((p) => p.date >= windowStart && p.date <= windowEnd);
  if (benchmarkSliced.length === 0) return fail("insufficient_benchmark_history");

  const fundMonthlyReturns = simpleReturns(resampleMonthly(fundSliced.value));
  const benchmarkMonthlyReturns = simpleReturns(resampleMonthly(benchmarkSliced));
  const pairs = alignByDate(fundMonthlyReturns, benchmarkMonthlyReturns);
  if (pairs.length === 0) return fail("insufficient_history");

  const upPairs = pairs.filter((p) => p.b.value > 0);
  const downPairs = pairs.filter((p) => p.b.value < 0);

  const upCapture: MetricResult<number> =
    upPairs.length === 0
      ? fail("no_up_months")
      : ok(geometricMean(upPairs.map((p) => p.a.value)) / geometricMean(upPairs.map((p) => p.b.value)));

  const downCapture: MetricResult<number> =
    downPairs.length === 0
      ? fail("no_down_months")
      : ok(geometricMean(downPairs.map((p) => p.a.value)) / geometricMean(downPairs.map((p) => p.b.value)));

  return ok({ upCapture, downCapture });
}
