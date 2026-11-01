# Notes for later agents - 08-benchmarks

Same branch/worktree as 09-backfill notes. Override applied: NO niftyindices.com
contact and no TRI client code. Benchmark history = NAV of the index fund mapped
in classify.ts, via the mfapi client. Owner decision on TRI is pending.

## API (`src/ingest/benchmarks.ts`)

- `benchmarkId("NIFTY 500 TRI") -> "nifty-500-tri"` (kebab slug of the index
  name). **Ticket 10: a scheme's benchmark id is
  `benchmarkId(getBenchmarkMapping(normalizeCategory(raw)).triName)`** (null
  triName -> no benchmark, benchmark metrics null).
- `listBenchmarkDefinitions(): {id, name, fallbackSchemeCode}[]` - 5 distinct
  indices (NIFTY 100, LARGEMIDCAP 250, MIDCAP 150, SMALLCAP 250, 500).
  Built on new `listBenchmarkMappings()` added to `classify.ts`.
- `interface BenchmarkSource { kind: "tri" | "index_fund_proxy"; fetchHistory(def) -> {source, points:{date,value}[]} | null }` (throws = failure).
- `IndexFundProxySource(mfapi)` - `source` string is `mfapi:<code>`.
- `ingestBenchmarks({db, sources, definitions?, log?}) -> BenchmarkIngestResult[]`
  (`status: updated|unchanged|failed`, `kind`, `added`, `error`).
- `npm run benchmarks` (`scripts/benchmarks.ts`); exit code 1 if any failed.

## Semantics

- DB enum value is `index_fund_proxy` (underscore, existing schema); no migration.
- Same kind+source: insert only dates newer than stored max. Different kind or
  source: replace whole history in one transaction. Never downgrades tri -> proxy.
  All sources failing keeps stored data and reports `failed`.
- To add TRI later: implement `BenchmarkSource` kind "tri", put before the proxy
  in the `sources` array (scripts/benchmarks.ts, nightly). Nothing else changes.

## Gotcha for precompute (10): proxy history is SHORT

Live 2026-11-01 row counts: nifty-100 1153, smallcap-250 869, largemidcap-250 648,
midcap-150 472, nifty-500 458 (about 1.8 years). 3Y/5Y benchmark-relative metrics
will be n/a for most categories until history accrues; precompute must treat
"insufficient overlap" as null, not an error. Documented in `docs/benchmarks.md`.

## Tests

`benchmarks.test.ts`: proxy parse on the recorded mfapi fixture, PGlite upsert,
incremental, fallback with a failing stub tri source, keep-on-failure, tri upgrade /
no downgrade. Live-verified `npm run benchmarks` against a throwaway PGlite.
