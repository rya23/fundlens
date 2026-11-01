# 15 SIP / XIRR calculator

Status: resolved
Blocked by: 03, 06, 12

Spec: `docs/PLAN.md` (v1 surfaces: SIP calculator), `.claude/skills/`.

## Scope
- `/tools/sip`: fund search, monthly amount, start/end dates; outputs invested, current value, gain, XIRR (or n/a reason), invested vs value chart, cashflow table. Computed live from the NavStore via `sip.ts`. State in URL.

## Acceptance
- Tests for input validation and the server computation; browser check.

## Completion (2026-11-01)

Implemented on `mf-screener`. New automated tests and E2E were explicitly waived by the owner to save tokens. See HANDOFF.md for validation and runtime limitations.
