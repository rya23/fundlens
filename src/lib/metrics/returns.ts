/**
 * Trailing and rolling return metrics (PLAN: "Metric defaults and math").
 *
 * All formulas use `asOf` from series.ts ("last NAV on or before a date")
 * so a window endpoint that falls on a weekend/holiday resolves to the
 * last real trading day, never a gap.
 */
import { alignByDate, asOf, subtractYears } from "./series";
import type { NavSeries } from "./series";
import { METRIC_REASONS, na, ok } from "./types";
import type { MetricResult } from "./types";

export interface TrailingReturnOptions {
  /** End date of the window; defaults to the series' last date. */
  readonly asOf?: string;
}

/**
 * Trailing return over `years` ending at `opts.asOf` (default: the
 * series' last date), using `NAV_end / NAV_asOf(end - years)`.
 *
 * - `years >= 1`: annualised CAGR, `(NAV_end/NAV_start)^(1/years) - 1`.
 * - `0 < years < 1`: plain (non-annualised) absolute return,
 *   `NAV_end/NAV_start - 1` - annualising a sub-1Y window would
 *   exaggerate small moves into a misleading rate.
 *
 * n/a reasons: `empty_series`, `invalid_window` (years <= 0 or
 * non-finite), `no_data_at_date` (no NAV on/before the end date),
 * `insufficient_history` (the fund's history doesn't reach back far
 * enough for the start date), `invalid_nav` (a non-positive NAV or a
 * non-finite result).
 */
export function trailingReturn(
  series: NavSeries,
  years: number,
  opts: TrailingReturnOptions = {}
): MetricResult<number> {
  if (series.length === 0) return na(METRIC_REASONS.EMPTY_SERIES);
  if (!(years > 0) || !Number.isFinite(years)) return na(METRIC_REASONS.INVALID_WINDOW);

  const endDateISO = opts.asOf ?? series[series.length - 1].date;
  const endPoint = asOf(series, endDateISO);
  if (!endPoint) return na(METRIC_REASONS.NO_DATA_AT_DATE);

  const startTargetISO = subtractYears(endDateISO, years);
  const startPoint = asOf(series, startTargetISO);
  if (!startPoint) return na(METRIC_REASONS.INSUFFICIENT_HISTORY);

  if (startPoint.nav <= 0 || endPoint.nav <= 0) return na(METRIC_REASONS.INVALID_NAV);

  const ratio = endPoint.nav / startPoint.nav;
  const value = years >= 1 ? Math.pow(ratio, 1 / years) - 1 : ratio - 1;
  if (!Number.isFinite(value)) return na(METRIC_REASONS.INVALID_NAV);

  return ok(value);
}

/** The screener's/fund-detail's standard trailing CAGR windows. */
export type TrailingWindowYears = 1 | 3 | 5 | 10;

/**
 * Trailing CAGR for one of the standard windows (1/3/5/10Y). Thin,
 * type-narrowed wrapper over `trailingReturn` for the common case.
 */
export function trailingCAGR(
  series: NavSeries,
  years: TrailingWindowYears,
  opts: TrailingReturnOptions = {}
): MetricResult<number> {
  return trailingReturn(series, years, opts);
}

export type RollingWindowYears = 1 | 3 | 5;

export interface RollingReturnPoint {
  /** The window's end date. */
  readonly date: string;
  readonly cagr: number;
}

export interface RollingReturnStats {
  readonly count: number;
  readonly min: number;
  readonly median: number;
  readonly max: number;
  readonly mean: number;
}

export interface RollingReturnDistribution {
  readonly windowYears: RollingWindowYears;
  readonly points: RollingReturnPoint[];
  readonly stats: RollingReturnStats;
}

function median(sortedAscending: number[]): number {
  const n = sortedAscending.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedAscending[mid - 1] + sortedAscending[mid]) / 2 : sortedAscending[mid];
}

/**
 * Rolling CAGR on daily windows: for every date in `series` that has at
 * least `years` of history behind it, computes the trailing `years`-CAGR
 * ending that date, then returns the full distribution plus
 * min/median/max/mean (PLAN: "Rolling CAGR on daily windows").
 *
 * n/a reasons: `empty_series`, `insufficient_history` (no date in the
 * series has `years` of history behind it yet).
 */
export function rollingCAGR(
  series: NavSeries,
  years: RollingWindowYears
): MetricResult<RollingReturnDistribution> {
  if (series.length === 0) return na(METRIC_REASONS.EMPTY_SERIES);

  const points: RollingReturnPoint[] = [];
  for (const point of series) {
    const startTargetISO = subtractYears(point.date, years);
    const startPoint = asOf(series, startTargetISO);
    if (!startPoint) continue;
    if (startPoint.nav <= 0 || point.nav <= 0) continue;

    const cagr = Math.pow(point.nav / startPoint.nav, 1 / years) - 1;
    if (!Number.isFinite(cagr)) continue;

    points.push({ date: point.date, cagr });
  }

  if (points.length === 0) return na(METRIC_REASONS.INSUFFICIENT_HISTORY);

  const sortedValues = points.map((p) => p.cagr).sort((a, b) => a - b);
  const stats: RollingReturnStats = {
    count: sortedValues.length,
    min: sortedValues[0],
    max: sortedValues[sortedValues.length - 1],
    mean: sortedValues.reduce((sum, v) => sum + v, 0) / sortedValues.length,
    median: median(sortedValues),
  };

  return ok({ windowYears: years, points, stats });
}

/**
 * Percentage of the fund's rolling windows whose CAGR beat the
 * benchmark's rolling CAGR for the same window length, compared only
 * over window end-dates present in both distributions.
 *
 * n/a reasons: `window_mismatch` (different `windowYears`),
 * `no_overlapping_windows` (no shared end dates).
 */
export function pctRollingWindowsBeatingBenchmark(
  fund: RollingReturnDistribution,
  benchmark: RollingReturnDistribution
): MetricResult<number> {
  if (fund.windowYears !== benchmark.windowYears) return na(METRIC_REASONS.WINDOW_MISMATCH);

  const pairs = alignByDate(fund.points, benchmark.points);
  if (pairs.length === 0) return na(METRIC_REASONS.NO_OVERLAPPING_WINDOWS);

  const beat = pairs.filter((p) => p.a.cagr > p.b.cagr).length;
  return ok(beat / pairs.length);
}
