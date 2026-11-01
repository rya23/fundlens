# Component Composition

## Contents

- Items always inside their Group component
- Callouts use Alert
- Empty states use Empty component
- Toast notifications follow the project base
- Choosing between overlay components
- Dialog, Sheet, and Drawer always need a Title
- Card structure
- Button has no isPending or isLoading prop
- TabsTrigger must be inside TabsList
- Avatar always needs AvatarFallback
- Use Separator instead of raw hr or border divs
- Use Skeleton for loading placeholders
- Use Badge instead of custom styled spans

---

## Items always inside their Group component

Never render items directly inside the content container.

**Incorrect:**

```tsx
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
  <SelectItem value="banana">Banana</SelectItem>
</SelectContent>
```

**Correct:**

```tsx
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
  </SelectGroup>
</SelectContent>
```

This applies to all group-based components:

| Item | Group |
|------|-------|
| `SelectItem`, `SelectLabel` | `SelectGroup` |
| `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSub` | `DropdownMenuGroup` |
| `MenubarItem` | `MenubarGroup` |
| `ContextMenuItem` | `ContextMenuGroup` |
| `CommandItem` | `CommandGroup` |

---

## Callouts use Alert

```tsx
<Alert>
  <AlertTitle>Warning</AlertTitle>
  <AlertDescription>Something needs attention.</AlertDescription>
</Alert>
```

---

## Empty states use Empty component

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>No funds match these filters</EmptyTitle>
    <EmptyDescription>Try widening a range filter or clearing a category.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Clear filters</Button>
  </EmptyContent>
</Empty>
```

---

## Toast notifications follow the project base

For Base UI projects, use the `toast` component:

```tsx
import { toast } from "@/components/ui/toast"

toast.add({
  title: "Changes saved.",
})
```

For Radix and React Aria projects, use Sonner:

```tsx
import { toast } from "sonner"

toast.success("Changes saved.")
toast.error("Something went wrong.")
```

Check which primitive base (`radix` or `base`) the project was initialized with before picking one.

---

## Choosing between overlay components

| Use case | Component |
|----------|-----------|
| Focused task that requires input | `Dialog` |
| Destructive action confirmation | `AlertDialog` |
| Side panel with details or filters | `Sheet` - a natural fit for the screener's filter panel or a fund's quick-view |
| Mobile-first bottom panel | `Drawer` |
| Quick info on hover | `HoverCard` |
| Small contextual content on click | `Popover` |

---

## Dialog, Sheet, and Drawer always need a Title

`DialogTitle`, `SheetTitle`, `DrawerTitle` are required for accessibility. Use `className="sr-only"` if visually hidden.

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>Edit Profile</DialogTitle>
    <DialogDescription>Update your profile.</DialogDescription>
  </DialogHeader>
  ...
</DialogContent>
```

---

## Card structure

Use full composition - don't dump everything into `CardContent`:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Rolling Returns</CardTitle>
    <CardDescription>3Y windows, daily granularity.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>
    <Button variant="outline">Change window</Button>
  </CardFooter>
</Card>
```

---

## Button has no isPending or isLoading prop

Compose with `Spinner` + `data-icon` + `disabled`:

```tsx
<Button disabled>
  <Spinner data-icon="inline-start" />
  Saving...
</Button>
```

---

## TabsTrigger must be inside TabsList

Never render `TabsTrigger` directly inside `Tabs` - always wrap in `TabsList`:

```tsx
<Tabs defaultValue="trailing">
  <TabsList>
    <TabsTrigger value="trailing">Trailing</TabsTrigger>
    <TabsTrigger value="rolling">Rolling</TabsTrigger>
  </TabsList>
  <TabsContent value="trailing">...</TabsContent>
</Tabs>
```

---

## Avatar always needs AvatarFallback

Always include `AvatarFallback` for when the image fails to load:

```tsx
<Avatar>
  <AvatarImage src="/amc-logo.png" alt="" />
  <AvatarFallback>AMC</AvatarFallback>
</Avatar>
```

---

## Use existing components instead of custom markup

| Instead of | Use |
|---|---|
| `<hr>` or `<div className="border-t">` | `<Separator />` |
| `<div className="animate-pulse">` with styled divs | `<Skeleton className="h-4 w-3/4" />` |
| `<span className="rounded-full bg-green-100 ...">` | `<Badge variant="secondary">` |
