# 11 Nightly job and GitHub Actions workflows

Status: resolved
Blocked by: 09, 10

Spec: `docs/PLAN.md` (Architecture: jobs).

## Scope
- `scripts/nightly.ts`: fetch NAVAll (fallback mfapi latest), append new points to changed schemes in the NavStore, add new schemes, refresh metadata, update benchmarks, run precompute. Idempotent if run twice a day.
- `.github/workflows/nightly.yml` (cron after AMFI publish, ~23:30 IST, plus `workflow_dispatch`) and `backfill.yml` (manual, resumable, 6h timeout). Secrets via GH secrets; document required secrets in README.

## Acceptance
- Test the nightly pipeline end to end with mocked sources (PGlite + FsNavStore), including the NAVAll-failure fallback. `actionlint` clean if available.

## Completion (2026-11-01)

Implemented on `mf-screener`. New automated tests and E2E were explicitly waived by the owner to save tokens. See HANDOFF.md for validation and runtime limitations.
