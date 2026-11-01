import { describe, expect, it } from "vitest";

import { generateSyntheticUniverse, SYNTHETIC_CODE_BASE } from "./synthetic";

const universe = generateSyntheticUniverse();

describe("generateSyntheticUniverse", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(generateSyntheticUniverse()).toEqual(universe);
    expect(generateSyntheticUniverse(7).schemes[0].name).not.toBe(universe.schemes[0].name);
  });

  it("builds four plan/option variants per fund with unique codes and names", () => {
    const direct = universe.schemes.filter((s) => s.plan === "direct" && s.option === "growth");
    expect(universe.schemes).toHaveLength(direct.length * 4);
    expect(new Set(universe.schemes.map((s) => s.schemeCode)).size).toBe(universe.schemes.length);
    expect(new Set(universe.schemes.map((s) => s.name)).size).toBe(universe.schemes.length);
    expect(Math.min(...universe.schemes.map((s) => s.schemeCode))).toBe(SYNTHETIC_CODE_BASE);
    expect(direct.length).toBeGreaterThan(300);
  });

  it("includes long names and an AMC that needs truncating", () => {
    expect(Math.max(...universe.schemes.map((s) => s.name.length))).toBeGreaterThan(80);
  });

  it("only gives benchmark-relative metrics to mapped equity categories, mirroring classify.ts", () => {
    const byCode = new Map(universe.metrics.map((m) => [m.schemeCode, m.values]));
    for (const s of universe.schemes) {
      const v = byCode.get(s.schemeCode)!;
      if (s.category !== "Equity" || s.subCategory === "Sectoral/Thematic Fund") {
        expect(v.alpha3y ?? null).toBeNull();
        expect(v.beta3y ?? null).toBeNull();
      }
    }
  });

  it("leaves history-dependent metrics null for young funds", () => {
    const youngCodes = universe.metrics.filter((m) => m.values.cagr3y === null).map((m) => m.schemeCode);
    expect(youngCodes.length).toBeGreaterThan(0);
    for (const m of universe.metrics.filter((x) => youngCodes.includes(x.schemeCode))) {
      expect(m.values.sharpe3y).toBeNull();
      expect(m.values.cagr5y).toBeNull();
    }
  });

  it("stores returns as fractions (a 3Y CAGR above 1 would mean 100%+)", () => {
    for (const m of universe.metrics) {
      const v = m.values.cagr3y;
      if (v !== null && v !== undefined) {
        expect(v).toBeGreaterThan(-0.5);
        expect(v).toBeLessThan(0.7);
      }
    }
  });

  it("produces ordered quartile cut points per category and metric", () => {
    expect(universe.categoryStats.length).toBeGreaterThan(100);
    for (const stat of universe.categoryStats) {
      expect(stat.cutQ1).toBeLessThanOrEqual(stat.cutQ2);
      expect(stat.cutQ2).toBeLessThanOrEqual(stat.cutQ3);
      expect(stat.count).toBeGreaterThan(0);
    }
  });
});
