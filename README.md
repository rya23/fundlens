# MF Screener

A free, data-dense screener for Indian (AMFI-registered) mutual funds. No
login, no billing. See `docs/PLAN.md` for the full product, math, and
architecture spec, and `.scratch/mf-screener/` for the issue tracker this was
built from.

## Local dev (zero credentials)

Nothing needs to be provisioned to run this locally: the default
`.env.example` values use a local, in-process Postgres (PGlite) and the
filesystem for NAV history - no Supabase project or Cloudflare account
required.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. `.data/` (gitignored) holds the local PGlite
database file and cached NAV JSON once later tickets wire up ingestion.

### Switching to real infrastructure

Set `DATABASE_URL` to a Postgres connection string (e.g. Supabase) and/or
`NAV_STORE=r2` with the `R2_*` variables filled in. Both are validated by
`src/lib/env.ts` on startup; see `.env.example` for the full list.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server (Turbopack). |
| `npm run build` | Production build. |
| `npm start` | Run the production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Regenerate Next's route types, then `tsc --noEmit`. |
| `npm test` | Run the Vitest suite once. |

## Stack

Next.js (App Router) + TypeScript (strict) + Tailwind CSS v4 + shadcn/ui
(`base-nova` style, Base UI primitives) + next-themes (light/dark) + Vitest.
See `docs/PLAN.md` for TanStack Table, Recharts, and Drizzle, added in later
tickets.

## Project layout

- `src/app/` - routes: `/` (screener), `/fund/[schemeCode]`, `/compare`,
  `/tools/sip`. All four are placeholders until their tickets land.
- `src/components/` - app shell (`site-header`, `site-nav`, `theme-toggle`,
  `theme-provider`) and `components/ui/` (shadcn primitives).
- `src/lib/env.ts` - zod-validated environment config (`parseEnv` is the
  pure, tested function; `getEnv()` reads and caches `process.env`).

## Testing

Vitest. Tests default to the `node` environment (fast, no DOM) for pure
logic; a file that needs the DOM opts in with a
`// @vitest-environment jsdom` docblock at its top (see
`src/components/site-nav.test.tsx`). A live-network smoke script, when one
exists, is excluded from `npm test`.

Never use the em dash character in code, docs, or commit messages - use "-".

## Jobs

All jobs read `DATABASE_URL` / `NAV_STORE` (and `R2_*` when `NAV_STORE=r2`)
from the environment, exactly like the app. Apply migrations first with
`npm run db:migrate`.

### Backfill (`npm run backfill`)

One-off load of the full NAV history of every AMFI scheme (all plans and
options). Discovers schemes from AMFI `NAVAll.txt` (mfapi `/mf/latest` as the
fallback), merges fund metadata, then fetches each scheme's history from
mfapi.in into the NavStore. Idempotent and resumable: progress is kept in
`ingest_state`, so after an interruption (Ctrl-C included) just run it again
and only missing or stale schemes are fetched. A failing scheme is recorded in
`ingest_state.last_error` and retried on the next run; it never aborts the
run.

```bash
npm run backfill -- --limit 50            # at most 50 schemes this run
npm run backfill -- --codes 122639,119528 # only these scheme codes
npm run backfill -- --concurrency 8       # default 4
```

### Benchmarks (`npm run benchmarks`)

Refreshes the benchmark series used for alpha/beta/etc. Incremental and safe to
re-run. The benchmark history is currently the NAV of a low-cost index fund per
index (stored as `index_fund_proxy`); a true TRI source is pending the owner's
decision. See `docs/benchmarks.md` for the mapping and the caveats (a proxy
understates the index by roughly the fund's TER).
