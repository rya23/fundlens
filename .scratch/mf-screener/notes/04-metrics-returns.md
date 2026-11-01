# Notes for later agents - 04-metrics-returns

Branch: `worktree-agent-a8b4ce8463f46f4d7` (based on `mf-screener` at `52262ad`,
which is still its current tip - nothing to merge back at hand-off time).
Worktree: `<repo>/.claude/worktrees/agent-a8b4ce8463f46f4d7`.
Commit: `d60a47f` - "Add metrics series utilities and trailing/rolling returns
(ticket 04)".

Files added: `src/lib/metrics/types.ts`, `src/lib/metrics/series.ts`,
`src/lib/metrics/series.test.ts`, `src/lib/metrics/returns.ts`,
`src/lib/metrics/returns.test.ts`. 49/49 tests pass repo-wide; typecheck,
lint and build all clean.

## `types.ts` - shared Result type (ticket 04 owns this file)

```ts
export type MetricResult<T> = { ok: true; value: T } | { ok: false; reason: string };
export function ok<T>(value: T): MetricResult<T>;
export function na(reason: string): MetricResult<never>; // assignable to any MetricResult<T>
export const METRIC_REASONS = { EMPTY_SERIES, INVALID_WINDOW, NO_DATA_AT_DATE,
  INSUFFICIENT_HISTORY, INVALID_NAV, WINDOW_MISMATCH, NO_OVERLAPPING_WINDOWS } as const;
```

`reason` is a plain `string`, deliberately **not** a shared literal union -
risk.ts/xirr.ts/peers.ts should define their own reason strings (e.g.
`"did_not_converge"`, `"no_sign_change"`, `"single_cashflow"`) rather than
extending `METRIC_REASONS`, so ticket 05/06 never need to touch this file.
Just follow the same `{ok,value}`/`{ok:false,reason}` shape and import
`ok`/`na`/`MetricResult` from here for consistency.

## `series.ts` - the API ticket 05 (risk) builds on

```ts
export interface NavPoint { readonly date: string; readonly nav: number; } // ISO date, no time
export type NavSeries = readonly NavPoint[];
```

**Invariant**: a `NavSeries` must already be sorted ascending by `date`
with at most one point per date (this is what `NavStore`/ticket 03
produces). Nothing here re-sorts or dedupes; passing unsorted data gives
wrong answers silently.

Lookups (binary search, O(log n)):
- `asOf(series, date): NavPoint | undefined` - last point with
  `date <= target` ("NAV as of a date", falls back across
  weekends/holidays). `undefined` if `target` is before the series' first
  date or the series is empty.
- `firstOnOrAfter(series, date): NavPoint | undefined` - first point with
  `date >= target`. Useful for SIP instalment dates (ticket 06's `sip.ts`
  scope literally says "first NAV date on or after each due date" - this
  is that lookup, already built so 06 doesn't need to duplicate it).

Date math (UTC-only, exported because other modules will likely want it):
- `addDays(date, n)`.
- `subtractMonths(date, months)` - exact calendar-month subtraction with
  end-of-month clamping (e.g. 1 month before `2024-03-31` is `2024-02-29`).
- `subtractYears(date, years)` - calls `subtractMonths(date, round(years*12))`.
  Exact for integer years (clamps Feb 29 -> Feb 28 in a non-leap target
  year) **and** for fractional years that are a whole number of months
  (0.5y = 6mo, 0.25y = 3mo, etc.) - it is not a 365.25-day approximation,
  it's real calendar-month subtraction, so it's exact at month/year
  boundaries where a day-count approximation would be off by a day.

Alignment:
- `alignByDate<A extends {date:string}, B extends {date:string}>(a, b)` -
  generic intersection on exactly-matching dates (two-pointer merge over
  sorted arrays), returns `{date, a, b}[]`. Works for `NavPoint[]` or any
  other dated-point array (e.g. `RollingReturnPoint[]` in returns.ts).
- `alignSeries(a: NavSeries, b: NavSeries): {dates: string[]; a: number[]; b: number[]}` -
  NAV-specific convenience wrapper over `alignByDate`. **This is almost
  certainly what ticket 05 wants** for beta/alpha/R2/tracking-error/info-
  ratio regressions: resample fund and benchmark to weekly, take
  `simpleReturns` of each, then `alignByDate` the two `ReturnPoint[]`
  arrays (not `alignSeries`, since by that point you have returns, not
  NAVs - use the generic `alignByDate` for that step).

Resampling:
- `resample(series, "daily" | "weekly" | "monthly"): NavSeries` - `"daily"`
  is the identity (returns a copy).
- `resampleWeekly(series)` - one point per week, dated on that week's
  Friday, value = `asOf(series, friday)`. Only emits weeks whose Friday is
  `<= series' last date` (no forward-dated points for a week that hasn't
  happened yet).
- `resampleMonthly(series)` - **read the doc comment in series.ts**, the
  "full months only" rule is a real design decision, not obvious from the
  ticket text alone: it emits one point per full calendar month (fund
  existed before the month started AND data reaches the month's true
  end), **plus one leading baseline point** for the month-end just before
  the first full month (needed so `simpleReturns` on the output yields a
  return for that first full month too). Example: data 2020-01-15 to
  2020-04-10 -> `[2020-01-31 (baseline), 2020-02-29, 2020-03-31]` (April
  dropped as partial). This is exactly what ticket 05's up/down-capture
  (monthly returns, full months only) needs - don't reimplement the
  month-fullness logic there, call this.

Returns:
- `simpleReturns(series): {date, value}[]` - period-over-period simple
  return, dated on the period's end date, `n-1` points for `n` inputs.
  Skips (doesn't NaN/Infinity on) a period whose preceding NAV is <= 0.
  Works on raw daily data or any resampled series.
  **No log-returns helper is provided** (out of ticket 04's scope - the
  ticket text says "simple returns" only). If risk.ts's volatility calc
  wants log returns, add a small `logReturns` in risk.ts itself rather
  than editing series.ts, to avoid a merge conflict with ticket 04's file.

## `returns.ts` - trailing/rolling CAGR

```ts
export type TrailingWindowYears = 1 | 3 | 5 | 10;
export function trailingReturn(series, years: number, opts?: {asOf?: string}): MetricResult<number>;
export function trailingCAGR(series, years: TrailingWindowYears, opts?): MetricResult<number>; // = trailingReturn
```
`trailingReturn` is the general entry point: looks up `NAV_end` via `asOf`
(default end = series' last date) and `NAV_start` via
`asOf(series, subtractYears(end, years))`. If `years >= 1` it returns CAGR
`(end/start)^(1/years) - 1`; if `0 < years < 1` it returns the plain
absolute return `end/start - 1` (annualising a sub-year window would be
misleading). `trailingCAGR` is just a type-narrowed alias for the standard
1/3/5/10Y case. n/a reasons: `empty_series`, `invalid_window`,
`no_data_at_date`, `insufficient_history`, `invalid_nav`.

```ts
export type RollingWindowYears = 1 | 3 | 5;
export interface RollingReturnPoint { date: string; cagr: number; }
export interface RollingReturnStats { count, min, median, max, mean: number; }
export interface RollingReturnDistribution { windowYears: RollingWindowYears; points: RollingReturnPoint[]; stats: RollingReturnStats; }
export function rollingCAGR(series: NavSeries, years: RollingWindowYears): MetricResult<RollingReturnDistribution>;
export function pctRollingWindowsBeatingBenchmark(fund: RollingReturnDistribution, benchmark: RollingReturnDistribution): MetricResult<number>;
```
`rollingCAGR` walks every date in `series` (the "daily windows" from the
ticket) and computes a trailing `years`-CAGR ending there whenever enough
history exists; `points` is in ascending-date order. `pctRollingWindowsBeatingBenchmark`
aligns two distributions by end-date (via `alignByDate`) and returns the
fraction of overlapping windows where the fund's CAGR beat the
benchmark's; n/a if `windowYears` differ (`window_mismatch`) or there's no
date overlap (`no_overlapping_windows`).

## Gotchas / decisions for whoever reads this next

- All date math is UTC-only (`Date.UTC`/`toISOString().slice(0,10)`).
  Never introduce local-timezone `Date` construction anywhere in
  `src/lib/metrics/` - it will silently shift dates by a day depending on
  server TZ.
- `subtractYears`/`subtractMonths` are calendar-exact, not a 365.25-day
  approximation (an earlier draft used day-count approximation and it
  failed a hand-computed 6-month-window test by exactly one day - the
  current month-based implementation is the fix; keep it that way).
- `resampleMonthly`'s "full months only" semantics are a judgment call
  documented above and in the source - if fund-detail/risk output ever
  looks off by one month at a series' start/end, check that logic first.
- No `index.ts` barrel file was added for `src/lib/metrics/` to avoid a
  shared file every parallel ticket (05/06) would also want to edit.
  Import directly from `./series`, `./returns`, `./types`.
