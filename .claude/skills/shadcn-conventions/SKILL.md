---
name: shadcn-conventions
description: Conventions for using shadcn/ui correctly and consistently (semantic color tokens, component composition, forms, icons, theming) in this Next.js + Tailwind + shadcn/ui project. Apply whenever adding or editing a shadcn/ui component.
---

# shadcn/ui Conventions

This project's stack (`docs/PLAN.md`) is Next.js + Tailwind + shadcn/ui. These are the conventions shadcn/ui itself documents for using its components correctly - use them so the screener, fund-detail, compare, and SIP-calculator pages compose a consistent design system instead of ad hoc markup, and so the light/dark theme toggle works by construction rather than by chasing down hardcoded colors later.

## Principles

1. **Use existing components first.** Check the project's installed `components/ui/*` before writing custom UI. A settings-style panel is `FieldGroup` + `Field`; a filter sidebar is `Sheet` or a persistent panel of `Card` + form controls; a metric table is `Table` (or TanStack Table styled with shadcn's table primitives).
2. **Compose, don't reinvent.** Build larger views out of the primitives below rather than one-off `div` soup.
3. **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
4. **Use semantic colors, never raw Tailwind colors.** `bg-primary`, `text-muted-foreground` - never `bg-blue-500` or `text-emerald-600`. This is what makes the dark/light toggle correct everywhere at once, and it is what the quartile color-coding and chart palette should be built from too (see [customization.md](./references/customization.md)).

## Critical rules

Each links to a reference file with Incorrect/Correct code pairs.

- **Styling & Tailwind** -> [references/styling.md](./references/styling.md): semantic colors, `className` for layout only, `gap-*` not `space-x-*`/`space-y-*`, `size-*` over `w-* h-*`, `truncate`, no manual `dark:` overrides, `cn()` for conditional classes, no manual `z-index` on overlays.
- **Forms & inputs** -> [references/forms.md](./references/forms.md): `FieldGroup`/`Field`, `InputGroup`, `ToggleGroup` for small option sets (e.g. the 1Y/3Y/5Y/10Y window switcher), `FieldSet`/`FieldLegend`, validation and disabled states.
- **Component structure** -> [references/composition.md](./references/composition.md): items always inside their Group (`SelectItem` in `SelectGroup`, etc.), Dialog/Sheet/Drawer always need a Title, full `Card` composition, `TabsTrigger` inside `TabsList`, `Avatar` needs `AvatarFallback`, use `Alert`/`Empty`/`Separator`/`Skeleton`/`Badge` instead of custom markup.
- **Icons** -> [references/icons.md](./references/icons.md): `data-icon="inline-start"`/`"inline-end"` on icons in `Button`, no manual sizing classes inside components, pass icons as components not string keys.
- **Theming** -> [references/customization.md](./references/customization.md): CSS variable tokens, OKLCH, dark mode via `next-themes`, how to add the quartile color scale and chart palette as proper theme tokens instead of inline hex values.

## Key patterns

```tsx
// Form layout: FieldGroup + Field, not div + Label.
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="min-aum">Min AUM</FieldLabel>
    <Input id="min-aum" />
  </Field>
</FieldGroup>

// Icons in buttons: data-icon, no sizing classes.
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// Spacing: gap-*, not space-y-*.
<div className="flex flex-col gap-4">   {/* correct */}
<div className="space-y-4">             {/* wrong */}

// Status / quartile colors: semantic tokens or Badge, never raw colors.
<Badge variant="secondary">+20.1%</Badge>          {/* correct */}
<span className="text-emerald-600">+20.1%</span>   {/* wrong */}
```

## Component selection

| Need | Use |
| --- | --- |
| Button / action | `Button` with appropriate variant |
| Filter inputs | `Input`, `Select`, `Combobox`, `Slider` (range filters), `Checkbox` (multi-select), `ToggleGroup` (window/plan switcher) |
| Data display | `Table` (metric tables), `Card`, `Badge` (quartile/status), `Avatar` (AMC logo) |
| Navigation | `Sidebar`, `Tabs`, `Breadcrumb`, `Pagination` |
| Overlays | `Dialog` (modal), `Sheet` (filter panel / quick view), `Drawer` (mobile), `AlertDialog` (confirmation) |
| Feedback | `toast`/`sonner`, `Alert`, `Progress`, `Skeleton`, `Spinner` |
| Charts | `Chart` (shadcn's Recharts wrapper) - matches this project's Recharts choice in `docs/PLAN.md` |
| Layout | `Card`, `Separator`, `ScrollArea`, `Resizable` |
| Empty states | `Empty` (e.g. "no funds match these filters") |

## Updating components

shadcn/ui components are copied into the project as source, not installed as an opaque dependency, so updates are a deliberate, reviewed action rather than an automatic one:

1. Diff the installed component against upstream before touching it.
2. If there are no local changes, it is safe to take the upstream version.
3. If there are local changes, read both versions and merge by hand rather than overwriting blindly.
4. Never bulk-overwrite every installed component without reviewing the diff first.

## Detailed references

- [references/styling.md](./references/styling.md)
- [references/forms.md](./references/forms.md)
- [references/composition.md](./references/composition.md)
- [references/icons.md](./references/icons.md)
- [references/customization.md](./references/customization.md)
