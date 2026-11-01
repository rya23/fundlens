"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCount } from "@/lib/screener/format";

export interface MultiSelectOption {
  value: string;
  count?: number;
  /** Options with the same group are listed under a shared heading. */
  group?: string;
}

interface MultiSelectProps {
  label: string;
  options: readonly MultiSelectOption[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
  /** Noun for the search box and empty state, e.g. "AMC". */
  noun?: string;
}

function summary(selected: readonly string[]): string {
  if (selected.length === 0) return "Any";
  if (selected.length === 1) return selected[0];
  return `${selected.length} selected`;
}

/** A searchable multi-select: a popover of checkboxes. Nothing selected means "any". */
export function MultiSelect({ label, options, selected, onChange, noun = label.toLowerCase() }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();

  // Selected values that are not in the current universe (e.g. from a shared
  // link) stay listed, so they can be seen and removed.
  const known = new Set(options.map((o) => o.value));
  const all: MultiSelectOption[] = [
    ...options,
    ...selected.filter((v) => !known.has(v)).map((value) => ({ value, count: 0 })),
  ];

  const groups = new Map<string, MultiSelectOption[]>();
  for (const option of all) {
    const key = option.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), option]);
  }

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="w-full justify-between font-normal"
              aria-labelledby={labelId}
            />
          }
        >
          <span className="min-w-0 truncate" data-empty={selected.length === 0 || undefined}>
            {summary(selected)}
          </span>
          <ChevronsUpDownIcon data-icon="inline-end" className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder={`Search ${noun}…`} aria-label={`Search ${noun}`} />
            <CommandList className="max-h-72">
              <CommandEmpty>No {noun} matches.</CommandEmpty>
              {[...groups.entries()].map(([group, items]) => (
                <CommandGroup key={group} heading={group || undefined}>
                  {items.map((option) => {
                    const checked = selected.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        data-checked={checked}
                        onSelect={() => toggle(option.value)}
                        className="gap-2"
                      >
                        <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                        <span className="min-w-0 flex-1 truncate">{option.value}</span>
                        {option.count !== undefined && option.count > 0 ? (
                          <span className="text-xs text-muted-foreground tabular-nums">{formatCount(option.count)}</span>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
            {selected.length > 0 ? (
              <div className="border-t p-1">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                  Clear {label.toLowerCase()}
                </Button>
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
