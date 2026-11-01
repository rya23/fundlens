# MF Screener

A free screener for Indian mutual funds: sortable category-ranked metrics, fund
charts, comparisons of 2-5 funds, and a historical monthly SIP calculator. No login
or paid features. Default universe: Direct Growth. All screen and calculator
inputs can be shared through the URL.

## Run locally

Requires Node.js 22 or newer. Install only from the official npm registry.

```bash
npm ci --registry=https://registry.npmjs.org/
cp .env.example .env.local
npm run seed:dev
npm run dev
```

Open http://localhost:3000. The seed contains explicitly fictional funds, metrics,
benchmark levels, and NAV history so every page can be explored without accounts.
Stop the server before reseeding: only one process may open the local PGlite DB.
The default local database is `pglite:.data/db`; NAVs live at `fs:.data/nav`.
`seed:dev` refuses remote Postgres and R2. Do not use seeded data for investment decisions.

Next.js reads `.env.local` for the app. CLI jobs read exported environment
variables; they do not load `.env` files. For local jobs:

```bash
export DATABASE_URL=pglite:.data/db
export NAV_STORE=fs:.data/nav
npm run db:migrate
npm run backfill -- --limit 50
npm run benchmarks
npm run precompute
```

Use a fresh local DB/NAV directory for real data to keep fictional funds out of
real screens. Backfill is resumable; use `--codes 122639,119528` for specific schemes
or `--concurrency 4` to control parallel downloads. Run `npm run nightly` to refresh
latest NAVs, metadata, benchmarks, metrics, and category statistics.

## Deploy with Supabase, R2, and Vercel

1. Create a Supabase Postgres database. Set `DATABASE_URL` to its connection string
   (use the transaction pooler for serverless hosting). The client disables
   prepared statements for pooler compatibility. Apply the additive migrations
   with `npm run db:migrate` before running ingestion or the app.
2. Create a private Cloudflare R2 bucket and an S3 API token restricted to that
   bucket's object read/write operations. Configure `NAV_STORE=r2`, `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. NAV objects are
   gzipped JSON at `nav/{schemeCode}.json.gz`; never expose bucket credentials
   through `NEXT_PUBLIC_*` variables.
3. Set these variables on Vercel for the Next.js project. Add `DATABASE_URL` and
   the four `R2_*` values as GitHub repository Actions secrets. `NAV_STORE=r2` is
   set in the workflows. Optional repository variable `RISK_FREE_RATE` defaults
   to `0.065` (6.5%); configure the same value in Vercel to keep metrics consistent.
4. Run the manual **Backfill fund NAV history** workflow for initial history;
   optional `limit` and `codes` inputs allow bounded/resumed runs. The
   **Nightly fund data** workflow runs daily at 18:30 UTC (00:00 IST), or manually.
   Check workflow logs for failed schemes and retry them. Workflows have a
   six-hour timeout. GitHub requires scheduled workflows on the default branch;
   local branches alone do not activate the schedule.
5. Deploy the repository as a Next.js project on Vercel. Build with
   `npm run build`; keep all credentials server-side. Vercel Hobby is suitable
   for personal, non-commercial use. Verify data freshness in the screener after
   the initial ingestion finishes.

The repository has no remote configured. Local work does not publish the app,
configure cloud accounts, or activate GitHub Actions.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Develop, build, serve |
| `npm run seed:dev` | Local fictional review data, safe to rerun |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run backfill` / `npm run benchmarks` | Load fund/benchmark history |
| `npm run precompute` / `npm run nightly` | Compute snapshots / refresh all data |
| `npm run typecheck` / `npm run lint` / `npm test` | Types, lint, existing Vitest tests |
| `npm run smoke:sources` | Optional live source check, excluded from tests |

## Data and metric limits

NAV backfill uses mfapi.in; nightly NAVs use AMFI NAVAll with mfapi fallback.
Metadata comes from an unofficial TigZig mirror; missing metadata leaves blank
cells instead of blocking ingestion. Benchmarks currently use low-cost index fund
NAV proxies, explicitly labeled on detail pages. They understate TRI by tracking
costs and can be too young for 3Y/5Y relative metrics. Debt/hybrid relative metrics
can be unavailable. See [benchmark mapping](docs/benchmarks.md).

Missing history and failed metrics show `n/a`; ratios never silently display NaN.
Peer ranks use the full SEBI sub-category, not the filtered screen. SIP results
exclude tax and exit loads and use actual available purchase/valuation dates.
Cached fund data refreshes approximately every 24 hours.

Architecture and settled math: [v1 plan](docs/PLAN.md). Deferred features:
[v2 backlog](docs/V2_BACKLOG.md). Implementation state: [handoff](HANDOFF.md).
