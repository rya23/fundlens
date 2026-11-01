# 02 Drizzle schema, migrations and DB client

Status: ready-for-agent
Blocked by: 01

Spec: `../spec.md` (DB dual driver), `docs/PLAN.md` (Architecture, surfaces).

## Scope
- `src/db/schema.ts`: schemes (code, name, AMC, SEBI category + sub-category, plan direct/regular, option growth/idcw, ISIN(s), inception, official benchmark name, TER, AUM, riskometer, exit load, managers, metadata updated-at), benchmarks (id, name, kind TRI|index-fund-proxy, source), benchmark_nav (benchmark id, date, value), scheme_metrics (one row per scheme: every screener column in PLAN incl. column-picker ones, as-of date, nav last date), category_stats (category, metric, quartile cut points, count, as-of), ingest_state (per-scheme last NAV date in store, last attempt, error).
- Nullable where data can be missing; numeric types suitable for ratios. Indexes for screener filters.
- `src/db/client.ts`: postgres-js or PGlite chosen from `DATABASE_URL`. drizzle-kit config + first migration + `db:migrate` script that works for both drivers.
- Must stay well under Supabase 500 MB (no NAV history in Postgres except benchmark_nav).

## Acceptance
- Test: migrate an in-memory PGlite, insert + read a row in every table.
