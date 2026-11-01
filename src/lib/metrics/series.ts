/**
 * NAV series utilities: the shared representation and lookup/alignment/
 * resampling primitives that every other module in src/lib/metrics/ is
 * built on.
 *
 * Invariant (caller's responsibility, e.g. the NavStore adapter): a
 * `NavSeries` is sorted ascending by `date` and has at most one point per
 * date. All functions here assume this; none of them re-sort.
 *
 * Dates are plain ISO calendar dates (`YYYY-MM-DD`, no time component).
 * All date arithmetic below uses `Date.UTC` exclusively to avoid the
 * server's local timezone ever shifting a date by a day.
 */

export interface NavPoint {
  readonly date: string;
  readonly nav: number;
}

export type NavSeries = readonly NavPoint[];

const MS_PER_DAY = 86_400_000;

function parseISODate(dateISO: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateISO.split("-").map(Number);
  return { y, m, d };
}

function dateToMs(dateISO: string): number {
  const { y, m, d } = parseISODate(dateISO);
  return Date.UTC(y, m - 1, d);
}

function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
  // m is 1-12; day 0 of the next month is the last day of month m.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** ISO date of the last calendar day of month `m` (1-12) in year `y`. */
export function monthEndISO(y: number, m: number): string {
  return toISODate(Date.UTC(y, m - 1, daysInMonth(y, m)));
}

export function addDays(dateISO: string, days: number): string {
  return toISODate(dateToMs(dateISO) + days * MS_PER_DAY);
}

/**
 * Subtracts a whole number of calendar months from an ISO date, clamping
 * the day to the target month's last day when it would otherwise overflow
 * (e.g. subtracting 1 month from "2024-03-31" gives "2024-02-29", the
 * leap-year Feb 29, not "2024-03-02").
 */
export function subtractMonths(dateISO: string, months: number): string {
  const { y, m, d } = parseISODate(dateISO);
  const monthIndex = y * 12 + (m - 1) - months; // 0-based, may be negative
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12; // 0-11
  const targetDay = Math.min(d, daysInMonth(targetYear, targetMonth + 1));
  return toISODate(Date.UTC(targetYear, targetMonth, targetDay));
}

/**
 * Subtracts `years` from an ISO date using exact calendar-month
 * subtraction (not a fixed day count), so "1 year before 2024-03-15" is
 * exactly "2023-03-15", and "6 months (0.5y) before 2024-03-15" is
 * exactly "2023-09-15".
 *
 * `years` is converted to whole months (`round(years * 12)`) before
 * subtracting, so it handles both the standard integer windows
 * (1/3/5/10Y) and sub-year windows (e.g. 0.5y) exactly, with Feb-29/
 * month-length overflow clamped to the target month's last day (see
 * `subtractMonths`).
 */
export function subtractYears(dateISO: string, years: number): string {
  return subtractMonths(dateISO, Math.round(years * 12));
}

/** 0 = Sunday ... 6 = Saturday, computed in UTC. */
function dayOfWeekUTC(dateISO: string): number {
  return new Date(dateToMs(dateISO)).getUTCDay();
}

function firstFridayOnOrAfter(dateISO: string): string {
  const FRIDAY = 5;
  const diff = (FRIDAY - dayOfWeekUTC(dateISO) + 7) % 7;
  return addDays(dateISO, diff);
}

/**
 * Last point in `series` with `date <= target`, i.e. "the NAV as of
 * `target`, using the most recent available value if `target` itself
 * isn't a NAV date (weekend/holiday)". O(log n) via binary search.
 *
 * Returns `undefined` if `target` is before the series' first date, or
 * the series is empty.
 */
export function asOf(series: NavSeries, target: string): NavPoint | undefined {
  let lo = 0;
  let hi = series.length - 1;
  let result: NavPoint | undefined;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= target) {
      result = series[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

/**
 * First point in `series` with `date >= target`, i.e. "the next NAV on or
 * after `target`" - used e.g. for a SIP instalment due on a date that
 * isn't itself a NAV date. O(log n) via binary search.
 */
export function firstOnOrAfter(series: NavSeries, target: string): NavPoint | undefined {
  let lo = 0;
  let hi = series.length - 1;
  let result: NavPoint | undefined;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date >= target) {
      result = series[mid];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return result;
}

interface DatedValue {
  readonly date: string;
}

export interface AlignedPair<A extends DatedValue, B extends DatedValue> {
  readonly date: string;
  readonly a: A;
  readonly b: B;
}

/**
 * Intersects two date-sorted arrays on exactly matching dates (not an
 * as-of match). Generic over the point shape so it works for `NavPoint[]`
 * as well as e.g. rolling-return point arrays.
 */
export function alignByDate<A extends DatedValue, B extends DatedValue>(
  a: readonly A[],
  b: readonly B[]
): Array<AlignedPair<A, B>> {
  const result: Array<AlignedPair<A, B>> = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i].date === b[j].date) {
      result.push({ date: a[i].date, a: a[i], b: b[j] });
      i++;
      j++;
    } else if (a[i].date < b[j].date) {
      i++;
    } else {
      j++;
    }
  }

  return result;
}

export interface AlignedSeries {
  readonly dates: string[];
  readonly a: number[];
  readonly b: number[];
}

/** Convenience wrapper over `alignByDate` for two NAV series. */
export function alignSeries(a: NavSeries, b: NavSeries): AlignedSeries {
  const pairs = alignByDate(a, b);
  return {
    dates: pairs.map((p) => p.date),
    a: pairs.map((p) => p.a.nav),
    b: pairs.map((p) => p.b.nav),
  };
}

/**
 * Resamples to one point per ISO week, dated on that week's Friday, using
 * the last available NAV on or before the Friday (so a Friday holiday
 * falls back to Thursday, etc). Matches the PLAN's weekly-Friday
 * convention used for beta/alpha/R2/tracking error/info ratio.
 */
export function resampleWeekly(series: NavSeries): NavSeries {
  if (series.length === 0) return [];

  const lastDate = series[series.length - 1].date;
  const result: NavPoint[] = [];

  let friday = firstFridayOnOrAfter(series[0].date);
  while (friday <= lastDate) {
    const point = asOf(series, friday);
    if (point) result.push({ date: friday, nav: point.nav });
    friday = addDays(friday, 7);
  }

  return result;
}

/**
 * Resamples to one point per full calendar month, dated on each month's
 * actual last calendar day, using the last available NAV on or before
 * that day.
 *
 * "Full months only" (PLAN: up/down capture): a calendar month only
 * counts as a return period if the fund already existed before the month
 * started AND still had data through the month's real end. The series'
 * first and/or last calendar month are therefore usually partial and
 * excluded from being *counted* as a full month - but the month-end
 * immediately before the first full month is still included as the
 * baseline point every full-month return needs (`simpleReturns` on the
 * output then yields exactly one return per full month).
 *
 * Example: data from 2020-01-15 to 2020-04-10 resamples to
 * [2020-01-31, 2020-02-29, 2020-03-31] - Jan is the baseline, Feb and Mar
 * are the two full months, Apr is dropped (partial).
 */
export function resampleMonthly(series: NavSeries): NavSeries {
  if (series.length === 0) return [];

  const first = parseISODate(series[0].date);
  const lastDateISO = series[series.length - 1].date;
  const last = parseISODate(lastDateISO);

  // First calendar month where the fund already existed before it began.
  let ffY = first.y;
  let ffM = first.m;
  if (first.d !== 1) {
    if (ffM === 12) {
      ffM = 1;
      ffY++;
    } else {
      ffM++;
    }
  }

  // Last calendar month where NAV data reaches that month's true end.
  let lfY = last.y;
  let lfM = last.m;
  if (lastDateISO !== monthEndISO(lfY, lfM)) {
    if (lfM === 1) {
      lfM = 12;
      lfY--;
    } else {
      lfM--;
    }
  }

  const result: NavPoint[] = [];

  // Baseline: the month-end right before the first full month.
  let by = ffY;
  let bm = ffM - 1;
  if (bm === 0) {
    bm = 12;
    by--;
  }
  const baselineEnd = monthEndISO(by, bm);
  const baselinePoint = asOf(series, baselineEnd);
  if (baselinePoint) result.push({ date: baselineEnd, nav: baselinePoint.nav });

  let y = ffY;
  let m = ffM;
  while (y < lfY || (y === lfY && m <= lfM)) {
    const monthEnd = monthEndISO(y, m);
    const point = asOf(series, monthEnd);
    if (point) result.push({ date: monthEnd, nav: point.nav });

    if (m === 12) {
      m = 1;
      y++;
    } else {
      m++;
    }
  }

  return result;
}

export type ResampleFrequency = "daily" | "weekly" | "monthly";

/** Dispatches to the resampling function for a given frequency. "daily" is the identity (the raw series already is daily). */
export function resample(series: NavSeries, frequency: ResampleFrequency): NavSeries {
  switch (frequency) {
    case "daily":
      return series.slice();
    case "weekly":
      return resampleWeekly(series);
    case "monthly":
      return resampleMonthly(series);
  }
}

export interface ReturnPoint {
  readonly date: string;
  readonly value: number;
}

/**
 * Period-over-period simple returns: `nav[i] / nav[i-1] - 1`, dated on
 * the period's end date. Works on a raw daily series or any resampled
 * (weekly/monthly) series. Degenerate points (a zero or negative NAV)
 * are skipped rather than producing Infinity/NaN.
 */
export function simpleReturns(series: NavSeries): ReturnPoint[] {
  const result: ReturnPoint[] = [];

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].nav;
    const curr = series[i].nav;
    if (prev <= 0 || curr <= 0) continue;
    result.push({ date: series[i].date, value: curr / prev - 1 });
  }

  return result;
}
