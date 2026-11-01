import { describe, expect, it } from "vitest";

import { cellQuartile } from "./quartile";
import type { CutsBySubCategory } from "./types";
import { makeRow } from "./test-fixtures";

const cuts: CutsBySubCategory = {
  "Flexi Cap Fund": {
    cagr3y: { q1: 12, q2: 15, q3: 18, count: 20 },
    terPct: { q1: 0.5, q2: 0.7, q3: 0.9, count: 20 },
    sharpe3y: { q1: 0.5, q2: 0.8, q3: 1.1, count: 3 },
    maxDrawdown5y: { q1: -30, q2: -25, q3: -20, count: 20 },
  },
};

describe("cellQuartile", () => {
  it("gives Q1 to the best quartile for higher-is-better metrics", () => {
    expect(cellQuartile(makeRow({ code: 1, cagr3y: 19 }), "cagr3y", cuts)).toBe(1);
    expect(cellQuartile(makeRow({ code: 1, cagr3y: 18 }), "cagr3y", cuts)).toBe(2);
    expect(cellQuartile(makeRow({ code: 1, cagr3y: 15 }), "cagr3y", cuts)).toBe(3);
    expect(cellQuartile(makeRow({ code: 1, cagr3y: 11 }), "cagr3y", cuts)).toBe(4);
  });

  it("gives Q1 to the lowest values for lower-is-better metrics", () => {
    expect(cellQuartile(makeRow({ code: 1, terPct: 0.3 }), "terPct", cuts)).toBe(1);
    expect(cellQuartile(makeRow({ code: 1, terPct: 1.2 }), "terPct", cuts)).toBe(4);
  });

  it("treats a shallower drawdown as better", () => {
    expect(cellQuartile(makeRow({ code: 1, maxDrawdown5y: -10 }), "maxDrawdown5y", cuts)).toBe(1);
    expect(cellQuartile(makeRow({ code: 1, maxDrawdown5y: -40 }), "maxDrawdown5y", cuts)).toBe(4);
  });

  it("is undefined for null values, unranked columns, unknown categories and thin categories", () => {
    expect(cellQuartile(makeRow({ code: 1, cagr3y: null }), "cagr3y", cuts)).toBeUndefined();
    expect(cellQuartile(makeRow({ code: 1, beta3y: 1 }), "beta3y", cuts)).toBeUndefined();
    expect(cellQuartile(makeRow({ code: 1, subCategory: "Gilt Fund", cagr3y: 8 }), "cagr3y", cuts)).toBeUndefined();
    expect(cellQuartile(makeRow({ code: 1, sharpe3y: 1 }), "sharpe3y", cuts)).toBeUndefined();
    expect(cellQuartile(makeRow({ code: 1, cagr10y: 12 }), "cagr10y", cuts)).toBeUndefined();
  });
});
