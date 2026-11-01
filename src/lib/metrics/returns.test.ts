import { describe, expect, it } from "vitest";
import {
  pctRollingWindowsBeatingBenchmark,
  rollingCAGR,
  trailingCAGR,
  trailingReturn,
} from "./returns";
import type { RollingReturnDistribution } from "./returns";
import type { NavSeries } from "./series";

// 3 years, 10% CAGR: NAV_start=100 -> NAV_end = 100 * 1.1^3 = 133.1
const threeYearSeries: NavSeries = [
  { date: "2021-03-15", nav: 100 },
  { date: "2024-03-15", nav: 133.1 },
];

describe("trailingCAGR", () => {
  it("computes CAGR using the last NAV on or before the start date", () => {
    const result = trailingCAGR(threeYearSeries, 3, { asOf: "2024-03-15" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(0.1, 6);
  });

  it("falls back to the last available NAV on or before the start anniversary (weekend/holiday)", () => {
    // The 3Y-ago anniversary of 2024-03-18 is 2021-03-18 (a Thursday), but
    // there's no NAV that day; the last available on/before it is 2021-03-14.
    const series: NavSeries = [
      { date: "2021-03-14", nav: 100 },
      { date: "2024-03-18", nav: 110 },
    ];
    const result = trailingCAGR(series, 3, { asOf: "2024-03-18" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(Math.pow(110 / 100, 1 / 3) - 1, 6);
  });

  it("returns n/a with 'insufficient_history' when the fund's history is shorter than the window", () => {
    const shortSeries: NavSeries = [
      { date: "2023-06-01", nav: 100 },
      { date: "2024-03-15", nav: 108 },
    ];
    const result = trailingCAGR(shortSeries, 3, { asOf: "2024-03-15" });
    expect(result).toEqual({ ok: false, reason: "insufficient_history" });
  });

  it("returns n/a with 'empty_series' for an empty series", () => {
    expect(trailingCAGR([], 1)).toEqual({ ok: false, reason: "empty_series" });
  });

  it("clamps a leap-day (Feb 29) start anniversary to Feb 28 in a non-leap target year", () => {
    // 1Y before 2024-02-29 (leap) is 2023-02-28 (2023 isn't a leap year).
    const series: NavSeries = [
      { date: "2023-02-28", nav: 100 },
      { date: "2024-02-29", nav: 110 },
    ];
    const result = trailingCAGR(series, 1, { asOf: "2024-02-29" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(0.1, 6);
  });

  it("defaults asOf to the series' last date when not given", () => {
    const result = trailingCAGR(threeYearSeries, 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(0.1, 6);
  });
});

describe("trailingReturn (sub-1Y windows use absolute, not annualised, return)", () => {
  it("returns the plain cumulative return for a 6-month window, not an annualised one", () => {
    const series: NavSeries = [
      { date: "2023-09-15", nav: 100 },
      { date: "2024-03-15", nav: 105 },
    ];
    const result = trailingReturn(series, 0.5, { asOf: "2024-03-15" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(0.05, 6);
  });

  it("rejects a non-positive window as invalid", () => {
    expect(trailingReturn(threeYearSeries, 0)).toEqual({ ok: false, reason: "invalid_window" });
    expect(trailingReturn(threeYearSeries, -1)).toEqual({ ok: false, reason: "invalid_window" });
  });
});

describe("rollingCAGR", () => {
  // Exactly 10% then exactly 20% 1Y CAGR, hand-computed: 110/100-ish via CAGR
  // formula with years=1 collapses to simple return, so these NAVs were
  // chosen so the ratios are exact.
  const yearly: NavSeries = [
    { date: "2020-01-01", nav: 100 },
    { date: "2021-01-01", nav: 110 }, // 110/100 -> 1Y CAGR = 0.10
    { date: "2022-01-01", nav: 132 }, // 132/110 -> 1Y CAGR = 0.20
  ];

  it("computes one rolling CAGR per end date that has a full window behind it, plus distribution stats", () => {
    const result = rollingCAGR(yearly, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.windowYears).toBe(1);
    expect(result.value.points).toHaveLength(2);
    expect(result.value.points[0].date).toBe("2021-01-01");
    expect(result.value.points[0].cagr).toBeCloseTo(0.1, 10);
    expect(result.value.points[1].date).toBe("2022-01-01");
    expect(result.value.points[1].cagr).toBeCloseTo(0.2, 10);

    expect(result.value.stats.count).toBe(2);
    expect(result.value.stats.min).toBeCloseTo(0.1, 10);
    expect(result.value.stats.max).toBeCloseTo(0.2, 10);
    expect(result.value.stats.mean).toBeCloseTo(0.15, 10);
    expect(result.value.stats.median).toBeCloseTo(0.15, 10);
  });

  it("returns n/a 'insufficient_history' when no end date has a full window behind it", () => {
    const tooShort: NavSeries = [
      { date: "2024-01-01", nav: 100 },
      { date: "2024-06-01", nav: 105 },
    ];
    expect(rollingCAGR(tooShort, 3)).toEqual({ ok: false, reason: "insufficient_history" });
  });

  it("returns n/a 'empty_series' for an empty series", () => {
    expect(rollingCAGR([], 1)).toEqual({ ok: false, reason: "empty_series" });
  });
});

describe("pctRollingWindowsBeatingBenchmark", () => {
  const fund: RollingReturnDistribution = {
    windowYears: 3,
    points: [
      { date: "2021-01-01", cagr: 0.12 },
      { date: "2022-01-01", cagr: 0.05 },
      { date: "2023-01-01", cagr: 0.2 },
    ],
    stats: { count: 3, min: 0.05, max: 0.2, mean: 0.1233, median: 0.12 },
  };
  const benchmark: RollingReturnDistribution = {
    windowYears: 3,
    points: [
      { date: "2021-01-01", cagr: 0.1 }, // fund beats (0.12 > 0.10)
      { date: "2022-01-01", cagr: 0.08 }, // fund loses (0.05 < 0.08)
      { date: "2023-01-01", cagr: 0.15 }, // fund beats (0.20 > 0.15)
    ],
    stats: { count: 3, min: 0.08, max: 0.15, mean: 0.11, median: 0.1 },
  };

  it("computes the fraction of overlapping windows where the fund beat the benchmark", () => {
    const result = pctRollingWindowsBeatingBenchmark(fund, benchmark);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(2 / 3, 10);
  });

  it("only compares windows with a matching end date (alignment)", () => {
    const partialBenchmark: RollingReturnDistribution = {
      ...benchmark,
      points: benchmark.points.slice(0, 2), // drop 2023-01-01
    };
    const result = pctRollingWindowsBeatingBenchmark(fund, partialBenchmark);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeCloseTo(1 / 2, 10);
  });

  it("returns n/a 'window_mismatch' when windowYears differ", () => {
    const result = pctRollingWindowsBeatingBenchmark(fund, { ...benchmark, windowYears: 5 });
    expect(result).toEqual({ ok: false, reason: "window_mismatch" });
  });

  it("returns n/a 'no_overlapping_windows' when no end dates match", () => {
    const disjoint: RollingReturnDistribution = {
      ...benchmark,
      points: [{ date: "2099-01-01", cagr: 0.1 }],
    };
    const result = pctRollingWindowsBeatingBenchmark(fund, disjoint);
    expect(result).toEqual({ ok: false, reason: "no_overlapping_windows" });
  });
});
