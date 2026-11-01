# Notes for later agents - 06-metrics-xirr-peers

Branch: `worktree-agent-a9ec571d794217fc5` (based on `mf-screener`). Worktree:
`<repo>/.claude/worktrees/agent-a9ec571d794217fc5`.

Files added: `src/lib/metrics/xirr.ts` (+ `.test.ts`), `src/lib/metrics/sip.ts`
(+ `.test.ts`), `src/lib/metrics/peers.ts` (+ `.test.ts`). 41 new Vitest
cases, all passing; typecheck/lint/build all clean.

## Important: unify with series.ts (ticket 04) later

This ticket ran in parallel with 04, which owns `src/lib/metrics/series.ts`
and the shared `{ ok: true, value } | { ok: false, reason }` result
convention. To stay self-contained, this ticket does NOT import from
`series.ts` and instead defines locally:

- `sip.ts` exports a minimal `NavPoint { date: Date; nav: number }` and its
  own private `navAsOf` / `firstNavOnOrAfter` helpers (linear scan, assumes
  ascending sort). **These should be deleted and replaced with whatever
  `series.ts` exports once both land on `mf-screener`** - likely
  `series.ts`'s NAV point type and an `asOf`-style lookup. Check field names
  match (`date`/`nav` here) before swapping.
- Each module (`xirr.ts`, `sip.ts`, `peers.ts`) defines its own
  `{ ok: true, value } | { ok: false, reason }`-shaped result type inline
  (`XirrResult`, `SipResult`) rather than importing a shared one, since no
  shared type existed on this branch. If 04 lands a shared generic
  `Result<T, R>` type, consider migrating these call sites, but it's not
  required - the shapes are structurally identical already.

## `xirr.ts`

- `xirr(cashflows: readonly Cashflow[], options?: { guess?: number }): XirrResult`
- `Cashflow = { date: Date; amount: number }`.
- `XirrFailureReason = "single-cashflow" | "no-sign-change" | "no-convergence"`
  (exactly the three reasons named in the ticket).
- Newton-Raphson from an initial guess (default 10%), falling back to
  bisection over an exponentially-expanding bracket
  (`-0.999999999 .. 1e7`) when Newton fails to converge or overshoots past
  `rate <= -1`.
- Guards two degenerate cases beyond the obvious ones:
  - All cashflows on a single calendar date -> `"no-convergence"` (NPV is a
    rate-independent constant; either unsatisfiable or indeterminate, never
    a real answer). Found this by TDD red/green - a naive Newton
    implementation "converges" instantly to the initial guess here, which
    is silently wrong.
  - An implied rate so close to -100% that it falls outside the bracket
    search grid also resolves to `"no-convergence"` rather than a bogus
    extreme number.
- All numeric fixtures were cross-checked independently (plain bisection in
  a throwaway Node script, not this implementation) against the documented
  Microsoft/Excel XIRR example and hand-constructible exact cases (e.g.
  1000 -> 1210 over exactly 730 days = 10%).

## `sip.ts`

- `simulateSip(navSeries: readonly NavPoint[], params: { monthlyAmount, startDate, endDate }): SipResult`.
- Due dates: same day-of-month as `startDate`, clamped to the last day of a
  shorter month (Jan 31 -> Feb 28/29), generated monthly through `endDate`.
- Each instalment buys at the first NAV date `>=` its due date, **but only
  if that NAV date is also `<= endDate`** - an instalment can't execute
  using a NAV from beyond the valuation window. If no such NAV exists, that
  instalment is skipped (not an error) as long as at least one instalment
  survives; if none do, result is `{ ok: false, reason: "no-instalments" }`.
- Valuation always uses the last NAV `<= endDate`; this NAV point is
  guaranteed to exist whenever at least one instalment exists (the
  instalment's own NAV date qualifies), so there is no separate
  "no-valuation-nav" failure reason - it would be dead code by
  construction. `SipFailureReason = "empty-nav-series" | "invalid-date-range" | "no-instalments"`.
- Feeds instalment outflows + final valuation inflow into `xirr()` for the
  SIP XIRR.
- Gotcha hit during TDD: do all month-arithmetic in **UTC**
  (`getUTCFullYear`/`Date.UTC`), not local time. `new Date("YYYY-MM-DD")`
  (how every test and presumably every real caller constructs these dates)
  parses as UTC midnight; mixing in local-time Date components shifts
  results by the runner's UTC offset and silently breaks date equality
  assertions. Found this via a failing test on this machine (UTC+5:30).

## `peers.ts`

- `computeQuartileCutPoints(values: readonly (number|null|undefined)[]): QuartileCutPoints | undefined`
  - linear-interpolation percentiles (Excel `PERCENTILE.INC` / numpy
    default), nulls/undefineds excluded, `undefined` if nothing's left.
- `rankPeer(value, peerValues, direction: "higher-is-better" | "lower-is-better"): PeerRank | undefined`
  - `PeerRank = { percentile: 0-100, quartile: 1-4, peerCount }`.
  - Percentile = (count of peers this value beats + 0.5 * count tied,
    including itself) / n * 100 - standard average-rank tie handling.
  - Quartile: compute numeric quartile (1 = bottom 25%, 4 = top 25%) from
    cut points, then invert (`5 - numeric`) for `"higher-is-better"` so
    quartile 1 always means "best". `"lower-is-better"` needs no inversion.
  - `peerValues` is expected to be the full category's values for that
    metric and typically includes `value` itself (matches "computed within
    the full SEBI category" from docs/PLAN.md).
  - **n=1 special case**: returns `{ percentile: 100, quartile: 1 }`
    unconditionally. The general formula is direction-dependent and
    arbitrary with no real distribution to compare against (verified by
    hand: it would otherwise give quartile 4 for "higher-is-better" and
    quartile 1 for "lower-is-better" on the exact same single-fund
    category, which is meaningless), so it's special-cased instead.
- `formatPeerRankLabel(rank, categoryLabel): string` -> e.g.
  `"Q1 · 87th pct in Flexi Cap"` (percentile rounded to nearest integer,
  standard English ordinal suffixes incl. 11th/12th/13th exceptions).

## Checks run

`npm run typecheck && npm run lint && npm test && npm run build` all pass
with zero new warnings (51 tests total, 41 new). `npm audit` pre-existing
dev-tooling-only findings untouched.
