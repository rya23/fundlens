import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAmfiNavAll } from "./amfi-navall";

const fixturePath = fileURLToPath(new URL("../__fixtures__/amfi-navall.txt", import.meta.url));
const fixture = readFileSync(fixturePath, "utf-8");

describe("parseAmfiNavAll", () => {
  it("parses a data row into a typed record with its section context", () => {
    const records = parseAmfiNavAll(fixture);
    const ppfas = records.find((r) => r.schemeCode === 122639);

    expect(ppfas).toEqual({
      schemeCode: 122639,
      isinGrowth: "INF879O01027",
      isinDivReinvestment: null,
      schemeName: "Parag Parikh Flexi Cap Fund",
      plan: "Direct Plan",
      option: "Growth",
      nav: 89.2332,
      date: "2026-10-30",
      schemeType: "Open Ended Schemes",
      category: "Equity Scheme - Flexi Cap Fund",
      amc: "PPFAS Mutual Fund",
    });
  });

  it("treats a lone '-' ISIN field as null but keeps a real ISIN", () => {
    const records = parseAmfiNavAll(fixture);
    const withReinvestment = records.find((r) => r.schemeCode === 154045);

    expect(withReinvestment?.isinGrowth).toBe("INF2JJD01128");
    expect(withReinvestment?.isinDivReinvestment).toBe("INF2JJD01110");

    const withoutReinvestment = records.find((r) => r.schemeCode === 154043);
    expect(withoutReinvestment?.isinDivReinvestment).toBeNull();
  });

  it("converts AMFI's DD-Mon-YYYY date to ISO yyyy-mm-dd", () => {
    const records = parseAmfiNavAll(fixture);
    expect(records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
  });

  it("attributes each record to the AMC and category header it falls under", () => {
    const records = parseAmfiNavAll(fixture);
    const abakkus = records.find((r) => r.schemeCode === 154043);
    expect(abakkus?.amc).toBe("Abakkus Mutual Fund");
    expect(abakkus?.category).toBe("Equity Scheme - Flexi Cap Fund");

    const aditya = records.find((r) => r.schemeCode === 119528);
    expect(aditya?.amc).toBe("Aditya Birla Sun Life Mutual Fund");
    expect(aditya?.category).toBe("Equity Scheme - Large Cap Fund");
  });

  it("records the same scheme category text under both of AMFI's wording variants", () => {
    const records = parseAmfiNavAll(fixture);
    const singular = records.find((r) => r.schemeName === "Bandhan Value Fund");
    const plural = records.find((r) => r.schemeName === "Bandhan Contra Fund");

    expect(singular?.category).toBe("Equity Scheme - Value Fund");
    expect(plural?.category).toBe("Equity Schemes - Contra Fund");
  });

  it("leaves plan and option null for legacy rows with no plan/option split", () => {
    const records = parseAmfiNavAll(fixture);
    const legacy = records.find((r) => r.schemeCode === 101098);

    expect(legacy?.plan).toBeNull();
    expect(legacy?.option).toBeNull();
    expect(legacy?.schemeName).toBe("ICICI Prudential Child Care -Study Plan");
    expect(legacy?.category).toBe("Income");
  });

  it("parses a 'N.A.' NAV as null instead of NaN", () => {
    const withNa = [
      "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date",
      "",
      "Open Ended Schemes(Debt Scheme - Gilt Fund)",
      "",
      "Some Mutual Fund",
      "",
      "999001;INF000000001;-;Some Suspended Gilt Fund;Direct Plan;Growth;N.A.;30-Oct-2026",
    ].join("\r\n");

    const records = parseAmfiNavAll(withNa);
    expect(records).toHaveLength(1);
    expect(records[0].nav).toBeNull();
  });

  it("skips blank lines and the leading header row without producing phantom records", () => {
    const records = parseAmfiNavAll(fixture);
    expect(records.every((r) => Number.isInteger(r.schemeCode) && r.schemeCode > 0)).toBe(true);
  });

  it("returns an empty array for an empty document", () => {
    expect(parseAmfiNavAll("")).toEqual([]);
  });
});
