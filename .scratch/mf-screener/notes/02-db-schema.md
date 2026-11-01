# Notes for later agents - 02-db-schema

**Not committed** - see "Blocked: git" at the bottom. All files exist on disk
in the worktree, uncommitted, and all checks (typecheck/lint/test/build)
pass. Whoever picks this up next should `git add` + commit before building
on it.

Worktree: `<repo>/.claude/worktrees/agent-a1d7aaeb44c3a9445`
Branch: `worktree-agent-a1d7aaeb44c3a9445` (based on `mf-screener`).

## Files

- `src/db/schema.ts` - Drizzle schema, 6 tables.
- `src/db/client.ts` - `createDb(url)` / `getDb()` / `closeDb(db)`, `Database` type.
- `src/db/migrate.ts` - `npm run db:migrate` entry point.
- `src/db/schema.test.ts` - Vitest: migrates an in-memory PGlite from the real
  generated SQL in `drizzle/`, inserts + reads a row in every table.
- `drizzle.config.ts` - `drizzle-kit generate` config (postgresql dialect;
  `dbCredentials` is a placeholder, never connected to - see comment in the
  file for why).
- `drizzle/` - generated migrations, **commit this directory**. Currently one
  squashed migration, `0000_ancient_proudstar.sql` (I generated several while
  iterating table-by-table under TDD, then `rm -rf drizzle` and regenerated
  once from the final schema so there's a single clean initial migration -
  there is no deployed DB yet, so nothing depended on the intermediate
  files).

## Schema

- **`schemes`** - one row per AMFI scheme code (a plan/option combo is its
  own row/code, e.g. "...- Direct Growth" vs "...- Direct IDCW"). Holds
  `category` (broad: "Equity"/"Debt"/"Hybrid") and `subCategory` (fine SEBI
  type: "Flexi Cap Fund" etc.) as **separate columns**. `subCategory` is what
  peer quartiles and the category->benchmark mapping actually key off - ticket
  07's `classify.ts` should write both, and ticket 06/10 should use
  `subCategory` wherever "the full SEBI category" is meant. Also holds
  `isinGrowthOrPayout` + `isinReinvestment` (AMFI's NAVAll.txt has exactly
  these two ISIN columns per row), `terPct`, `aumCr`, `riskometer`, `exitLoad`
  (free text - exit load terms aren't a clean number), `managers` (one
  "; "-joined string, no separate tenure fields - ticket didn't ask for
  tenure, kept it simple), `officialBenchmarkName` (free text, display-only -
  **not** a FK to `benchmarks`; the TRI used for alpha/beta is resolved by
  category via ticket 07's classify.ts mapping, not stored on the scheme).
- **`benchmarks`** / **`benchmarkNav`** - `benchmarks.id` is a stable text
  slug (e.g. `"nifty500-tri"`), not a surrogate id, so seed data/fixtures can
  reference it directly. `benchmarkNav` is the **only** per-day history table
  in Postgres (a few dozen benchmarks, trivial vs. the 500 MB budget) -
  per-scheme NAV history stays out of Postgres entirely (NavStore, ticket 03).
- **`schemeMetrics`** - one row per scheme (PK = `schemeCode`, FK to
  `schemes`), holds every *computed* screener metric from PLAN.md: trailing
  CAGR 1/3/5/10Y, rolling 3Y CAGR median + "% of 3Y windows beating
  benchmark", risk ratios (Sharpe/Sortino/alpha/beta/R²/stdDev/tracking
  error/info ratio, all 3Y per PLAN's stated default window), max drawdown
  (5Y per PLAN), up/down capture (3Y), SIP XIRR 3Y/5Y. **Deliberately does
  NOT duplicate** Fund/Category/AUM/TER/Riskometer/ExitLoad/FundAge - those
  are metadata that already live on `schemes` and get joined in; only the
  genuinely-computed numbers live here. If a future ticket finds joining
  `schemes` on every screener query to be an actual perf problem (unlikely -
  the whole universe is a few thousand rows), denormalizing a few metadata
  columns onto `schemeMetrics` would be an additive migration, not a
  redesign. All metric columns are `numeric(10,4)`, `mode: "number"`,
  **nullable** (n/a is `null`, never NaN/sentinel, matching tickets 04/06's
  `{ ok, value|reason }` convention upstream). Indexed: `asOf` plus the 8
  *default* screener columns (cagr1y/3y/5y, rolling3yCagrMedian, sharpe3y,
  alpha3y, beta3y, maxDrawdown5y). Column-picker-only metrics are
  intentionally unindexed - dataset is small enough for full scans.
- **`categoryStats`** - PK `(category, metric)`, current snapshot (not
  history). `category` = same string as `schemes.subCategory`. `metric` is
  free text matching a `schemeMetrics` column key (e.g. `"cagr3y"`), not an
  enum, so ticket 06's `peers.ts` can add a metric without a migration.
  `count`, `cutQ1`/`cutQ2`/`cutQ3` (3 cut points = 4 quartiles).
- **`ingestState`** - PK `schemeCode` (FK to `schemes`): `lastNavDate`,
  `lastAttemptAt`, `lastSuccessAt`, `lastError`. For tickets 09/11's
  resumable backfill / nightly job.

## Conventions worth knowing

- Every pure-calendar-date column uses Drizzle's `date(col, { mode: "string"
  })`, i.e. plain `"YYYY-MM-DD"` strings in and out, **not** `mode: "date"`
  (`Date` objects carry a timezone/time-of-day that a calendar date doesn't
  have - avoids off-by-one-day bugs). Timestamps (`createdAt`,
  `metadataUpdatedAt`, `lastAttemptAt`, etc., real instants) use
  `timestamp(col, { withTimezone: true, mode: "date" })` and do give you JS
  `Date`s.
- All ratio/percentage metric columns use a local `ratio(name)` helper in
  `schema.ts` = `numeric(name, { mode: "number", precision: 10, scale: 4 })`.
  Reuse it for any new metric column rather than inventing new precision.
- `Database` (`src/db/client.ts`) is `PostgresJsDatabase<...> & { $client:
  Sql } | PgliteDatabase<...> & { $client: PGlite }`. The `$client`
  intersection is necessary by hand - `drizzle-orm`'s exported `*Database`
  types don't include it, only the inferred return type of `drizzle(...)`
  does, so a function parameter/return typed as `Database` needs it spelled
  out to call `closeDb`.
- `createDb` creates missing parent directories for a `pglite:<dir>` target
  (`mkdirSync(target, { recursive: true })`) - PGlite's own node-fs backend
  does **not** create missing parent dirs, so `DATABASE_URL=pglite:.data/db`
  from a fresh checkout (no `.data/` yet) would otherwise throw ENOENT. Found
  this by actually running `npm run db:migrate` against a throwaway
  `pglite:.data/<dir>` outside the test suite, not just the in-memory test.
- `postgres-js` client is created with `{ prepare: false }` (Supabase's
  pooler, in transaction mode, doesn't support prepared statements) - matters
  for ticket 09/11 when they first point this at a real Supabase URL.
- `npm run db:generate` (new script) regenerates migrations from
  `schema.ts`; `npm run db:migrate` applies whatever's in `drizzle/` to
  whatever `DATABASE_URL` points at, picking the driver automatically.

## Versions installed

`drizzle-orm@0.45.4`, `drizzle-kit@0.31.11` (dev), `postgres@4.0.0`,
`@electric-sql/pglite@0.5.14`, `tsx@4.23.15` (dev, pinned exact - needed to
run `src/db/migrate.ts`, happened to already be a transitive dep of
`drizzle-kit` but promoted to an explicit devDependency). All installed with
`--registry=https://registry.npmjs.org/`. `drizzle-kit` pulls in `ts-morph` ->
`minimatch`, adding to the same pre-existing minimatch ReDoS dev-tooling
vulnerability chain ticket 01 already noted as a known non-issue (lint-time
only, not runtime) - `npm audit` now shows 25 instead of 16, same chain.

## Blocked: git

Every git subcommand in this session **except** `rev-parse`, `merge-base`,
and `--version` was refused by the sandbox with: "this command runs rtk with
a git command among its operands: what runs it, and from which directory or
root, cannot be read here... Refusing to run it." This happened for `status`,
`log`, `diff`, `branch`, `add`, `commit`, `stash list`, `show-ref` - plain,
unchained, single-command invocations, run from the worktree root (confirmed
via `pwd`), retried multiple times each. This is not the documented
"irreversible destruction" classifier (no destructive op was attempted) and
not a `cd`-plus-`git` chaining issue (those were ruled out first) - it looks
like a bug/gap in this session's worktree git sandboxing (`rtk`) rather than
an intentional policy, since even read-only `status`/`log`/`show-ref` were
refused while other read-only plumbing (`rev-parse`, `merge-base`) was not.

Per the implementer brief ("If any action is denied by permissions, stop and
report"), I stopped instead of trying to work around it. **Nothing is
committed.** All new/changed files are sitting uncommitted in the worktree
above; typecheck/lint/test/build all pass against them (see the orchestrator
report for the exact commands/output). Whoever can run `git add`/`git
commit` in this worktree (a human, or a session where this isn't broken)
should commit:

```
git add package.json package-lock.json drizzle.config.ts drizzle src/db
git commit -m "Add Drizzle schema, migrations and dual-driver DB client

Schemes/benchmarks/benchmarkNav/schemeMetrics/categoryStats/ingestState
tables per ticket 02. createDb()/getDb() pick postgres-js or PGlite from
DATABASE_URL; same schema and SQL migrations apply to both. Vitest
migrates an in-memory PGlite and round-trips a row through every table.

```

then merge `mf-screener`'s current tip into this branch per the brief's step
7 before any dependent ticket builds on it.
