# 06 Metrics: XIRR, SIP simulation, peer ranks

Status: resolved
Blocked by: 01

Spec: `docs/PLAN.md` (Metric defaults and math).

## Scope
- `src/lib/metrics/xirr.ts`: XIRR via Newton-Raphson with bisection fallback; typed n/a with reason (no sign change, no convergence, single cashflow).
- `sip.ts`: monthly SIP simulation on a NAV series (instalment on the first NAV date on or after each due date), returns cashflows, units, invested, current value, XIRR. Used for 3Y/5Y SIP XIRR columns and the calculator.
- `peers.ts`: quartile cut points and percentile for a value within a peer set, with direction (higher-is-better vs lower-is-better, e.g. TER, std dev, max DD magnitude) and ties handled; label helper "Q1 · 87th pct in Flexi Cap".

## Acceptance
- Vitest: XIRR against known spreadsheet XIRR values; SIP fixture; percentile/quartile edge cases (n=1, ties, nulls excluded).
