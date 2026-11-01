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
 * `navSeries` uses `series.ts`'s `NavSeries` (ISO string dates, sorted
 * ascending, at most one point per date - the NavStore invariant), looked
 * up via its `asOf`/`firstOnOrAfter`. `SipParams`/`SipInstalment` keep
 * `Date` for due/nav/valuation dates (nicer for a date-picker UI and for
 * feeding `xirr`'s `Date`-based `Cashflow`), converting to/from ISO strings
 * only at the NAV lookup boundary.
 */

import { asOf, firstOnOrAfter, subtractMonths } from "./series";
import type { NavSeries } from "./series";
import { na, ok } from "./types";
import type { MetricResult } from "./types";
import { xirr, type Cashflow, type XirrResult } from "./xirr";

export type { NavPoint } from "./series";

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

export type SipResult = MetricResult<SipSimulation>;

export interface SipParams {
  monthlyAmount: number;
  startDate: Date;
  endDate: Date;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Last day-of-month-aware "add N months" (Jan 31 + 1 month -> Feb 28/29).
 * Delegates to `series.ts`'s calendar-exact `subtractMonths` (a negative
 * month count adds) so SIP due-date arithmetic shares the same month/
 * leap-year clamping as the rest of `src/lib/metrics/` instead of
 * reimplementing it. Operates in UTC throughout, consistent with
 * `new Date("YYYY-MM-DD")` parsing as UTC midnight.
 */
function addMonthsClamped(date: Date, months: number): Date {
  return new Date(subtractMonths(toISODate(date), -months));
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

export function simulateSip(
  navSeries: NavSeries,
  params: SipParams
): SipResult {
  if (navSeries.length === 0) {
    return na("empty-nav-series");
  }

  if (
    params.monthlyAmount <= 0 ||
    params.startDate.getTime() > params.endDate.getTime()
  ) {
    return na("invalid-date-range");
  }

  const endDateISO = toISODate(params.endDate);
  const dueDates = generateDueDates(params.startDate, params.endDate);

  const instalments: SipInstalment[] = [];
  for (const dueDate of dueDates) {
    const navPoint = firstOnOrAfter(navSeries, toISODate(dueDate));
    if (!navPoint) continue;
    if (navPoint.date > endDateISO) continue;

    instalments.push({
      dueDate,
      navDate: new Date(navPoint.date),
      nav: navPoint.nav,
      amount: params.monthlyAmount,
      units: params.monthlyAmount / navPoint.nav,
    });
  }

  if (instalments.length === 0) {
    return na("no-instalments");
  }

  const invested = instalments.reduce((sum, i) => sum + i.amount, 0);
  const units = instalments.reduce((sum, i) => sum + i.units, 0);

  // Guaranteed to exist: every instalment's navDate is <= endDate, so at
  // least one NAV point on or before endDate exists.
  const valuationPoint = asOf(navSeries, endDateISO)!;
  const currentValue = units * valuationPoint.nav;

  const cashflows: Cashflow[] = [
    ...instalments.map((i) => ({ date: i.navDate, amount: -i.amount })),
    { date: new Date(valuationPoint.date), amount: currentValue },
  ];

  return ok({
    instalments,
    invested,
    units,
    valuationDate: new Date(valuationPoint.date),
    valuationNav: valuationPoint.nav,
    currentValue,
    xirr: xirr(cashflows),
  });
}
