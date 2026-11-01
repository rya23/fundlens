# 12-screener - INCOMPLETE (stopped early, owner out of usage)

Branch worktree-agent-abcf5286fc0b64882, worktree .claude/worktrees/agent-abcf5286fc0b64882.

Done (typecheck + lint pass, lib tests pass; build and full test run not re-run):
- src/lib/screener/: columns, state (URL parse/serialize), filter, quartile, format, presets, rows, data (loadScreenerData), synthetic, tests.
- peers.ts: added quartileFromCutPoints (+test). slider.tsx: thumbLabels prop.
- scripts/seed-dev.ts + `npm run seed:dev` (PGlite only, 1336 schemes). Stop dev server before seeding.
- Quartile tokens in globals.css; shadcn components added; @tanstack/react-table v9 + react-virtual installed.
- src/components/screener/multi-select.tsx.

NOT done: screener-view, table (TanStack v9 useTable + virtual rows), filter panel, range filters, column picker, presets bar, page.tsx wiring, loading/error/empty states, component test, browser check.

Decisions: server loads by plan/option, client filters/sorts. scheme_metrics assumed stored as fractions (0.12 = 12%); TER in percent; capture ratio 1.05 = 105%. category_stats.metric = column id (terPct included). Quartile needs count>=4. Benchmark-relative metrics null for non-equity (index preset avoids tracking error).
