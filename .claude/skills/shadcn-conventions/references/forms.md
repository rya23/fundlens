# Forms & Inputs

## Contents

- Forms use FieldGroup + Field
- InputGroup requires InputGroupInput/InputGroupTextarea
- Buttons inside inputs use InputGroup + InputGroupAddon
- Option sets (2-7 choices) use ToggleGroup
- FieldSet + FieldLegend for grouping related fields
- Field validation and disabled states

---

## Forms use FieldGroup + Field

Always use `FieldGroup` + `Field` - never raw `div` with `space-y-*`:

```tsx
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="min-aum">Min AUM (Cr)</FieldLabel>
    <Input id="min-aum" type="number" inputMode="decimal" />
  </Field>
  <Field>
    <FieldLabel htmlFor="max-ter">Max TER (%)</FieldLabel>
    <Input id="max-ter" type="number" inputMode="decimal" />
  </Field>
</FieldGroup>
```

Use `Field orientation="horizontal"` for settings-style rows (e.g. a filter panel). Use `FieldLabel className="sr-only"` for visually hidden labels.

**Choosing form controls:**

- Simple text input -> `Input`
- Dropdown with predefined options (e.g. category, AMC) -> `Select`
- Searchable dropdown over a large list (e.g. fund name search) -> `Combobox`
- Boolean toggle -> `Switch` (for settings, e.g. "Include Regular plans") or `Checkbox` (for multi-select filters)
- Single choice from few options -> `RadioGroup`
- Toggle between 2-5 options (e.g. window switcher 1Y/3Y/5Y/10Y) -> `ToggleGroup` + `ToggleGroupItem`
- Range filter -> `Slider` paired with a min/max `Input` pair, per `docs/PLAN.md`'s screener filter spec
- Multi-line text -> `Textarea`

---

## InputGroup requires InputGroupInput/InputGroupTextarea

Never use raw `Input` or `Textarea` inside an `InputGroup`.

**Incorrect:**

```tsx
<InputGroup>
  <Input placeholder="Search funds..." />
</InputGroup>
```

**Correct:**

```tsx
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"

<InputGroup>
  <InputGroupInput placeholder="Search funds..." />
</InputGroup>
```

---

## Buttons inside inputs use InputGroup + InputGroupAddon

Never place a `Button` directly inside or adjacent to an `Input` with custom positioning.

**Incorrect:**

```tsx
<div className="relative">
  <Input placeholder="Search funds..." className="pr-10" />
  <Button className="absolute right-0 top-0" size="icon">
    <SearchIcon />
  </Button>
</div>
```

**Correct:**

```tsx
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group"

<InputGroup>
  <InputGroupInput placeholder="Search funds..." />
  <InputGroupAddon>
    <Button size="icon">
      <SearchIcon data-icon="inline-start" />
    </Button>
  </InputGroupAddon>
</InputGroup>
```

---

## Option sets (2-7 choices) use ToggleGroup

Don't manually loop `Button` components with active state. This applies directly to the window switcher (1Y/3Y/5Y/10Y) on the fund detail page.

**Incorrect:**

```tsx
const [window, setWindow] = useState("3Y")

<div className="flex gap-2">
  {["1Y", "3Y", "5Y", "10Y"].map((w) => (
    <Button
      key={w}
      variant={window === w ? "default" : "outline"}
      onClick={() => setWindow(w)}
    >
      {w}
    </Button>
  ))}
</div>
```

**Correct:**

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

<ToggleGroup type="single" value={window} onValueChange={setWindow}>
  <ToggleGroupItem value="1Y">1Y</ToggleGroupItem>
  <ToggleGroupItem value="3Y">3Y</ToggleGroupItem>
  <ToggleGroupItem value="5Y">5Y</ToggleGroupItem>
  <ToggleGroupItem value="10Y">10Y</ToggleGroupItem>
</ToggleGroup>
```

> Note: `defaultValue`/`value` and the `type`/`multiple` props differ slightly between shadcn's Base UI and Radix primitive flavors. Check which primitive library (`base` or `radix`) this project was initialized with (see `components.json`) before copying examples verbatim.

---

## FieldSet + FieldLegend for grouping related fields

Use `FieldSet` + `FieldLegend` for related checkboxes, radios, or switches - not `div` with a heading:

```tsx
<FieldSet>
  <FieldLegend variant="label">Plan type</FieldLegend>
  <FieldDescription>Select all that apply.</FieldDescription>
  <FieldGroup className="gap-3">
    <Field orientation="horizontal">
      <Checkbox id="direct" defaultChecked />
      <FieldLabel htmlFor="direct" className="font-normal">Direct</FieldLabel>
    </Field>
    <Field orientation="horizontal">
      <Checkbox id="regular" />
      <FieldLabel htmlFor="regular" className="font-normal">Regular</FieldLabel>
    </Field>
  </FieldGroup>
</FieldSet>
```

---

## Field validation and disabled states

Both attributes are needed - `data-invalid`/`data-disabled` styles the field (label, description), while `aria-invalid`/`disabled` styles the control.

```tsx
// Invalid.
<Field data-invalid>
  <FieldLabel htmlFor="min-aum">Min AUM</FieldLabel>
  <Input id="min-aum" aria-invalid />
  <FieldDescription>Min must be less than max.</FieldDescription>
</Field>

// Disabled.
<Field data-disabled>
  <FieldLabel htmlFor="min-aum">Min AUM</FieldLabel>
  <Input id="min-aum" disabled />
</Field>
```

Works for all controls: `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroupItem`, `Switch`, `Slider`.
