# 05 Metrics: risk ratios

Status: resolved
Blocked by: 04

Spec: `docs/PLAN.md` (Metric defaults and math).

## Scope
- `src/lib/metrics/risk.ts`: annualised std dev (daily, sqrt 252), Sharpe and Sortino (annualised arithmetic mean daily excess return; downside deviation vs rf), max drawdown (+ peak/trough dates), beta/alpha (annualised, Jensen)/R²/tracking error/information ratio on weekly Friday excess returns annualised with 52, up/down capture on full-month returns using geometric means.
- All take a window (1/3/5/10Y) and rf from config; typed n/a results.

## Acceptance
- Vitest: hand fixtures for each metric (small series computable by hand), plus a property test or two (beta of a series vs itself is 1, R² 1, TE 0).
