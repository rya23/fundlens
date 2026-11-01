# 07 Data source clients and scheme classification

Status: ready-for-agent
Blocked by: 01

Spec: `docs/PLAN.md` (Data sources, Benchmarks), `stonk.py` (~line 280-360 for the TigZig metadata loader; reference only).

## Scope
- `src/ingest/sources/mfapi.ts`: list schemes, full history, latest; polite throttle, retry with exponential backoff + jitter, timeouts.
- `amfi-navall.ts`: fetch + parse `https://portal.amfiindia.com/spages/NAVAll.txt` (sections, `;` fields, AMC/category headers, `N.A.` values, dates DD-Mon-YYYY).
- `metadata.ts`: `MetadataSource` interface + TigZig implementation (gz CSV) mapping to the schemes columns; failure returns empty, never throws to the caller.
- `classify.ts`: plan (direct/regular) and option (growth/idcw) from scheme names, SEBI category/sub-category normalisation, category -> benchmark mapping table (equity TRIs per PLAN; documented choice for debt/hybrid/others, n/a allowed).
- Save small recorded fixtures under `src/ingest/__fixtures__/` (truncated real responses).

## Acceptance
- Vitest on fixtures for every parser and the classifier (cover odd names, IDCW variants, Direct vs Regular). Optional `scripts/smoke-sources.ts` for live checks, not in `npm test`.
