# 14 Compare page

Status: resolved
Blocked by: 13

Spec: `docs/PLAN.md` (v1 surfaces: Compare), `.claude/skills/`.

## Scope
- `/compare?codes=...`: 2-5 funds, fund picker (search), rebased-to-100 NAV overlay, rolling-return overlay with window switcher, side-by-side metric table with best-in-row highlight. Reuse fund detail data assembly. "Add to compare" entry points from screener and fund detail.

## Acceptance
- Tests for codes parsing/validation; browser check.

## Completion (2026-11-01)

Implemented on `mf-screener`. New automated tests and E2E were explicitly waived by the owner to save tokens. See HANDOFF.md for validation and runtime limitations.
