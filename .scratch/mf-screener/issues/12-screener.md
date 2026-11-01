# 12 Screener page and API

Status: resolved
Blocked by: 02, 06

Spec: `docs/PLAN.md` (v1 surfaces: Screener), `.claude/skills/`.

## Scope
- Server data access for `scheme_metrics` + `schemes` + `category_stats`; route handler or server component data loading with filters/sort applied server-side or client-side (choose for ~2-3k Direct-Growth rows; justify).
- TanStack Table: default columns, column picker, sorting, filters (multi-select category/sub-category/AMC/riskometer/plan; range slider + min/max for numeric columns; name search), Direct-Growth default with Regular/IDCW toggle, presets, full state in the URL query string, quartile colour-coding via category_stats, rows link to fund detail.
- `scripts/seed-dev.ts` (`npm run seed:dev`): plausible synthetic schemes/metrics/stats in the local PGlite so the UI is reviewable without a backfill.

## Acceptance
- Unit tests for URL state (de)serialisation and filter logic; component test for the table; manual check in the browser against the design skills.

## Comments

- 2026-11-01: partial WIP on branch `worktree-agent-abcf5286fc0b64882` (commit 0893cd8): data layer, URL state, presets, seed:dev, multi-select done; table UI, filter panel, page wiring, browser check not done. Merge mf-screener into it and continue. Notes: `.scratch/mf-screener/notes/12-screener.md`.

## Completion (2026-11-01)

Implemented on `mf-screener`. New automated tests and E2E were explicitly waived by the owner to save tokens. See HANDOFF.md for validation and runtime limitations.
