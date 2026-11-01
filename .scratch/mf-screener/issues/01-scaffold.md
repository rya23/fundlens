# 01 Scaffold the Next.js app

Status: resolved
Blocked by: none

Spec: `../spec.md`, `docs/PLAN.md` (Stack, Architecture).

## Scope
- Project `.npmrc` (official registry, see spec). Next.js latest stable, App Router, TypeScript strict, `src/` dir, Tailwind, shadcn/ui init, next-themes dark/light toggle in a minimal app shell (header nav: Screener, Compare, SIP calculator).
- Placeholder pages: `/`, `/fund/[schemeCode]`, `/compare`, `/tools/sip`.
- Vitest configured (node env; jsdom only where needed), ESLint, `typecheck` script.
- `src/lib/env.ts`: zod-validated env (DATABASE_URL, NAV_STORE, R2_* vars optional unless NAV_STORE=r2, RISK_FREE_RATE default 0.065). `.env.example` documenting every var. Never read `.env`.
- `.gitignore` covers `.data/`, `.env*` except `.env.example`.
- README: local dev with zero credentials (pglite + fs store), scripts list.

## Acceptance
- `npm run typecheck && npm run lint && npm test && npm run build` pass; dev server renders all four routes with working theme toggle.
