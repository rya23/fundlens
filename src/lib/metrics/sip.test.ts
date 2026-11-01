import { describe, expect, it } from "vitest";
import { simulateSip, type NavPoint } from "./sip";

describe("simulateSip", () => {
  it("buys units on each due date's exact NAV match and values the final NAV correctly", () => {
    const navSeries: NavPoint[] = [
      { date: new Date("2024-01-01"), nav: 10 },
      { date: new Date("2024-02-01"), nav: 10 },
      { date: new Date("2024-03-01"), nav: 20 },
    ];

    const result = simulateSip(navSeries, {
      monthlyAmount: 1000,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-03-01"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.instalments).toHaveLength(3);
    expect(result.value.instalments.map((i) => i.navDate.toISOString())).toEqual([
      new Date("2024-01-01").toISOString(),
      new Date("2024-02-01").toISOString(),
      new Date("2024-03-01").toISOString(),
    ]);
    expect(result.value.instalments.map((i) => i.units)).toEqual([100, 100, 50]);
    expect(result.value.invested).toBe(3000);
    expect(result.value.units).toBe(250);
    expect(result.value.valuationNav).toBe(20);
    expect(result.value.currentValue).toBe(5000);

    // Independently cross-checked (plain bisection script, not this
    // implementation): cashflows -1000@01-01, -1000@02-01, -1000@03-01,
    // +5000@03-01 -> 235.59060463878922.
    expect(result.value.xirr.ok).toBe(true);
    if (result.value.xirr.ok) {
      expect(result.value.xirr.value).toBeCloseTo(235.59060463878922, 3);
    }
  });

  it("buys at the first NAV date on or after a due date when the due date itself is missing", () => {
    const navSeries: NavPoint[] = [
      { date: new Date("2024-01-01"), nav: 10 },
      { date: new Date("2024-01-03"), nav: 10.5 },
      { date: new Date("2024-02-05"), nav: 11 },
    ];

    const result = simulateSip(navSeries, {
      monthlyAmount: 1000,
      startDate: new Date("2024-01-02"), // no NAV on 01-02; rolls to 01-03
      endDate: new Date("2024-02-05"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.instalments).toHaveLength(2);
    expect(result.value.instalments[0].dueDate).toEqual(new Date("2024-01-02"));
    expect(result.value.instalments[0].navDate).toEqual(new Date("2024-01-03"));
    expect(result.value.instalments[0].nav).toBe(10.5);
    // second due date is 2024-02-02; no exact NAV, rolls to 02-05
    expect(result.value.instalments[1].dueDate).toEqual(new Date("2024-02-02"));
    expect(result.value.instalments[1].navDate).toEqual(new Date("2024-02-05"));
    expect(result.value.instalments[1].nav).toBe(11);
  });

  it("clamps a due date past the last day of a shorter month (e.g. Jan 31 -> Feb 28)", () => {
    const navSeries: NavPoint[] = [
      { date: new Date("2023-01-31"), nav: 10 },
      { date: new Date("2023-02-28"), nav: 12 },
      { date: new Date("2023-03-31"), nav: 13 },
    ];

    const result = simulateSip(navSeries, {
      monthlyAmount: 1000,
      startDate: new Date("2023-01-31"),
      endDate: new Date("2023-03-31"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.instalments.map((i) => i.dueDate)).toEqual([
      new Date("2023-01-31"),
      new Date("2023-02-28"), // 2023 is not a leap year
      new Date("2023-03-31"),
    ]);
  });

  it("skips an instalment whose due date falls after the last available NAV and keeps the rest", () => {
    const navSeries: NavPoint[] = [
      { date: new Date("2024-01-01"), nav: 10 },
      { date: new Date("2024-02-01"), nav: 10 },
    ];

    const result = simulateSip(navSeries, {
      monthlyAmount: 1000,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-03-01"), // due 2024-03-01 has no NAV on/after it
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.instalments).toHaveLength(2);
    expect(result.value.invested).toBe(2000);
    // valuation falls back to the last available NAV on/before endDate
    expect(result.value.valuationNav).toBe(10);
    expect(result.value.valuationDate).toEqual(new Date("2024-02-01"));
  });

  it("returns empty-nav-series when the NAV series has no points", () => {
    const result = simulateSip([], {
      monthlyAmount: 1000,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-03-01"),
    });

    expect(result).toEqual({ ok: false, reason: "empty-nav-series" });
  });

  it("returns invalid-date-range when startDate is after endDate", () => {
    const navSeries: NavPoint[] = [{ date: new Date("2024-01-01"), nav: 10 }];

    const result = simulateSip(navSeries, {
      monthlyAmount: 1000,
      startDate: new Date("2024-03-01"),
      endDate: new Date("2024-01-01"),
    });

    expect(result).toEqual({ ok: false, reason: "invalid-date-range" });
  });

  it("returns invalid-date-range when monthlyAmount is not positive", () => {
    const navSeries: NavPoint[] = [{ date: new Date("2024-01-01"), nav: 10 }];

    const result = simulateSip(navSeries, {
      monthlyAmount: 0,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-02-01"),
    });

    expect(result).toEqual({ ok: false, reason: "invalid-date-range" });
  });

  it("returns no-instalments when the only available NAV falls after endDate", () => {
    // The only NAV point is "on or after" every due date, but it is past
    // endDate, so no instalment is actually executable within the window.
    const navSeries: NavPoint[] = [{ date: new Date("2024-06-01"), nav: 10 }];

    const result = simulateSip(navSeries, {
      monthlyAmount: 1000,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-03-01"),
    });

    expect(result).toEqual({ ok: false, reason: "no-instalments" });
  });

  it("returns no-instalments when every due date falls after the NAV series ends", () => {
    const navSeries: NavPoint[] = [{ date: new Date("2024-01-01"), nav: 10 }];

    const result = simulateSip(navSeries, {
      monthlyAmount: 1000,
      startDate: new Date("2024-06-01"),
      endDate: new Date("2024-08-01"),
    });

    expect(result).toEqual({ ok: false, reason: "no-instalments" });
  });
});
