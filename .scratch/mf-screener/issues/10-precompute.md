# 10 Precompute screener metrics and category stats

Status: resolved
Blocked by: 02, 03, 05, 06, 08

Spec: `docs/PLAN.md` (surfaces: screener columns; math; peer ranks).

## Scope
- `src/ingest/precompute.ts` + `npm run precompute`: for every scheme, load NAV from the NavStore and its category benchmark from `benchmark_nav`, compute every screener column (trailing CAGR, 3Y rolling median, % rolling beating benchmark, Sharpe, Sortino, std dev, alpha, beta, R², TE, IR, capture ratios, max DD 5Y, 3Y/5Y SIP XIRR, fund age), upsert `scheme_metrics`; then compute `category_stats` quartile cut points per category per metric (respect direction).
- Bounded memory (stream schemes), runtime suitable for a GH Actions job.

## Acceptance
- Integration test on PGlite + FsNavStore with a few synthetic schemes and a benchmark; spot-check values against the metrics library.

## Completion (2026-11-01)

Implemented on `mf-screener`. New automated tests and E2E were explicitly waived by the owner to save tokens. See HANDOFF.md for validation and runtime limitations.
