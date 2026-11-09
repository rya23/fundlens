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
real screens. Backfill is resumable; use `--codes 122639,119528` for specific schemes,
`--concurrency N` to control parallel work, and `--max-minutes N` to stop cleanly
after a time budget. mfapi.in returns HTTP 429 above about 10 requests/second, so
every mfapi call shares a 5 requests/second limiter; a full backfill of about 8.4k
schemes takes roughly 30-60 minutes. Run `npm run nightly` to refresh latest NAVs,
metadata, benchmarks, metrics, and category statistics. The nightly job also
fetches the full history of any scheme that has none stored yet, so an
interrupted backfill is completed by later nightly runs.

## Deploy with Supabase and Vercel

1. In Supabase, create a private Storage bucket named `fund-nav`. Copy the
   project URL, a server secret key (`sb_secret_...`), and the Postgres connection
   string. Use the transaction pooler for Vercel; the database client disables
   prepared statements. This app uses direct SQL, so the Supabase Data API can
   stay disabled. No Supabase Auth, Realtime, or Edge Functions are needed.
2. Add these server-only environment variables in Vercel:

   ```dotenv
   DATABASE_URL=<Supabase Postgres connection string>
   NAV_STORE=supabase
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=<server secret key>
   SUPABASE_STORAGE_BUCKET=fund-nav
   RISK_FREE_RATE=0.065
   ```

   Legacy projects may use `SUPABASE_SERVICE_ROLE_KEY` instead of
   `SUPABASE_SECRET_KEY`. Never put either key in a `NEXT_PUBLIC_*` variable.
   The app uses the official Supabase client to access private Storage;
   metadata and metrics continue to use Drizzle/Postgres.
3. In GitHub repository Settings > Secrets and variables > Actions, add repository
   secrets `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` (or the legacy
   key above). Optional repository variables: `SUPABASE_STORAGE_BUCKET` defaults
   to `fund-nav`, and `RISK_FREE_RATE` defaults to `0.065`. Both workflows set
   `NAV_STORE=supabase`. No R2 credentials are needed.
4. Run the manual **Backfill fund NAV history** workflow in Actions. Start with
   `limit=50` to populate a small real-data universe, then rerun without the limit
   for complete history. The workflow applies migrations, loads NAV files,
   refreshes benchmarks, and precomputes metrics. It is resumable; a limit counts
   fetched histories, so other discovered schemes can initially show n/a. Do not
   run `seed:dev` against the cloud database.
5. Import `rya23/fundlens` into Vercel as a Next.js project on branch `main` and
   deploy. Build command: `npm run build`; if the build environment restricts
   Turbopack worker sockets, use `npm run build -- --webpack`. Verify the initial
   backfill finishes before expecting populated fund charts.

The **Nightly fund data** workflow refreshes data at 18:30 UTC (00:00 IST), or
manually. Workflows have a six-hour timeout, share a concurrency group to avoid
conflicting NAV writes, and scheduled runs require the workflow on the default
branch. Vercel Hobby is intended for personal, non-commercial use. Account
credentials and storage/egress quotas remain the owner's responsibility.

For local cloud jobs, export the same variables before running the commands.
If credentials are already in a private `.env`, Node 22 can load them without
printing them:

```bash
node --env-file=.env --import tsx src/db/migrate.ts
node --env-file=.env --import tsx scripts/backfill.ts --limit 50
node --env-file=.env --import tsx scripts/benchmarks.ts
node --env-file=.env --import tsx scripts/precompute.ts
```

Cloudflare R2 remains an optional alternative: set `NAV_STORE=r2` and the four
`R2_*` variables documented in `.env.example`. The checked-in GitHub workflows
now target Supabase Storage; customize their environment if using R2.

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
