# Customization & Theming

Components reference semantic CSS variable tokens. Change the variables to change every component - and to drive the dark/light toggle this project needs.

## Contents

- How it works (CSS variables -> Tailwind utilities -> components)
- Color variables and OKLCH format
- Dark mode setup
- Adding custom colors (quartile scale, chart palette)
- Border radius
- Customizing components (variants, className, wrappers)

---

## How It Works

1. CSS variables defined in `:root` (light) and `.dark` (dark mode).
2. Tailwind maps them to utilities: `bg-primary`, `text-muted-foreground`, etc.
3. Components use these utilities - changing a variable changes all components that reference it.

---

## Color Variables

Every color follows the `name` / `name-foreground` convention. The base variable is for backgrounds, `-foreground` is for text/icons on that background.

| Variable | Purpose |
| --- | --- |
| `--background` / `--foreground` | Page background and default text |
| `--card` / `--card-foreground` | Card surfaces |
| `--primary` / `--primary-foreground` | Primary buttons and actions |
| `--secondary` / `--secondary-foreground` | Secondary actions |
| `--muted` / `--muted-foreground` | Muted/disabled states |
| `--accent` / `--accent-foreground` | Hover and accent states |
| `--destructive` / `--destructive-foreground` | Error and destructive actions |
| `--border` | Default border color |
| `--input` | Form input borders |
| `--ring` | Focus ring color |
| `--chart-1` through `--chart-5` | Chart / data visualization series |
| `--sidebar-*` | Sidebar-specific colors |

Colors use OKLCH: `--primary: oklch(0.205 0 0)` where values are lightness (0-1), chroma (0 = gray), and hue (0-360). OKLCH is worth keeping for this project specifically because it makes it straightforward to hold perceived lightness constant while changing hue - useful for building a quartile scale (Q1-Q4) and a chart palette that stays readably distinct and roughly equal-contrast in both light and dark mode.

---

## Dark Mode

Class-based toggle via `.dark` on the root element. In Next.js, use `next-themes`:

```tsx
import { ThemeProvider } from "next-themes"

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

---

## Adding Custom Colors

Add variables to the project's global CSS file (typically `globals.css` or `app/globals.css`). Never create a new CSS file for this - keep all theme tokens in one place.

```css
/* 1. Define in the global CSS file, for both light and dark. */
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);

  /* Example quartile scale - pick values that stay distinguishable
     under common color-vision deficiencies, not just by hue. */
  --quartile-1: oklch(0.55 0.14 150); /* Q1 (best) */
  --quartile-2: oklch(0.60 0.10 230);
  --quartile-3: oklch(0.65 0.12 70);
  --quartile-4: oklch(0.55 0.18 25);  /* Q4 (worst) */
}
.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);

  --quartile-1: oklch(0.70 0.14 150);
  --quartile-2: oklch(0.72 0.10 230);
  --quartile-3: oklch(0.75 0.12 70);
  --quartile-4: oklch(0.68 0.18 25);
}
```

```css
/* 2a. Register with Tailwind v4 (@theme inline). */
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-quartile-1: var(--quartile-1);
  --color-quartile-2: var(--quartile-2);
  --color-quartile-3: var(--quartile-3);
  --color-quartile-4: var(--quartile-4);
}
```

If the project is on Tailwind v3 instead, register the same variables under `theme.extend.colors` in `tailwind.config.js` rather than `@theme inline`.

```tsx
// 3. Use in components.
<span className="bg-quartile-1/15 text-quartile-1">Q1</span>
```

The numbers above are placeholders, not a finished palette - pick final values with an actual contrast/color-blindness check (see the `web-interface-guidelines` skill's "Accessible charts" rule), and never encode the quartile by color alone: pair it with the text label ("Q1") or an icon, per that same skill's redundant-status-cue rule.

---

## Border Radius

`--radius` controls border radius globally. Components derive values from it (`rounded-lg` = `var(--radius)`, `rounded-md` = `calc(var(--radius) - 2px)`). For a data-dense, desktop-first screener, a smaller `--radius` (tighter corners) usually reads as more "instrument panel" than a large, consumer-app radius - pick deliberately rather than keeping a default.

---

## Customizing Components

See also: [styling.md](./styling.md) for Incorrect/Correct examples.

Prefer these approaches in order:

### 1. Built-in variants

```tsx
<Button variant="outline" size="sm">
  Click
</Button>
```

### 2. Tailwind classes via `className`

```tsx
<Card className="mx-auto max-w-md">...</Card>
```

### 3. Add a new variant

Edit the component source to add a variant via `cva`:

```tsx
// components/ui/badge.tsx
warning: "bg-warning text-warning-foreground hover:bg-warning/90",
```

### 4. Wrapper components

Compose shadcn/ui primitives into higher-level components:

```tsx
export function QuartileBadge({ quartile }: { quartile: 1 | 2 | 3 | 4 }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium tabular-nums", quartileClass[quartile])}>
      Q{quartile}
    </span>
  )
}
```
