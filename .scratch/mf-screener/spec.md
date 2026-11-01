# Spec: MF Screener v1

Status: ready-for-agent

The product, math, data sources, architecture and stack are fully specified in `docs/PLAN.md` (source of truth). Deferred work is in `docs/V2_BACKLOG.md`; do not build it. Read both before any ticket.

## Additions settled at implementation start (2026-11-01)

- **npm registry**: the repo has a project `.npmrc` with `registry=https://registry.npmjs.org/`. Never install from any other registry. The user's global npmrc sets `ignore-scripts=true` and `min-release-age=7`; if a package needs an install script (e.g. `sharp`, `esbuild`), run `npm rebuild <pkg>` for it explicitly rather than turning scripts on globally.
- **Runs locally with no cloud credentials.** The owner has not provisioned Supabase or R2 yet, so:
  - DB: `DATABASE_URL` may be a normal Postgres URL (Supabase, via postgres-js) **or** `pglite:<dir>` / `pglite:memory` (via `@electric-sql/pglite` + drizzle's pglite driver). Tests use in-memory PGlite. Same Drizzle schema and migrations for both.
  - NAV history: a `NavStore` interface with two implementations, `R2NavStore` (`@aws-sdk/client-s3`) and `FsNavStore` (`NAV_STORE=fs:<dir>`, same `nav/{schemeCode}.json.gz` layout). Local dev uses the FS one.
  - Local data dirs live under `.data/` (gitignored).
- **Commits**: implementer agents commit on their own ticket branches; merges go to the integration branch `mf-screener`. Nothing is pushed. Never add an AI co-author trailer.
- **Design**: UI tickets follow `.claude/skills/` (frontend-design, web-interface-guidelines, shadcn-conventions; see `.claude/skills/README.md` if present).
- **Tests**: Vitest. Hand-computed fixtures for math; recorded fixture files (not live network) for parsers and source clients. A live-network smoke script is fine but must not run in `npm test`.

## Definition of done (every ticket)

`npm run typecheck`, `npm run lint`, `npm test` and (once the app exists) `npm run build` all pass with zero warnings you introduced. No em dash characters anywhere.
