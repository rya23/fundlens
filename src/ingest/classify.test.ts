import { describe, expect, it } from "vitest";
import { classifyOption, classifyPlan, getBenchmarkMapping, normalizeCategory } from "./classify";

describe("classifyPlan", () => {
  it.each([
    ["Parag Parikh Flexi Cap Fund - Direct Plan - Growth", "direct"],
    ["Parag Parikh Flexi Cap Fund - Regular Plan - Growth", "regular"],
    ["Direct Plan", "direct"],
    ["Regular Plan", "regular"],
    ["Quant Flexi Cap Fund Direct Growth", "direct"],
    ["HDFC NIFTY 100 Equal Weight Index Fund - Direct Plan - Growth Option", "direct"],
  ])("classifies %s as %s", (name, expected) => {
    expect(classifyPlan(name)).toBe(expected);
  });

  it("returns 'unknown' for a legacy name with no Direct/Regular split", () => {
    expect(classifyPlan("ICICI Prudential Blended Plan B")).toBe("unknown");
  });

  it("returns 'unknown' for an empty string (AMFI's legacy blank Plan field)", () => {
    expect(classifyPlan("")).toBe("unknown");
  });
});

describe("classifyOption", () => {
  it.each([
    ["Parag Parikh Flexi Cap Fund - Direct Plan - Growth", "growth"],
    ["Growth", "growth"],
    ["Growth Option", "growth"],
    ["Annual IDCW", "idcw"],
    ["Monthly IDCW Payout", "idcw"],
    ["IDCW", "idcw"],
    ["Bonus Option", "idcw"],
    ["ABN AMRO Dividend Yield Fund-Dividend Option", "idcw"],
  ])("classifies %s as %s", (name, expected) => {
    expect(classifyOption(name)).toBe(expected);
  });

  it("picks the trailing option, not the word 'Dividend' embedded in a category name", () => {
    // "Dividend Yield Fund" is a SEBI equity category, not a distribution option;
    // this fund's actual option (at the end of the name) is Growth.
    expect(classifyOption("ABN AMRO Dividend Yield Fund-Growth Option")).toBe("growth");
    expect(classifyOption("HSBC Asia Pacific (Ex Japan) Dividend Yield Fund - Direct Plan - Growth")).toBe("growth");
  });

  it("recognises a standalone 'Div' abbreviation distinct from the word 'Dividend'", () => {
    expect(classifyOption("Tata Dividend Yield Fund  Regular Plan -( Div)")).toBe("idcw");
  });

  it("returns 'unknown' when neither Growth nor IDCW keywords appear", () => {
    expect(classifyOption("Some Future Option Nobody Has Used Yet")).toBe("unknown");
  });

  it("returns 'unknown' for an empty string (AMFI's legacy blank Option field)", () => {
    expect(classifyOption("")).toBe("unknown");
  });
});

describe("normalizeCategory", () => {
  it.each([
    ["Equity Scheme - Flexi Cap Fund", "Equity", "Flexi Cap Fund"],
    ["Equity Schemes - Flexi Cap Fund", "Equity", "Flexi Cap Fund"],
    ["Equity Scheme - Large Cap Fund", "Equity", "Large Cap Fund"],
    ["Equity Scheme - Large & Mid Cap Fund", "Equity", "Large & Mid Cap Fund"],
    ["Debt Scheme - Banking and PSU Fund", "Debt", "Banking and PSU Fund"],
    ["Hybrid Scheme - Aggressive Hybrid Fund", "Hybrid", "Aggressive Hybrid Fund"],
    ["Hybrid Schemes - Aggressive Hybrid Fund", "Hybrid", "Aggressive Hybrid Fund"],
    ["Other Scheme - Index Funds", "Other", "Index Funds"],
    ["Solution Oriented Scheme - Retirement Fund", "Solution Oriented", "Retirement Fund"],
  ])("normalises %s to group %s / %s", (raw, group, subCategory) => {
    const result = normalizeCategory(raw);
    expect(result.group).toBe(group);
    expect(result.subCategory).toBe(subCategory);
    expect(result.raw).toBe(raw);
  });

  it("maps AMFI's inconsistent ELSS wording to one canonical sub-category", () => {
    expect(normalizeCategory("Equity Scheme - ELSS").subCategory).toBe("ELSS");
    expect(normalizeCategory("Equity Schemes - ELSS- Tax Saver Fund").subCategory).toBe("ELSS");
  });

  it("maps the Sectoral/Thematic wording variants to one canonical sub-category", () => {
    expect(normalizeCategory("Equity Scheme - Sectoral/ Thematic").subCategory).toBe("Sectoral/Thematic Fund");
    expect(normalizeCategory("Equity Schemes - Sectoral Fund").subCategory).toBe("Sectoral/Thematic Fund");
    expect(normalizeCategory("Equity Schemes - Thematic Fund").subCategory).toBe("Sectoral/Thematic Fund");
  });

  it("maps the Balanced Advantage wording variants to one canonical sub-category", () => {
    expect(
      normalizeCategory("Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage").subCategory
    ).toBe("Dynamic Asset Allocation / Balanced Advantage Fund");
    expect(
      normalizeCategory("Hybrid Schemes - Balanced Advantage Fund/ Dynamic Asset Allocation").subCategory
    ).toBe("Dynamic Asset Allocation / Balanced Advantage Fund");
  });

  it("tolerates the '**' footnote marker AMFI sometimes adds to Solution Oriented headers", () => {
    const result = normalizeCategory("Solution Oriented Schemes ** - Retirement Fund");
    expect(result.group).toBe("Solution Oriented");
    expect(result.subCategory).toBe("Retirement Fund");
  });

  it("falls back to 'Unclassified' with the raw text preserved for a pre-2018 legacy category", () => {
    const result = normalizeCategory("Income");
    expect(result.group).toBe("Unclassified");
    expect(result.subCategory).toBe("Income");
    expect(result.raw).toBe("Income");
  });
});

describe("getBenchmarkMapping", () => {
  it("maps each equity sub-category to its PLAN.md-specified TRI, with a fallback index-fund scheme code", () => {
    const largeCap = getBenchmarkMapping(normalizeCategory("Equity Scheme - Large Cap Fund"));
    expect(largeCap.triName).toBe("NIFTY 100 TRI");
    expect(largeCap.fallbackSchemeCode).toBeTypeOf("number");

    const midCap = getBenchmarkMapping(normalizeCategory("Equity Scheme - Mid Cap Fund"));
    expect(midCap.triName).toBe("NIFTY MIDCAP 150 TRI");

    const smallCap = getBenchmarkMapping(normalizeCategory("Equity Scheme - Small Cap Fund"));
    expect(smallCap.triName).toBe("NIFTY SMALLCAP 250 TRI");

    const largeMid = getBenchmarkMapping(normalizeCategory("Equity Scheme - Large & Mid Cap Fund"));
    expect(largeMid.triName).toBe("NIFTY LARGEMIDCAP 250 TRI");

    for (const category of ["Equity Scheme - Flexi Cap Fund", "Equity Scheme - Multi Cap Fund", "Equity Scheme - ELSS", "Equity Scheme - Focused Fund"]) {
      expect(getBenchmarkMapping(normalizeCategory(category)).triName).toBe("NIFTY 500 TRI");
    }
  });

  it("marks Sectoral/Thematic as n/a (too heterogeneous for one TRI) with a documented rationale", () => {
    const mapping = getBenchmarkMapping(normalizeCategory("Equity Scheme - Sectoral/ Thematic"));
    expect(mapping.triName).toBeNull();
    expect(mapping.fallbackSchemeCode).toBeNull();
    expect(mapping.rationale.length).toBeGreaterThan(0);
  });

  it("marks every Debt sub-category as n/a with a documented rationale", () => {
    const mapping = getBenchmarkMapping(normalizeCategory("Debt Scheme - Gilt Fund"));
    expect(mapping.triName).toBeNull();
    expect(mapping.fallbackSchemeCode).toBeNull();
    expect(mapping.rationale.length).toBeGreaterThan(0);
  });

  it("marks every Hybrid sub-category as n/a with a documented rationale", () => {
    const mapping = getBenchmarkMapping(normalizeCategory("Hybrid Scheme - Aggressive Hybrid Fund"));
    expect(mapping.triName).toBeNull();
    expect(mapping.rationale.length).toBeGreaterThan(0);
  });

  it("marks Unclassified/Other/Solution Oriented categories as n/a", () => {
    expect(getBenchmarkMapping(normalizeCategory("Income")).triName).toBeNull();
    expect(getBenchmarkMapping(normalizeCategory("Other Scheme - Index Funds")).triName).toBeNull();
    expect(getBenchmarkMapping(normalizeCategory("Solution Oriented Scheme - Retirement Fund")).triName).toBeNull();
  });
});
