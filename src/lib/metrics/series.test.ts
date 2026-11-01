import { describe, expect, it } from "vitest";
import {
  addDays,
  alignByDate,
  alignSeries,
  asOf,
  firstOnOrAfter,
  resample,
  resampleMonthly,
  resampleWeekly,
  simpleReturns,
  subtractYears,
} from "./series";
import type { NavSeries } from "./series";

const series: NavSeries = [
  { date: "2024-01-01", nav: 10 },
  { date: "2024-01-03", nav: 11 },
  { date: "2024-01-05", nav: 12 },
];

describe("asOf", () => {
  it("returns the exact point when the date matches", () => {
    expect(asOf(series, "2024-01-03")).toEqual({ date: "2024-01-03", nav: 11 });
  });

  it("returns the last available point on or before a weekend/holiday gap", () => {
    // 2024-01-04 has no NAV (e.g. weekend); last available on/before is 01-03.
    expect(asOf(series, "2024-01-04")).toEqual({ date: "2024-01-03", nav: 11 });
  });

  it("returns undefined when the date is before the first point", () => {
    expect(asOf(series, "2023-12-31")).toBeUndefined();
  });

  it("returns the last point when the date is after the last point", () => {
    expect(asOf(series, "2024-06-01")).toEqual({ date: "2024-01-05", nav: 12 });
  });

  it("returns undefined for an empty series", () => {
    expect(asOf([], "2024-01-01")).toBeUndefined();
  });
});

describe("firstOnOrAfter", () => {
  it("returns the exact point when the date matches", () => {
    expect(firstOnOrAfter(series, "2024-01-03")).toEqual({ date: "2024-01-03", nav: 11 });
  });

  it("returns the next available point after a gap (SIP due-date lookup)", () => {
    // Due date 01-04 has no NAV; the instalment should buy at the next NAV, 01-05.
    expect(firstOnOrAfter(series, "2024-01-04")).toEqual({ date: "2024-01-05", nav: 12 });
  });

  it("returns undefined when the date is after the last point", () => {
    expect(firstOnOrAfter(series, "2024-06-01")).toBeUndefined();
  });

  it("returns the first point when the date is before the first point", () => {
    expect(firstOnOrAfter(series, "2023-01-01")).toEqual({ date: "2024-01-01", nav: 10 });
  });
});

describe("addDays / subtractYears", () => {
  it("addDays advances across a month boundary", () => {
    expect(addDays("2024-01-28", 5)).toBe("2024-02-02");
  });

  it("subtractYears does exact calendar-anniversary subtraction", () => {
    expect(subtractYears("2024-03-15", 1)).toBe("2023-03-15");
    expect(subtractYears("2024-03-15", 3)).toBe("2021-03-15");
  });

  it("clamps Feb 29 to Feb 28 when the target year isn't a leap year", () => {
    // 2024 is a leap year; 2023, 1 year back, is not.
    expect(subtractYears("2024-02-29", 1)).toBe("2023-02-28");
  });

  it("lands back on Feb 29 when the target year is also a leap year", () => {
    expect(subtractYears("2024-02-29", 4)).toBe("2020-02-29");
  });
});

describe("alignByDate / alignSeries", () => {
  it("intersects two date-sorted arrays on exactly matching dates", () => {
    const a = [
      { date: "2024-01-01", nav: 10 },
      { date: "2024-01-02", nav: 11 },
      { date: "2024-01-04", nav: 13 },
    ];
    const b = [
      { date: "2024-01-01", nav: 100 },
      { date: "2024-01-03", nav: 110 },
      { date: "2024-01-04", nav: 120 },
    ];

    expect(alignSeries(a, b)).toEqual({
      dates: ["2024-01-01", "2024-01-04"],
      a: [10, 13],
      b: [100, 120],
    });
  });

  it("returns an empty alignment when there are no common dates", () => {
    const a = [{ date: "2024-01-01", nav: 10 }];
    const b = [{ date: "2024-02-01", nav: 10 }];
    expect(alignByDate(a, b)).toEqual([]);
  });
});

describe("resampleWeekly", () => {
  it("dates each point on that week's Friday, using the last NAV on or before it", () => {
    // 2024-01-05 is a Friday. Weekend after it has no NAV.
    const daily: NavSeries = [
      { date: "2024-01-03", nav: 10 }, // Wed
      { date: "2024-01-04", nav: 10.5 }, // Thu
      { date: "2024-01-05", nav: 11 }, // Fri - exact match
      { date: "2024-01-08", nav: 12 }, // Mon
      { date: "2024-01-10", nav: 13 }, // Wed
      // 2024-01-12 (Fri) is a holiday with no NAV; last available is 01-10.
      { date: "2024-01-15", nav: 14 }, // Mon, next week
    ];

    expect(resampleWeekly(daily)).toEqual([
      { date: "2024-01-05", nav: 11 },
      { date: "2024-01-12", nav: 13 },
    ]);
  });

  it("returns an empty series for an empty input", () => {
    expect(resampleWeekly([])).toEqual([]);
  });
});

describe("resampleMonthly", () => {
  it("keeps only full calendar months plus the leading baseline, over a Feb-2020 leap year", () => {
    const daily: NavSeries = [
      { date: "2020-01-15", nav: 100 }, // mid-Jan: inception, Jan is partial
      { date: "2020-01-31", nav: 101 },
      { date: "2020-02-28", nav: 103 },
      { date: "2020-02-29", nav: 104 }, // leap day
      { date: "2020-03-31", nav: 110 },
      { date: "2020-04-10", nav: 111 }, // mid-Apr: data ends mid-month, Apr is partial
    ];

    expect(resampleMonthly(daily)).toEqual([
      { date: "2020-01-31", nav: 101 }, // baseline (Jan itself not counted as full)
      { date: "2020-02-29", nav: 104 }, // full Feb, including the leap day
      { date: "2020-03-31", nav: 110 }, // full March
      // April dropped: data stops at 04-10, well short of 04-30.
    ]);
  });

  it("returns an empty series for an empty input", () => {
    expect(resampleMonthly([])).toEqual([]);
  });
});

describe("resample", () => {
  it("'daily' is the identity", () => {
    expect(resample(series, "daily")).toEqual(series);
  });

  it("dispatches to resampleWeekly / resampleMonthly", () => {
    expect(resample(series, "weekly")).toEqual(resampleWeekly(series));
    expect(resample(series, "monthly")).toEqual(resampleMonthly(series));
  });
});

describe("simpleReturns", () => {
  it("computes period-over-period simple returns dated on the period end", () => {
    const s: NavSeries = [
      { date: "2024-01-01", nav: 10 },
      { date: "2024-01-02", nav: 11 },
      { date: "2024-01-03", nav: 9.9 },
    ];
    const result = simpleReturns(s);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2024-01-02");
    expect(result[0].value).toBeCloseTo(0.1, 10);
    expect(result[1].date).toBe("2024-01-03");
    expect(result[1].value).toBeCloseTo(9.9 / 11 - 1, 10);
  });

  it("returns [] for a series with fewer than 2 points", () => {
    expect(simpleReturns([])).toEqual([]);
    expect(simpleReturns([{ date: "2024-01-01", nav: 10 }])).toEqual([]);
  });

  it("skips a period whose preceding NAV is zero or negative", () => {
    const s: NavSeries = [
      { date: "2024-01-01", nav: 0 },
      { date: "2024-01-02", nav: 11 },
      { date: "2024-01-03", nav: 12 },
    ];
    expect(simpleReturns(s)).toEqual([{ date: "2024-01-03", value: 12 / 11 - 1 }]);
  });
});
