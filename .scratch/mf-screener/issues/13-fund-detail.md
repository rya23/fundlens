# 13 Fund detail page

Status: ready-for-agent
Blocked by: 03, 05, 06, 08, 12

Spec: `docs/PLAN.md` (v1 surfaces: Fund detail), `.claude/skills/`.

## Scope
- `/fund/[schemeCode]`: compute on demand from NavStore + benchmark_nav (cached ~24h): NAV vs benchmark chart (rebased), trailing 1/3/5/10Y, rolling 1/3/5Y distribution chart with min/median/max and % beating benchmark, risk ratios with 1/3/5/10Y window switcher, each with category quartile + percentile label, metadata block, official benchmark vs benchmark used. Graceful n/a states. Not-found page.
- Extend `seed:dev` with synthetic NAV files so the page renders locally.

## Acceptance
- Tests for the data assembly function; browser check in light and dark.
