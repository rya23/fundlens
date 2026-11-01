# 09 Backfill job

Status: resolved
Blocked by: 02, 03, 07

Spec: `docs/PLAN.md` (Architecture: backfill).

## Scope
- `scripts/backfill.ts` (`npm run backfill`): upsert all schemes + metadata, then fetch full NAV history from mfapi into the NavStore for every scheme (all plans/options, so Regular/IDCW work later), bounded concurrency, idempotent and resumable via `ingest_state` (skip up-to-date schemes), per-scheme errors recorded not fatal, progress logs, `--limit`, `--codes`, `--concurrency` flags.

## Acceptance
- Integration test with mocked sources + FsNavStore + PGlite: run, interrupt mid-way, re-run, verify no duplicate work and complete data.
