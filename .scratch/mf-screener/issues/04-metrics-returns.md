# 04 Metrics: series utilities and returns

Status: ready-for-agent
Blocked by: 01

Spec: `docs/PLAN.md` (Metric defaults and math).

## Scope
- `src/lib/metrics/series.ts`: NAV series type, as-of lookup (last NAV on or before date), alignment of two series on common dates, daily/weekly (Friday, last available on or before)/monthly (full months only) resampling, simple returns.
- `returns.ts`: trailing CAGR (1/3/5/10Y, n/a with reason when history too short), absolute return for < 1Y, rolling CAGR on daily windows (1/3/5Y) returning distribution + min/median/max/mean, % of windows beating a benchmark rolling series.
- Results are typed: `{ ok: true, value } | { ok: false, reason }`, never NaN.

## Acceptance
- Vitest with hand-computed fixtures incl. weekends/holidays, missing start date, leap years, short history.
