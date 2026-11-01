import { describe, expect, it } from "vitest";

import { ageInYears, buildCuts, buildRow, type StoredScheme } from "./rows";

const scheme: StoredScheme = {
  schemeCode: 120503,
  name: "Kestrel Flexi Cap Fund - Direct Plan - Growth",
  amc: "Kestrel Mutual Fund",
  category: "Equity",
  subCategory: "Flexi Cap Fund",
  plan: "direct",
  option: "growth",
  inceptionDate: "2016-10-30",
  terPct: 0.45,
  aumCr: 12345.67,
  riskometer: "Very High",
  exitLoad: "1% within 1 year",
};

describe("buildRow", () => {
  it("scales stored fractions to display percentages and leaves ratios and metadata as they are", () => {
    const row = buildRow(scheme, { cagr3y: 0.1234, sharpe3y: 1.23, maxDrawdown5y: -0.3125, upCapture3y: 1.05, beta3y: 0.97 }, "2026-10-30");
    expect(row.cagr3y).toBe(12.34);
    expect(row.sharpe3y).toBe(1.23);
    expect(row.maxDrawdown5y).toBe(-31.25);
    expect(row.upCapture3y).toBe(105);
    expect(row.beta3y).toBe(0.97);
    expect(row.terPct).toBe(0.45);
    expect(row.aumCr).toBe(12345.67);
  });

  it("removes float noise from the scaling", () => {
    expect(buildRow(scheme, { cagr1y: 0.1234 }, "2026-10-30").cagr1y).toBe(12.34);
    expect(buildRow(scheme, { cagr1y: 0.07 }, "2026-10-30").cagr1y).toBe(7);
  });

  it("keeps unknown metrics null and tolerates a scheme with no metrics row", () => {
    const row = buildRow(scheme, undefined, "2026-10-30");
    expect(row.cagr3y).toBeNull();
    expect(row.terPct).toBe(0.45);
    expect(row.name).toBe(scheme.name);
  });

  it("falls back to Unclassified when the sub-category is missing", () => {
    expect(buildRow({ ...scheme, subCategory: null }, undefined, "2026-10-30").subCategory).toBe("Unclassified");
  });

  it("derives fund age from inception relative to the reference date", () => {
    expect(buildRow(scheme, undefined, "2026-10-30").ageYears).toBe(10);
    expect(ageInYears(null, "2026-10-30")).toBeNull();
    expect(ageInYears("2027-01-01", "2026-10-30")).toBeNull();
    expect(ageInYears("2026-04-30", "2026-10-30")).toBe(0.5);
  });
});

describe("buildCuts", () => {
  it("scales cut points like values and keys them by sub-category then metric", () => {
    const cuts = buildCuts([
      { category: "Flexi Cap Fund", metric: "cagr3y", count: 20, cutQ1: 0.12, cutQ2: 0.15, cutQ3: 0.18 },
      { category: "Flexi Cap Fund", metric: "terPct", count: 20, cutQ1: 0.5, cutQ2: 0.7, cutQ3: 0.9 },
    ]);
    expect(cuts["Flexi Cap Fund"]?.cagr3y).toEqual({ q1: 12, q2: 15, q3: 18, count: 20 });
    expect(cuts["Flexi Cap Fund"]?.terPct).toEqual({ q1: 0.5, q2: 0.7, q3: 0.9, count: 20 });
  });

  it("skips unknown metrics and incomplete cut points", () => {
    const cuts = buildCuts([
      { category: "X", metric: "mystery", count: 9, cutQ1: 1, cutQ2: 2, cutQ3: 3 },
      { category: "X", metric: "cagr3y", count: 9, cutQ1: null, cutQ2: 2, cutQ3: 3 },
    ]);
    expect(cuts).toEqual({});
  });
});
