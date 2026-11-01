import { describe, expect, it } from "vitest";
import { annualizedVolatility, betaAlpha, maxDrawdown, sharpeRatio, sortinoRatio, upDownCapture } from "./risk";
import type { NavSeries } from "./series";

describe("annualizedVolatility", () => {
  // NAV 100 -> 110 -> 99 across a 1Y window: period returns +10%, -10%
  // (exact, by construction). mean = 0; sample variance =
  // (0.1^2 + 0.1^2) / (2-1) = 0.02; sample std dev = sqrt(0.02); annualised
  // = sqrt(0.02) * sqrt(252) = sqrt(0.02 * 252) = sqrt(5.04)
  // (independently-derived identity used here only to combine the two
  // sqrt's into one literal, not a restatement of the implementation).
  const series: NavSeries = [
    { date: "2023-01-03", nav: 100 },
    { date: "2024-01-02", nav: 110 },
    { date: "2024-01-03", nav: 99 },
  ];

  it("computes sample std dev of daily returns, annualised by sqrt(252)", () => {
    const result = annualizedVolatility(series, 1, { asOf: "2024-01-03" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(Math.sqrt(5.04), 10);
  });

  it("returns n/a 'empty_series' for an empty series", () => {
    expect(annualizedVolatility([], 1)).toEqual({ ok: false, reason: "empty_series" });
  });

  it("returns n/a 'insufficient_history' when the window is longer than the fund's history", () => {
    const shortSeries: NavSeries = [
      { date: "2024-01-01", nav: 100 },
      { date: "2024-01-02", nav: 110 },
    ];
    expect(annualizedVolatility(shortSeries, 5, { asOf: "2024-01-02" })).toEqual({
      ok: false,
      reason: "insufficient_history",
    });
  });

  it("returns n/a 'insufficient_history' when the window has fewer than 2 return observations", () => {
    const singlePoint: NavSeries = [{ date: "2024-01-01", nav: 100 }];
    expect(annualizedVolatility(singlePoint, 1, { asOf: "2024-01-01" })).toEqual({
      ok: false,
      reason: "insufficient_history",
    });
  });

  it("defaults asOf to the series' last date", () => {
    const result = annualizedVolatility(series, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(Math.sqrt(5.04), 10);
  });
});

describe("sharpeRatio", () => {
  // Same NAV series as annualizedVolatility: period returns +10%, -10%,
  // mean(return) = 0 exactly. Daily rf = rf/252, so
  // mean(excess) = mean(return) - rf/252 = -rf/252, and the annualised
  // excess return (* 252) collapses to exactly -rf regardless of rf's
  // value - a convenient hand-computable identity for this fixture only
  // because the raw returns happen to average to zero.
  const series: NavSeries = [
    { date: "2023-01-03", nav: 100 },
    { date: "2024-01-02", nav: 110 },
    { date: "2024-01-03", nav: 99 },
  ];

  it("is zero when rf is zero and the mean daily return is zero", () => {
    const result = sharpeRatio(series, 1, 0, { asOf: "2024-01-03" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(0, 10);
  });

  it("divides the annualised excess return (-rf for this fixture) by the annualised volatility", () => {
    const result = sharpeRatio(series, 1, 0.065, { asOf: "2024-01-03" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(-0.065 / Math.sqrt(5.04), 10);
  });

  it("returns n/a 'zero_variance' when daily returns have no variance", () => {
    const constantReturns: NavSeries = [
      { date: "2023-01-03", nav: 100 },
      { date: "2024-01-02", nav: 110 },
      { date: "2024-01-03", nav: 121 },
    ];
    const result = sharpeRatio(constantReturns, 1, 0.065, { asOf: "2024-01-03" });
    expect(result).toEqual({ ok: false, reason: "zero_variance" });
  });

  it("returns n/a 'empty_series' for an empty series", () => {
    expect(sharpeRatio([], 1, 0.065)).toEqual({ ok: false, reason: "empty_series" });
  });
});

describe("sortinoRatio", () => {
  // Same NAV series: period returns +10%, -10%. Daily rf = rf/252; only the
  // -10% period falls below the daily target, so the downside deviation
  // (population, divide by N=2, zero-floored above target per the standard
  // Sortino "target downside deviation" definition) is driven by that one
  // period alone.
  const series: NavSeries = [
    { date: "2023-01-03", nav: 100 },
    { date: "2024-01-02", nav: 110 },
    { date: "2024-01-03", nav: 99 },
  ];
  const rf = 0.065;

  it("divides the annualised excess return by the annualised downside deviation vs rf", () => {
    const result = sortinoRatio(series, 1, rf, { asOf: "2024-01-03" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dailyRf = rf / 252;
    const belowTargetExcess = -0.1 - dailyRf; // the only period below the daily target
    const downsideVarianceDaily = belowTargetExcess ** 2 / 2; // divide by N=2
    const annualizedDownsideDeviation = Math.sqrt(downsideVarianceDaily) * Math.sqrt(252);
    const expected = -rf / annualizedDownsideDeviation; // annualised excess return is -rf (see sharpeRatio fixture)

    expect(result.value).toBeCloseTo(expected, 10);
  });

  it("returns n/a 'zero_downside_deviation' when every period beats the daily target", () => {
    const allUp: NavSeries = [
      { date: "2023-01-03", nav: 100 },
      { date: "2024-01-02", nav: 110 },
      { date: "2024-01-03", nav: 125 },
    ];
    const result = sortinoRatio(allUp, 1, rf, { asOf: "2024-01-03" });
    expect(result).toEqual({ ok: false, reason: "zero_downside_deviation" });
  });

  it("returns n/a 'empty_series' for an empty series", () => {
    expect(sortinoRatio([], 1, rf)).toEqual({ ok: false, reason: "empty_series" });
  });
});

describe("maxDrawdown", () => {
  // Peak 150 @ 2021-01-01; first trough 90 @ 2022-01-01 (dd = -40%);
  // partial recovery to 120 @ 2023-01-01 (never exceeds the 150 peak);
  // deeper trough 60 @ 2024-01-01 (dd = -60%, the window's worst).
  const series: NavSeries = [
    { date: "2021-01-01", nav: 150 },
    { date: "2022-01-01", nav: 90 },
    { date: "2023-01-01", nav: 120 },
    { date: "2024-01-01", nav: 60 },
  ];

  it("finds the single worst peak-to-trough decline and its dates", () => {
    const result = maxDrawdown(series, 3, { asOf: "2024-01-01" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drawdown).toBeCloseTo(-0.6, 10);
    expect(result.value.peakDate).toBe("2021-01-01");
    expect(result.value.troughDate).toBe("2024-01-01");
  });

  it("is zero when the window's start and end resolve to the same single NAV point", () => {
    // asOf "2024-01-01" resolves (via asOf-fallback) to the 2023-01-01
    // point, and the 1Y-earlier window start resolves to that same point -
    // the window collapses to a single NAV, so there's no decline to find.
    const sparse: NavSeries = [
      { date: "2023-01-01", nav: 100 },
      { date: "2024-06-01", nav: 200 },
    ];
    const result = maxDrawdown(sparse, 1, { asOf: "2024-01-01" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.drawdown).toBe(0);
    expect(result.value.peakDate).toBe("2023-01-01");
    expect(result.value.troughDate).toBe("2023-01-01");
  });

  it("returns n/a 'empty_series' for an empty series", () => {
    expect(maxDrawdown([], 5)).toEqual({ ok: false, reason: "empty_series" });
  });

  it("returns n/a 'insufficient_history' when the window is longer than the fund's history", () => {
    expect(maxDrawdown(series, 10, { asOf: "2024-01-01" })).toEqual({
      ok: false,
      reason: "insufficient_history",
    });
  });

  it("returns n/a 'invalid_nav' when a NAV in the window is non-positive", () => {
    const badSeries: NavSeries = [
      { date: "2021-01-01", nav: 150 },
      { date: "2024-01-01", nav: -1 },
    ];
    expect(maxDrawdown(badSeries, 3, { asOf: "2024-01-01" })).toEqual({
      ok: false,
      reason: "invalid_nav",
    });
  });
});

describe("betaAlpha", () => {
  // 5 weekly Fridays, 4 period returns. Benchmark alternates +5%/-5%
  // exactly (mean 0); fund is exactly 2x the benchmark's return every
  // period (+10%/-10%), a noise-free linear relationship. `asOf` is set to
  // exactly one calendar year after the first Friday, so
  // `subtractYears(asOf, 1)` resolves back to that exact date and the
  // window covers the whole 5-point cluster with no insufficient-history
  // padding (same trick as the daily fixtures above).
  const benchmark: NavSeries = [
    { date: "2023-02-03", nav: 100 },
    { date: "2023-02-10", nav: 105 },
    { date: "2023-02-17", nav: 99.75 },
    { date: "2023-02-24", nav: 104.7375 },
    { date: "2023-03-03", nav: 99.500625 },
  ];
  const fund: NavSeries = [
    { date: "2023-02-03", nav: 100 },
    { date: "2023-02-10", nav: 110 },
    { date: "2023-02-17", nav: 99 },
    { date: "2023-02-24", nav: 108.9 },
    { date: "2023-03-03", nav: 98.01 },
  ];
  const asOfDate = "2024-02-03";
  const rf = 0.065;

  it("computes beta, annualised Jensen's alpha, R2, tracking error and information ratio", () => {
    const result = betaAlpha(fund, benchmark, 1, rf, { asOf: asOfDate });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // fund = 2 * benchmark exactly every period -> beta = cov/var = 2
    // regardless of the excess-return shift (a constant shift cancels in
    // covariance), and alpha = rfWeekly*(beta-1), annualised = rf*(beta-1)
    // = rf here since beta-1 = 1.
    expect(result.value.beta).toBeCloseTo(2, 10);
    expect(result.value.alpha).toBeCloseTo(rf, 10);
    expect(result.value.r2).toBeCloseTo(1, 10);

    // diff_i = fund_i - benchmark_i = benchmark_i (since fund = 2*bench),
    // and the benchmark's own returns average to exactly zero, so TE is
    // the sample std dev of the benchmark's returns (n=4) annualised by
    // sqrt(52), and information ratio (mean diff, annualised / TE) is 0.
    const benchReturns = [0.05, -0.05, 0.05, -0.05];
    const sampleVariance = benchReturns.reduce((s, r) => s + r * r, 0) / (benchReturns.length - 1);
    const expectedTE = Math.sqrt(sampleVariance) * Math.sqrt(52);
    expect(result.value.trackingError).toBeCloseTo(expectedTE, 10);
    expect(result.value.informationRatio.ok).toBe(true);
    if (result.value.informationRatio.ok) {
      expect(result.value.informationRatio.value).toBeCloseTo(0, 10);
    }
  });

  it("property: a series regressed against itself has beta 1, R2 1, tracking error 0", () => {
    const result = betaAlpha(benchmark, benchmark, 1, rf, { asOf: asOfDate });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.beta).toBeCloseTo(1, 10);
    expect(result.value.r2).toBeCloseTo(1, 10);
    expect(result.value.trackingError).toBeCloseTo(0, 10);
  });

  it("returns n/a 'empty_series' for an empty fund series", () => {
    expect(betaAlpha([], benchmark, 1, rf)).toEqual({ ok: false, reason: "empty_series" });
  });

  it("returns n/a 'insufficient_benchmark_history' when the benchmark has no data in the fund's window", () => {
    const disjointBenchmark: NavSeries = [{ date: "2010-01-01", nav: 100 }];
    const result = betaAlpha(fund, disjointBenchmark, 1, rf, { asOf: asOfDate });
    expect(result).toEqual({ ok: false, reason: "insufficient_benchmark_history" });
  });
});

describe("upDownCapture", () => {
  // 5 month-end NAV points: 2023-01-31 is the "full months only" baseline
  // (series.ts's resampleMonthly treats a non-day-1 first date as not yet a
  // full month); Feb/Mar/Apr/May are the 4 full-month returns. `asOf` is
  // exactly one calendar year after the baseline, same alignment trick as
  // the betaAlpha fixture above, so the window covers the whole cluster.
  // Benchmark alternates up/down (+10%, -10%, +5%, -5%); fund's own returns
  // are picked independently (+12%, -8%, +6%, -4%) so up/down capture are
  // not trivially 1.
  const benchmark: NavSeries = [
    { date: "2023-01-31", nav: 100 },
    { date: "2023-02-28", nav: 110 }, // +10% (up)
    { date: "2023-03-31", nav: 99 }, // -10% (down)
    { date: "2023-04-30", nav: 103.95 }, // +5% (up)
    { date: "2023-05-31", nav: 98.7525 }, // -5% (down)
  ];
  const fund: NavSeries = [
    { date: "2023-01-31", nav: 100 },
    { date: "2023-02-28", nav: 112 }, // +12%
    { date: "2023-03-31", nav: 103.04 }, // -8%
    { date: "2023-04-30", nav: 109.2224 }, // +6%
    { date: "2023-05-31", nav: 104.853504 }, // -4%
  ];
  const asOfDate = "2024-01-31";

  it("ratios the geometric mean of fund vs benchmark returns, separately for up and down months", () => {
    const result = upDownCapture(fund, benchmark, 1, { asOf: asOfDate });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const geoMean = (rs: number[]) => Math.pow(rs.reduce((p, r) => p * (1 + r), 1), 1 / rs.length) - 1;
    const upBenchGeo = geoMean([0.1, 0.05]);
    const upFundGeo = geoMean([0.12, 0.06]);
    const downBenchGeo = geoMean([-0.1, -0.05]);
    const downFundGeo = geoMean([-0.08, -0.04]);

    expect(result.value.upCapture).toEqual({ ok: true, value: expect.any(Number) });
    if (result.value.upCapture.ok) {
      expect(result.value.upCapture.value).toBeCloseTo(upFundGeo / upBenchGeo, 10);
    }
    if (result.value.downCapture.ok) {
      expect(result.value.downCapture.value).toBeCloseTo(downFundGeo / downBenchGeo, 10);
    }
  });

  it("returns n/a 'no_down_months' when the benchmark never declines", () => {
    const allUpBenchmark: NavSeries = [
      { date: "2023-01-31", nav: 100 },
      { date: "2023-02-28", nav: 110 },
      { date: "2023-03-31", nav: 121 },
    ];
    const allUpFund: NavSeries = [
      { date: "2023-01-31", nav: 100 },
      { date: "2023-02-28", nav: 112 },
      { date: "2023-03-31", nav: 123.2 },
    ];
    const result = upDownCapture(allUpFund, allUpBenchmark, 1, { asOf: asOfDate });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.downCapture).toEqual({ ok: false, reason: "no_down_months" });
  });

  it("returns n/a 'empty_series' for an empty fund series", () => {
    expect(upDownCapture([], benchmark, 1)).toEqual({ ok: false, reason: "empty_series" });
  });

  it("returns n/a 'insufficient_benchmark_history' when the benchmark has no data in the fund's window", () => {
    const disjointBenchmark: NavSeries = [{ date: "2010-01-01", nav: 100 }];
    const result = upDownCapture(fund, disjointBenchmark, 1, { asOf: asOfDate });
    expect(result).toEqual({ ok: false, reason: "insufficient_benchmark_history" });
  });
});
