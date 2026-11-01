# Design skills

Three skills for implementation agents building this app's UI. All three apply together; none replaces another.

- **`frontend-design`** (Anthropic, official). Aesthetic direction: palette, typography, layout, restraint, avoiding "AI slop" defaults. Apply when starting a new page/view or deciding its visual identity.
- **`web-interface-guidelines`** (Vercel, adapted from official). MUST/SHOULD/NEVER correctness rules: keyboard, forms, focus, animation, performance, dark mode, i18n, accessible charts. Apply while building any interactive component, and re-check against it before calling UI work done.
- **`shadcn-conventions`** (shadcn/ui, adapted from official). How to use this project's actual component library correctly: semantic color tokens, `FieldGroup`/`ToggleGroup`/`Table` composition, theming via CSS variables. Apply whenever adding or editing a shadcn/ui component.

See each skill's `SOURCE.md` for the exact upstream commit, license, and what was changed or dropped from the original.

A fourth skill (a dedicated data-visualization/dashboard skill) was evaluated and skipped: the one well-maintained candidate found (`dashboard-creator`, community-maintained) generates generic static HTML KPI dashboards unrelated to this app's React/Recharts/TanStack Table stack, and its example markup is exactly the generic rounded-card, single-shadow look `frontend-design` warns against. The chart-accessibility and tabular-number rules that a data-viz skill would otherwise cover are already in `web-interface-guidelines`, and the chart-token setup is in `shadcn-conventions`.

## Project design brief

- Data-dense, numbers-first screener and fund-detail pages for Indian mutual funds, not a marketing site; look like an instrument panel, not a SaaS landing page.
- Desktop-first (users scan a wide table), but must stay usable down to a laptop width; no broken layout on ultra-wide.
- Dark and light themes via a toggle, both built from the same semantic CSS variable tokens so neither theme is an afterthought.
- Every numeric column (AUM, TER, CAGR, Sharpe, Alpha, Beta, Max DD, etc.) is right-aligned with `tabular-nums` so digits line up down the column.
- Quartile color-coding (Q1 best to Q4 worst) needs its own token scale, consistent across both themes, that stays distinguishable under common color-vision deficiencies and is never the only cue (pair color with the "Q1"-"Q4" label).
- Chart palette is restrained and consistent: a small, fixed set of series colors (fund vs. benchmark, category peers) reused across the NAV chart, rolling-return chart, and compare view, not a different ad hoc palette per chart.
- Long fund and AMC names must truncate gracefully in table cells without breaking row height or column alignment.
