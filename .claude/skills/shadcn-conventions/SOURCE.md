# Source

- Project: shadcn-ui/ui (the official shadcn/ui repository)
- URL: https://github.com/shadcn-ui/ui/tree/main/skills/shadcn
- Files drawn from: `skills/shadcn/rules/styling.md`, `rules/composition.md`, `rules/forms.md`, `rules/icons.md`, and `customization.md`
- Commit fetched: c0d63c339d6cd2fc26135590a54cf1f362269451 (repo `main`, author date 2026-10-31)
- Date fetched: 2026-11-01
- License: MIT, https://github.com/shadcn-ui/ui/blob/main/LICENSE.md (Copyright shadcn)

## What was changed from the original

This is an **adapted subset**, not a verbatim copy, of the official skill:

- Dropped entirely: the top-level `SKILL.md`'s CLI-automation workflow (it embeds a live `npx shadcn@latest info --json` shell-execution directive and an `allowed-tools` Bash grant), `cli.md`, `mcp.md`, `registry.md`, `rules/chat.md` (chat-UI components, not relevant to a fund screener), `rules/base-vs-radix.md`, `design-system.md`, and `design-system-page.md` (these assume building a full brand design-system showcase from a `DESIGN.md`, out of scope for this app's v1). None of the dropped files were needed for component/styling/theming guidance, and dropping the CLI-execution parts follows this task's rule against copying anything that runs commands or fetches remote content automatically.
- `references/styling.md`, `composition.md`, `forms.md`, `icons.md`: copied with em dashes normalized to hyphens, chat-component rows/links removed from the Group table, one broken cross-file link (`base-vs-radix.md`) replaced with an inline note, and a few fund-screener-specific example tweaks (e.g. the `ToggleGroup` example now shows the 1Y/3Y/5Y/10Y window switcher from `docs/PLAN.md` instead of the original's generic daily/weekly/monthly example). One likely source typo (`import { cn } from "cn"`) was corrected to the standard `@/lib/utils` path.
- `references/customization.md`: trimmed of preset-code/CLI theme-switching commands (`npx shadcn@latest apply <preset>`) since those assume the hosted preset builder; kept and expanded the CSS-variable/OKLCH/dark-mode material, and added a worked example for defining the quartile color scale and chart palette as theme tokens, since that is the specific need called out in this project's design brief.
- The top-level `SKILL.md` here was written for this task; it is a new synthesis (principles, critical-rules index, component-selection table, "Updating components" section) built from the official `SKILL.md`'s non-CLI content, not a copy of it.

No scripts, assets, or images from the original skill folder were copied.
