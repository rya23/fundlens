/**
 * Monthly SIP (systematic investment plan) simulation on a NAV series.
 *
 * Due date N falls on the same day-of-month as `startDate` (clamped to the
 * last day of a shorter month), and each instalment buys units at the first
 * NAV date on or after its due date, as long as that NAV date does not fall
 * after `endDate` (we never "invest" using a NAV from beyond the valuation
 * date). The simulation values the resulting units at the last NAV on or
 * before `endDate`, and feeds every instalment plus the final valuation into
 * `xirr` to produce the SIP's XIRR.
 *
 * NOTE: `NavPoint` is a minimal local type, defined here because this ticket
 * ran in parallel with the one that owns `src/lib/metrics/series.ts`. It
 * should be unified with that module's NAV series type later (see this
 * ticket's notes file).
 */

import { xirr, type Cashflow, type XirrResult } from "./xirr";

export interface NavPoint {
  date: Date;
  nav: number;
}

export interface SipInstalment {
  dueDate: Date;
  navDate: Date;
  nav: number;
  amount: number;
  units: number;
}

export type SipFailureReason =
  | "empty-nav-series"
  | "invalid-date-range"
  | "no-instalments";

export interface SipSimulation {
  instalments: SipInstalment[];
  invested: number;
  units: number;
  valuationDate: Date;
  valuationNav: number;
  currentValue: number;
  xirr: XirrResult;
}

export type SipResult =
  | { ok: true; value: SipSimulation }
  | { ok: false; reason: SipFailureReason };

export interface SipParams {
  monthlyAmount: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Last day-of-month-aware "add N months" (Jan 31 + 1 month -> Feb 28/29).
 *
 * Operates in UTC throughout: `new Date("YYYY-MM-DD")` (how every date in
 * this module's inputs is expected to be constructed) parses as UTC
 * midnight, so mixing in local-time component getters/setters here would
 * shift the result by the local UTC offset.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, month + months + 1, 0)
  ).getUTCDate();

  return new Date(Date.UTC(year, month + months, Math.min(day, lastDayOfTargetMonth)));
}

function generateDueDates(startDate: Date, endDate: Date): Date[] {
  const dueDates: Date[] = [];
  let i = 0;
  let due = startDate;
  while (due.getTime() <= endDate.getTime()) {
    dueDates.push(due);
    i += 1;
    due = addMonthsClamped(startDate, i);
  }
  return dueDates;
}

/** First NAV point with date >= `date`, assuming `series` is sorted ascending. */
function firstNavOnOrAfter(
  series: readonly NavPoint[],
  date: Date
): NavPoint | undefined {
  return series.find((point) => point.date.getTime() >= date.getTime());
}

/** Last NAV point with date <= `date`, assuming `series` is sorted ascending. */
function navAsOf(
  series: readonly NavPoint[],
  date: Date
): NavPoint | undefined {
  let result: NavPoint | undefined;
  for (const point of series) {
    if (point.date.getTime() <= date.getTime()) {
      result = point;
    } else {
      break;
    }
  }
  return result;
}

export function simulateSip(
  navSeries: readonly NavPoint[],
  params: SipParams
): SipResult {
  if (navSeries.length === 0) {
    return { ok: false, reason: "empty-nav-series" };
  }

  if (
    params.monthlyAmount <= 0 ||
    params.startDate.getTime() > params.endDate.getTime()
  ) {
    return { ok: false, reason: "invalid-date-range" };
  }

  const sortedSeries = [...navSeries].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const dueDates = generateDueDates(params.startDate, params.endDate);

  const instalments: SipInstalment[] = [];
  for (const dueDate of dueDates) {
    const navPoint = firstNavOnOrAfter(sortedSeries, dueDate);
    if (!navPoint) continue;
    if (navPoint.date.getTime() > params.endDate.getTime()) continue;

    instalments.push({
      dueDate,
      navDate: navPoint.date,
      nav: navPoint.nav,
      amount: params.monthlyAmount,
      units: params.monthlyAmount / navPoint.nav,
    });
  }

  if (instalments.length === 0) {
    return { ok: false, reason: "no-instalments" };
  }

  const invested = instalments.reduce((sum, i) => sum + i.amount, 0);
  const units = instalments.reduce((sum, i) => sum + i.units, 0);

  // Guaranteed to exist: every instalment's navDate is <= endDate, so at
  // least one NAV point on or before endDate exists.
  const valuationPoint = navAsOf(sortedSeries, params.endDate)!;
  const currentValue = units * valuationPoint.nav;

  const cashflows: Cashflow[] = [
    ...instalments.map((i) => ({ date: i.navDate, amount: -i.amount })),
    { date: valuationPoint.date, amount: currentValue },
  ];

  return {
    ok: true,
    value: {
      instalments,
      invested,
      units,
      valuationDate: valuationPoint.date,
      valuationNav: valuationPoint.nav,
      currentValue,
      xirr: xirr(cashflows),
    },
  };
}
