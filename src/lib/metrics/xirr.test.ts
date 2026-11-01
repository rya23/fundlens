import { describe, expect, it } from "vitest";
import { xirr, type Cashflow } from "./xirr";

describe("xirr", () => {
  it("solves the documented Microsoft/Excel XIRR example", () => {
    // https://support.microsoft.com/en-us/office/xirr-function - documented
    // example cashflows. Ground truth cross-checked independently with a
    // plain bisection script (not this implementation): 0.3733625335188314.
    const cashflows: Cashflow[] = [
      { date: new Date("2008-01-01"), amount: -10000 },
      { date: new Date("2008-03-01"), amount: 2750 },
      { date: new Date("2008-10-30"), amount: 4250 },
      { date: new Date("2009-02-15"), amount: 3250 },
      { date: new Date("2009-04-01"), amount: 2750 },
    ];

    const result = xirr(cashflows);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(0.3733625335188314, 6);
    }
  });

  it("returns exactly 10% for 1000 -> 1210 over exactly 2 years (730 days)", () => {
    const cashflows: Cashflow[] = [
      { date: new Date("2021-01-01"), amount: -1000 },
      { date: new Date("2023-01-01"), amount: 1210 },
    ];

    const result = xirr(cashflows);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(0.1, 6);
    }
  });

  it("is order-independent (sorts cashflows by date internally)", () => {
    const cashflows: Cashflow[] = [
      { date: new Date("2023-01-01"), amount: 1210 },
      { date: new Date("2021-01-01"), amount: -1000 },
    ];

    const result = xirr(cashflows);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(0.1, 6);
    }
  });

  it("flags a single cashflow as not computable", () => {
    const result = xirr([{ date: new Date("2023-01-01"), amount: -1000 }]);

    expect(result).toEqual({ ok: false, reason: "single-cashflow" });
  });

  it("flags an empty cashflow list as not computable", () => {
    const result = xirr([]);

    expect(result).toEqual({ ok: false, reason: "single-cashflow" });
  });

  it("flags all-outflow cashflows (no sign change) as not computable", () => {
    const cashflows: Cashflow[] = [
      { date: new Date("2024-01-01"), amount: -100 },
      { date: new Date("2024-02-01"), amount: -100 },
    ];

    const result = xirr(cashflows);

    expect(result).toEqual({ ok: false, reason: "no-sign-change" });
  });

  it("flags all-inflow cashflows (no sign change) as not computable", () => {
    const cashflows: Cashflow[] = [
      { date: new Date("2024-01-01"), amount: 100 },
      { date: new Date("2024-02-01"), amount: 100 },
    ];

    const result = xirr(cashflows);

    expect(result).toEqual({ ok: false, reason: "no-sign-change" });
  });

  it("flags an implied rate too extreme to bracket as no-convergence", () => {
    // Losing 1,000,000 down to 10 in a single week implies an annualised
    // rate infinitesimally close to -100%, outside any workable bracket.
    // Independently verified: NPV keeps the same sign across the entire
    // (-0.999999999, 1e7] search range.
    const cashflows: Cashflow[] = [
      { date: new Date("2024-01-01"), amount: -1_000_000 },
      { date: new Date("2024-01-08"), amount: 10 },
    ];

    const result = xirr(cashflows);

    expect(result).toEqual({ ok: false, reason: "no-convergence" });
  });

  it("flags cashflows that all fall on the same date as no-convergence (zero elapsed time is indeterminate)", () => {
    const cashflows: Cashflow[] = [
      { date: new Date("2024-01-03"), amount: -1000 },
      { date: new Date("2024-01-03"), amount: 1000 },
    ];

    const result = xirr(cashflows);

    expect(result).toEqual({ ok: false, reason: "no-convergence" });
  });

  it("falls back to bisection and finds a large annualised rate for a short, high-return window", () => {
    // Independently verified via wide-bracket bisection: 235.59060463878922.
    const cashflows: Cashflow[] = [
      { date: new Date("2024-01-01"), amount: -1000 },
      { date: new Date("2024-02-01"), amount: -1000 },
      { date: new Date("2024-03-01"), amount: -1000 },
      { date: new Date("2024-03-01"), amount: 5000 },
    ];

    const result = xirr(cashflows);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(235.59060463878922, 3);
    }
  });
});
