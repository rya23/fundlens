# Notes for later agents - 09-backfill

Branch: `worktree-agent-a3c6dfb5e364e3448` (worktree
`<repo>/.claude/worktrees/agent-a3c6dfb5e364e3448`),
tickets 09, 08, 10, 11 are committed in that order on this one branch.

## Files

- `src/ingest/schemes.ts` - shared by backfill (09) and nightly (11):
  - `fetchUniverse({fetchNavAll?, mfapi, onFallback?}) -> {source: "amfi"|"mfapi-latest", entries: UniverseEntry[]}`.
    `UniverseEntry` = scheme code/name/amc/raw category/plan/option/ISINs plus
    `latestNav`/`latestDate` (ISO). AMFI first, mfapi `/mf/latest` fallback.
    Deduped by scheme code.
  - `buildSchemeRows(entries, metadata, now)`, `upsertSchemes(db, rows)`,
    `syncSchemes(db, deps)`. Metadata columns use `coalesce(excluded.x, existing)`
    so an empty/failed TigZig fetch never blanks stored TER/AUM.
  - `mfapiDateToIso("DD-MM-YYYY")`.
  - Plan/option: from AMFI text then scheme name. Unknown plan -> `regular`
    (pre-2013 schemes). Unknown option -> scheme skipped (live check: ~6000 of
    ~14400 entries, all matured FMPs / fixed horizon funds). `schemes.category`
    = classify `group`, `subCategory` = normalised sub-category.
- `src/ingest/nav-points.ts` - `toNavPoints(mfapiRows)` (drops bad dates / nav <= 0).
- `src/ingest/backfill.ts` - `runBackfill(deps) -> BackfillSummary`;
  `isUpToDate(state, entry)`; `recordState(db, code, {...})` (ingest_state upsert,
  failure keeps previous lastNavDate/lastSuccessAt) - reuse in nightly.
  Deps: `db, store, mfapi, metadata, fetchNavAll?, concurrency (4), limit, codes, signal, log, now`.
- `scripts/backfill.ts` + `npm run backfill` (`--limit`, `--codes`, `--concurrency`; SIGINT aborts gracefully).

## Semantics

- Skip rule: ingest_state has `lastSuccessAt` and `lastNavDate >= entry.latestDate`
  (or the source gave no date). `--limit` caps schemes *fetched* (after skipping), so
  repeated limited runs make progress.
- Full history fetched every time (no startDate), `appendPoints` is idempotent.
- Per-scheme errors go to `ingest_state.last_error`; run continues.
- tsx resolves the `@/` alias, so scripts may import from `../src/...` freely.

## Verified live

`npm run backfill -- --codes 122639,122640` against a throwaway PGlite + fs store
worked end to end (8406 schemes upserted, 11417 metadata rows).
