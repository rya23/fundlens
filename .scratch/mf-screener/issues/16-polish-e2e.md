# 16 Polish and E2E UI check

Status: ready-for-agent
Blocked by: 11, 14, 15

Spec: `docs/PLAN.md`, `.claude/skills/` (web-interface-guidelines checklist).

## Scope
- Playwright E2E for the main flows on seeded local data: screener filter + sort + URL round-trip, open fund detail, compare, SIP calculator. Light and dark, desktop and mobile widths.
- Pixel-picky pass against the design skills: fix spacing, alignment, overflow, focus states, loading/empty/error states, number formatting (Indian grouping, %), a11y.
- README final: setup steps for Supabase, R2, GH secrets, Vercel.

## Acceptance
- E2E suite passes; all checks green; screenshots reviewed.
