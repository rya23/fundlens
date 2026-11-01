---
name: web-interface-guidelines
description: Concise, framework-agnostic MUST/SHOULD/NEVER rules for building accessible, fast, correct web UI (keyboard, forms, focus, animation, layout, dark mode, performance, i18n, charts). Apply while building any interactive page or component, and re-check against it before calling UI work done.
---

# Web Interface Guidelines

Concise rules for building accessible, fast, delightful UIs. Use MUST/SHOULD/NEVER to guide decisions. Apply this alongside the `frontend-design` skill (aesthetic direction) and the `shadcn-conventions` skill (component usage): this skill is the correctness and accessibility floor underneath both.

## Interactions

### Keyboard

- MUST: Full keyboard support per [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/)
- MUST: Visible, unobscured focus rings (`:focus-visible`; group with `:focus-within`); sticky/fixed elements never cover focus
- MUST: Manage focus (trap, move, return) per APG patterns
- NEVER: `outline: none` without visible focus replacement

### Targets & Input

- MUST: Hit target >= 24px (mobile >= 44px); if visual target < 24px, expand the hit area
- MUST: Mobile `<input>` font-size >= 16px to prevent iOS zoom
- NEVER: Disable browser zoom (`user-scalable=no`, `maximum-scale=1`)
- MUST: `touch-action: manipulation` to prevent double-tap zoom
- SHOULD: Set `-webkit-tap-highlight-color` to match design

### Forms

- MUST: Hydration-safe inputs (no lost focus/value)
- NEVER: Block paste in `<input>`/`<textarea>`
- MUST: Loading buttons show spinner and keep original label
- MUST: Enter submits focused input; in `<textarea>`, Cmd/Ctrl+Enter submits
- MUST: Keep submit enabled until request starts; then disable with spinner
- MUST: Accept free text, validate after - don't block typing
- MUST: Allow incomplete form submission to surface validation
- MUST: Errors inline next to fields; on submit, focus first error
- MUST: `autocomplete` + meaningful `name`; correct `type` and `inputmode`
- SHOULD: Disable spellcheck for emails/codes/usernames
- SHOULD: Placeholders end with an ellipsis and show an example pattern
- MUST: Warn on unsaved changes before navigation
- MUST: Compatible with password managers & 2FA; allow pasting codes
- MUST: Trim values to handle text expansion trailing spaces
- MUST: No dead zones on checkboxes/radios; label+control share one hit target

### State & Navigation

- MUST: URL reflects state (deep-link filters/tabs/pagination/expanded panels) - directly applies to the screener's filter/sort/column state
- MUST: Back/Forward restores scroll position
- MUST: Links use `<a>`/`<Link>` for navigation (support Cmd/Ctrl/middle-click)
- NEVER: Use `<div onClick>` for navigation

### Feedback

- SHOULD: Optimistic UI; reconcile on response; on failure rollback or offer Undo
- MUST: Confirm destructive actions or provide an Undo window
- MUST: Use polite `aria-live` for toasts/inline validation
- SHOULD: Ellipsis for options opening follow-ups ("Rename...") and loading states ("Loading...")

### Touch & Drag

- MUST: Generous targets, clear affordances; avoid finicky interactions
- MUST: Delay first tooltip; subsequent peers instant
- MUST: `overscroll-behavior: contain` in modals/drawers
- SHOULD: When suppressing page rubber-band bounce, set `overscroll-behavior: none` on `<html>` inside `@media (pointer: fine)`; keep coarse-pointer page defaults for pull-to-refresh
- MUST: During drag, disable text selection and set `inert` on dragged elements
- MUST: Drag/swipe/pinch/path gestures have a tap/click and keyboard alternative unless essential
- MUST: If it looks clickable, it must be clickable

### Autofocus

- SHOULD: Autofocus on desktop with a single primary input; rarely on mobile

## Animation

- MUST: Honor `prefers-reduced-motion` (provide reduced variant or disable)
- SHOULD: Prefer CSS > Web Animations API > JS libraries
- MUST: Animate compositor-friendly props (`transform`, `opacity`) only
- NEVER: Animate layout props (`top`, `left`, `width`, `height`)
- NEVER: `transition: all` - list properties explicitly
- SHOULD: Animate only to clarify cause/effect or add deliberate delight
- SHOULD: Choose easing to match the change (size/distance/trigger)
- MUST: Animations interruptible and input-driven; autoplay only for muted, non-essential loops
- MUST: Autoplay motion >5s alongside other content has pause, stop, or hide controls
- MUST: Correct `transform-origin` (motion starts where it "physically" should)
- MUST: SVG transforms on a `<g>` wrapper with `transform-box: fill-box`

## Layout

- SHOULD: Optical alignment; adjust +/-1px when perception beats geometry
- MUST: Deliberate alignment to grid/baseline/edges - no accidental placement
- SHOULD: Balance icon/text lockups (weight/size/spacing/color)
- MUST: Verify mobile, laptop, and ultra-wide (simulate ultra-wide at 50% zoom) - this app is desktop-first but must not break on a laptop or ultra-wide monitor
- MUST: Respect safe areas (`env(safe-area-inset-*)`)
- MUST: Avoid unwanted scrollbars; fix overflows
- SHOULD: Flex/grid over JS measurement for layout

## Content & Accessibility

- SHOULD: Inline help first; tooltips last resort
- MUST: Skeletons mirror final content to avoid layout shift
- MUST: `<title>` matches current context
- MUST: No dead ends; always offer next step/recovery
- MUST: Design empty/sparse/dense/error states - a screener table with zero matching funds, or an AMC with one fund, both need a designed state
- SHOULD: Curly quotes; avoid widows/orphans (`text-wrap: balance`)
- MUST: `font-variant-numeric: tabular-nums` for number comparisons - required for every numeric column (AUM, TER, CAGR, Sharpe, etc.) in the screener and fund-detail tables
- MUST: Redundant status cues (not color-only); icons have text labels
- MUST: Accessible names exist even when visuals omit labels
- MUST: Use the ellipsis character, not three periods
- MUST: `scroll-margin-top` on headings; "Skip to content" link; hierarchical `<h1>`-`<h6>`
- MUST: Resilient to user-generated content (short/avg/very long) - long fund names and AMC names must not break table layout
- MUST: Locale-aware dates/times/numbers (`Intl.DateTimeFormat`, `Intl.NumberFormat`)
- SHOULD: `translate="no"` on brand names, code tokens, & identifiers to prevent garbled auto-translation
- MUST: Accurate `aria-label`; decorative elements `aria-hidden`
- MUST: Icon-only buttons have descriptive `aria-label`
- MUST: Prefer native semantics (`button`, `a`, `label`, `table`) before ARIA
- MUST: Media has captions/transcripts/descriptions as applicable; controls are keyboard-operable; decorative media hidden from assistive tech
- MUST: Non-breaking spaces for glued terms, e.g. `10&nbsp;%`, `3Y&nbsp;CAGR`

## Content Handling

- MUST: Text containers handle long content (`truncate`, `line-clamp-*`, `break-words`)
- MUST: Flex children need `min-w-0` to allow truncation
- MUST: Handle empty states - no broken UI for empty strings/arrays

## Performance

- SHOULD: Test iOS Low Power Mode and macOS Safari
- MUST: Measure reliably (disable extensions that skew runtime)
- MUST: Track and minimize re-renders (React DevTools/React Scan)
- MUST: Profile with CPU/network throttling
- MUST: Batch layout reads/writes; avoid reflows/repaints
- MUST: Mutations (`POST`/`PATCH`/`DELETE`) target <500ms
- SHOULD: Prefer uncontrolled inputs; controlled inputs cheap per keystroke
- MUST: Virtualize large lists (>50 items) - the screener's TanStack Table over the full fund universe needs row virtualization
- MUST: Preload above-fold images; lazy-load the rest
- MUST: Prevent CLS (explicit image/chart dimensions)
- SHOULD: `<link rel="preconnect">` for CDN domains
- SHOULD: Critical fonts: `<link rel="preload" as="font">` with `font-display: swap`
- SHOULD: `<video autoplay muted loop playsinline>` over animated GIF; provide still/reduced-motion alternative

## Dark Mode & Theming

- MUST: `color-scheme: dark` on `<html>` for dark themes
- SHOULD: `<meta name="theme-color">` matches page background
- MUST: Native `<select>`: explicit `background-color` and `color` (Windows dark-mode fix)

## Hydration

- MUST: Inputs with `value` need `onChange` (or use `defaultValue`)
- SHOULD: Guard date/time rendering against hydration mismatch

## Design

- SHOULD: Layered shadows (ambient + direct)
- SHOULD: Crisp edges via semi-transparent borders + shadows
- SHOULD: Nested radii: child radius <= parent radius; concentric
- SHOULD: Hue consistency: tint borders/shadows/text toward background hue
- MUST: Accessible charts (color-blind-friendly palettes) - applies directly to the quartile color-coding and NAV/rolling-return charts
- MUST: Meet contrast - prefer [APCA](https://apcacontrast.com/) over WCAG 2
- MUST: Increase contrast on `:hover`/`:active`/`:focus`
- SHOULD: Match browser UI to background
- SHOULD: Avoid dark color gradient banding (use background images when needed)

## Anti-patterns to flag in review

When reviewing UI code (your own or another agent's), flag these on sight:

- `user-scalable=no` or `maximum-scale=1` disabling zoom
- `onPaste` with `preventDefault`
- `transition: all`
- `outline-none` without a `focus-visible` replacement
- Inline `onClick` navigation without `<a>`
- `<div>` or `<span>` with click handlers (should be `<button>`)
- Images or charts without reserved dimensions (causes CLS)
- Large arrays `.map()` without virtualization
- Form inputs without labels
- Icon buttons without `aria-label`
- Hardcoded date/number formats (use `Intl.*`)
- `autoFocus` without clear justification
- Numeric table columns without `tabular-nums` or right alignment
- Quartile/status color coding that relies on color alone with no redundant cue (icon, label, pattern)
