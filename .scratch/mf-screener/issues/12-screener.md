# 12 Screener page and API

Status: ready-for-agent
Blocked by: 02, 06

Spec: `docs/PLAN.md` (v1 surfaces: Screener), `.claude/skills/`.

## Scope
- Server data access for `scheme_metrics` + `schemes` + `category_stats`; route handler or server component data loading with filters/sort applied server-side or client-side (choose for ~2-3k Direct-Growth rows; justify).
- TanStack Table: default columns, column picker, sorting, filters (multi-select category/sub-category/AMC/riskometer/plan; range slider + min/max for numeric columns; name search), Direct-Growth default with Regular/IDCW toggle, presets, full state in the URL query string, quartile colour-coding via category_stats, rows link to fund detail.
- `scripts/seed-dev.ts` (`npm run seed:dev`): plausible synthetic schemes/metrics/stats in the local PGlite so the UI is reviewable without a backfill.

## Acceptance
- Unit tests for URL state (de)serialisation and filter logic; component test for the table; manual check in the browser against the design skills.
