# 08 Benchmark TRI ingestion

Status: resolved
Blocked by: 02, 07

Spec: `docs/PLAN.md` (Benchmarks).

## Scope
- `src/ingest/benchmarks.ts`: fetch TRI history from niftyindices.com for every index in the category map (research the current endpoint; it needs browser-like headers and date-chunked requests), upsert into `benchmark_nav` incrementally.
- Fallback per index: NAV history of a named low-cost index fund (code in the map), marked `kind = index-fund-proxy`.
- Document the endpoint and the debt/hybrid choice in a short `docs/benchmarks.md`.

## Acceptance
- Parser tests on recorded fixtures; upsert test on PGlite; fallback path test with the TRI client failing.
