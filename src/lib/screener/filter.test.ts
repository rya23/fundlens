import { describe, expect, it } from "vitest";

import { columnExtent, facetCounts, filterRows } from "./filter";
import { defaultState } from "./state";
import { makeRow } from "./test-fixtures";

const rows = [
  makeRow({ code: 1, name: "Kestrel Flexi Cap Fund", amc: "Kestrel Mutual Fund", cagr3y: 18, sharpe3y: 1.2, terPct: 0.6 }),
  makeRow({ code: 2, name: "Bluepeak Large Cap Fund", amc: "Bluepeak Mutual Fund", subCategory: "Large Cap Fund", cagr3y: 12, sharpe3y: null, terPct: 0.4, riskometer: "High" }),
  makeRow({ code: 3, name: "Bluepeak Liquid Fund", amc: "Bluepeak Mutual Fund", group: "Debt", subCategory: "Liquid Fund", cagr3y: 7, sharpe3y: 0.2, terPct: 0.15, riskometer: "Low" }),
  makeRow({ code: 4, name: "Kestrel Flexi Cap Fund Regular", plan: "regular", cagr3y: 17, terPct: 1.5 }),
  makeRow({ code: 5, name: "Kestrel Flexi Cap Fund IDCW", option: "idcw", cagr3y: 16.5, terPct: 0.6 }),
];

const codes = (list: typeof rows) => list.map((r) => r.code);

describe("filterRows", () => {
  it("applies the default plan and option (Direct Growth) and nothing else", () => {
    expect(codes(filterRows(rows, defaultState()))).toEqual([1, 2, 3]);
  });

  it("shows Regular and IDCW when toggled on", () => {
    const state = { ...defaultState(), plans: ["direct" as const, "regular" as const], options: ["growth" as const, "idcw" as const] };
    expect(codes(filterRows(rows, state))).toEqual([1, 2, 3, 4, 5]);
  });

  it("matches list filters on group, sub-category, AMC and riskometer, ANDed together", () => {
    const s = defaultState();
    expect(codes(filterRows(rows, { ...s, groups: ["Debt"] }))).toEqual([3]);
    expect(codes(filterRows(rows, { ...s, categories: ["Large Cap Fund", "Liquid Fund"] }))).toEqual([2, 3]);
    expect(codes(filterRows(rows, { ...s, amcs: ["Bluepeak Mutual Fund"] }))).toEqual([2, 3]);
    expect(codes(filterRows(rows, { ...s, amcs: ["Bluepeak Mutual Fund"], riskometers: ["Low"] }))).toEqual([3]);
  });

  it("searches name and AMC case-insensitively, requiring every term", () => {
    const s = defaultState();
    expect(codes(filterRows(rows, { ...s, q: "BLUEPEAK" }))).toEqual([2, 3]);
    expect(codes(filterRows(rows, { ...s, q: "bluepeak liquid" }))).toEqual([3]);
    expect(codes(filterRows(rows, { ...s, q: "liquid kestrel" }))).toEqual([]);
    expect(codes(filterRows(rows, { ...s, q: "  " }))).toEqual([1, 2, 3]);
  });

  it("applies inclusive min/max ranges", () => {
    const s = defaultState();
    expect(codes(filterRows(rows, { ...s, ranges: { cagr3y: { min: 12 } } }))).toEqual([1, 2]);
    expect(codes(filterRows(rows, { ...s, ranges: { cagr3y: { min: 12, max: 12 } } }))).toEqual([2]);
    expect(codes(filterRows(rows, { ...s, ranges: { terPct: { max: 0.4 } } }))).toEqual([2, 3]);
  });

  it("excludes rows with no value for a column that has an active range", () => {
    const s = defaultState();
    expect(codes(filterRows(rows, { ...s, ranges: { sharpe3y: { min: 0 } } }))).toEqual([1, 3]);
  });

  it("ignores an empty range object", () => {
    expect(codes(filterRows(rows, { ...defaultState(), ranges: { sharpe3y: {} } }))).toEqual([1, 2, 3]);
  });

  it("combines range filters across columns", () => {
    const s = { ...defaultState(), ranges: { cagr3y: { min: 10 }, terPct: { max: 0.5 } } };
    expect(codes(filterRows(rows, s))).toEqual([2]);
  });

  it("returns nothing, not everything, when no row matches", () => {
    expect(filterRows(rows, { ...defaultState(), q: "zzz" })).toEqual([]);
  });
});

describe("columnExtent", () => {
  it("returns the observed min and max, skipping nulls", () => {
    expect(columnExtent(rows, "sharpe3y")).toEqual({ min: 0.2, max: 1.2 });
  });
  it("returns undefined when every value is null", () => {
    expect(columnExtent(rows, "cagr10y")).toBeUndefined();
  });
});

describe("facetCounts", () => {
  it("counts distinct values alphabetically and skips nulls", () => {
    const counts = facetCounts(rows, (r) => r.riskometer);
    expect(counts).toEqual([
      { value: "High", count: 1 },
      { value: "Low", count: 1 },
      { value: "Very High", count: 3 },
    ]);
  });
});
