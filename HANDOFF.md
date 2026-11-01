# Handoff: MF Screener v1 (2026-11-01)

Implementation is complete on local branch `mf-screener`; nothing has been pushed
or deployed. Tickets 01-16 are resolved. The owner explicitly waived new tests
and E2E to save tokens; ticket 16 is complete with that validation exception.

## Available now

- Screener with URL filters, numeric ranges, presets, sortable virtual table,
  column picker, category quartiles, and compare selection.
- Fund detail with NAV/benchmark charts, trailing and rolling returns, rolling
  distributions, risk windows, metadata, and default-window category ranks.
- Comparison of 2-5 funds with shared-period NAV charts and metric highlighting.
- Historical SIP calculator with shareable inputs, XIRR, cashflow chart/table.
- Precompute, nightly increment, benchmark refresh, and GitHub Actions workflows.
- Local synthetic seed with NAV and benchmark history for all seeded funds.

## Run locally

```bash
npm ci --registry=https://registry.npmjs.org/
cp .env.example .env.local
npm run seed:dev
npm run dev
```

Stop the server before seeding. Seed refuses R2, remote Postgres, or a database
containing real data. CLI scripts use exported variables, not `.env` files.
See README.md for real-data ingestion and deployment instructions.

## Validation and environment

- Existing suite passed earlier in this session: 311 tests / 28 files. No new
  tests were added; no automated E2E suite was created or run, per owner request.
- Typecheck and lint checked during implementation; final check results are in
  the delivery message.
- Production build passed with `npm run build -- --webpack`. Turbopack's CSS
  worker cannot bind a socket in this execution environment. The standard
  Tailwind PostCSS configuration supports both bundlers; use
  `npm run dev -- --webpack` for this environment as well.
- `tsx` CLI also hits a local IPC restriction here. Equivalent local command:
  `node --import tsx scripts/seed-dev.ts` (same for other TS job scripts).
- Review data: `DATABASE_URL=pglite:.data/review-db`,
  `NAV_STORE=fs:.data/review-nav`. This was used only for synthetic page review.
- Manual browser samples covered screener search/URL state, fund charts and
  ranks, compare charts, SIP totals and pagination, light/dark, desktop and
  narrow views. Further E2E/browser inspection was stopped at owner request.
- Live cloud infrastructure and Actions execution remain unverified. No remote
  is configured. GitHub schedules activate only on the default branch.

## Decisions and limits

Read `docs/PLAN.md`, `.scratch/mf-screener/spec.md`, ticket notes, and
`docs/V2_BACKLOG.md` before changes. Keep v1 minimal.

Benchmarks remain index-fund proxies, not real TRI; short histories produce
null relative metrics. Synthetic benchmarks are prefixed and visibly labeled.
Peer percentile snapshots cover default 3Y metrics and 5Y drawdown; alternate
windows show n/a ranks. Fund assembly caches approximately 24 hours. SIP skips
purchase dates without available NAV and displays the actual first purchase.

## Working rules

- Read AGENTS.md and relevant installed Next.js docs before code changes.
- Never read `.env`; never use the em dash character.
- Prefix shell commands with `rtk`. Official npm registry only.
- No whole-tree formatter/lint fixes, no pushes, no AI co-author trailers.
- Existing historical agent worktrees remain under `.claude/worktrees/`.
  Cleanup was deferred to avoid deleting unrelated local work.
