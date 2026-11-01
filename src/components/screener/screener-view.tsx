"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, RotateCcwIcon } from "lucide-react";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import { MultiSelect } from "@/components/screener/multi-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { COLUMN_GROUPS, NUMERIC_COLUMNS, TEXT_COLUMNS, getColumnMeta, getNumericColumn, isNumericColumnId, type ColumnId, type OptionalColumnId } from "@/lib/screener/columns";
import { columnExtent, facetCounts, filterRows } from "@/lib/screener/filter";
import { EMPTY_CELL, formatCell, formatCount, formatIsoDate, formatWithUnit } from "@/lib/screener/format";
import { PRESETS, activePresetId, applyPreset } from "@/lib/screener/presets";
import { cellQuartile } from "@/lib/screener/quartile";
import { activeFilterCount, clearFilters, parseScreenerState, serializeScreenerState, type RangeFilter, type ScreenerState } from "@/lib/screener/state";
import type { ScreenerData, ScreenerRow } from "@/lib/screener/types";

function queryString(state: ScreenerState) {
  const query = serializeScreenerState(state).toString();
  return query ? `?${query}` : "";
}

const tableFeaturesConfig = tableFeatures({});
const tableColumnHelper = createColumnHelper<typeof tableFeaturesConfig, ScreenerRow>();
const quartileClasses = {
  1: "bg-quartile-1/15 text-quartile-1-foreground",
  2: "bg-quartile-2/15 text-quartile-2-foreground",
  3: "bg-quartile-3/15 text-quartile-3-foreground",
  4: "bg-quartile-4/15 text-quartile-4-foreground",
} as const;

function RangeControl({ id, state, extent, onChange }: { id: (typeof NUMERIC_COLUMNS)[number]["id"]; state: RangeFilter | undefined; extent?: { min: number; max: number }; onChange: (range: RangeFilter | undefined) => void }) {
  const column = getNumericColumn(id);
  if (!extent) return <p className="text-xs text-muted-foreground">No values available</p>;
  const low = state?.min ?? extent.min;
  const high = state?.max ?? extent.max;
  const step = column.step;
  const setBounds = (a: number, b: number) => {
    const min = Math.max(extent.min, Math.min(a, b));
    const max = Math.min(extent.max, Math.max(a, b));
    onChange(min <= extent.min && max >= extent.max ? undefined : { ...(min > extent.min ? { min } : {}), ...(max < extent.max ? { max } : {}) });
  };
  const setInput = (bound: "min" | "max", raw: string) => {
    const value = raw === "" ? undefined : Number(raw);
    if (value !== undefined && !Number.isFinite(value)) return;
    setBounds(bound === "min" ? (value ?? extent.min) : low, bound === "max" ? (value ?? extent.max) : high);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Min
          <Input key={`${id}-min-${state?.min ?? ""}`} aria-label={`Minimum ${column.label}`} type="number" inputMode="decimal" step={step} defaultValue={state?.min ?? ""} placeholder={String(extent.min)} onBlur={(e) => { setInput("min", e.target.value); if (e.target.value !== "" && !Number.isFinite(Number(e.target.value))) e.currentTarget.value = state?.min === undefined ? "" : String(state.min); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} className="h-8 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Max
          <Input key={`${id}-max-${state?.max ?? ""}`} aria-label={`Maximum ${column.label}`} type="number" inputMode="decimal" step={step} defaultValue={state?.max ?? ""} placeholder={String(extent.max)} onBlur={(e) => { setInput("max", e.target.value); if (e.target.value !== "" && !Number.isFinite(Number(e.target.value))) e.currentTarget.value = state?.max === undefined ? "" : String(state.max); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} className="h-8 tabular-nums" />
        </label>
      </div>
      <Slider aria-label={`${column.label} range`} min={extent.min} max={extent.max === extent.min ? extent.max + step : extent.max} step={step} value={[low, high]} thumbLabels={[`Minimum ${column.label}`, `Maximum ${column.label}`]} onValueChange={(values) => { const bounds = Array.isArray(values) ? values : [values, values]; setBounds(bounds[0] ?? extent.min, bounds[1] ?? extent.max); }} />
      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground"><span>{formatWithUnit(id, low)}</span><span>{formatWithUnit(id, high)}</span></div>
    </div>
  );
}

function displayCell(row: ScreenerRow, id: OptionalColumnId, cuts: ScreenerData["cuts"]) {
  if (isNumericColumnId(id)) {
    const value = row[id];
    const quartile = cellQuartile(row, id, cuts);
    if (value === null) return <span className="text-muted-foreground">{EMPTY_CELL}</span>;
    return <span className="inline-flex items-center justify-end gap-1.5 tabular-nums"><span>{formatCell(id, value)}</span>{quartile && <span aria-label={`Quartile ${quartile}`} title={`Q${quartile} in ${row.subCategory}`} className={`rounded px-1 text-[10px] font-semibold ${quartileClasses[quartile]}`}>Q{quartile}</span>}</span>;
  }
  if (id === "subCategory") return row.subCategory;
  if (id === "amc") return row.amc;
  if (id === "riskometer") return row.riskometer ?? EMPTY_CELL;
  return row.exitLoad ?? EMPTY_CELL;
}

export function ScreenerView({ data, initialState }: { data: ScreenerData; initialState: ScreenerState }) {
  const [state, setState] = useState(initialState);
  const [compare, setCompare] = useState<number[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const router = useRouter();
  const filtered = useMemo(() => filterRows(data.rows, state), [data.rows, state]);
  const sorted = useMemo(() => {
    const { id, desc } = state.sort;
    return [...filtered].sort((a, b) => {
      const av = a[id as keyof ScreenerRow];
      const bv = b[id as keyof ScreenerRow];
      if (av === null || av === undefined) return bv === null || bv === undefined ? a.name.localeCompare(b.name) : 1;
      if (bv === null || bv === undefined) return -1;
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "en", { sensitivity: "base" });
      return (desc ? -1 : 1) * (result || a.name.localeCompare(b.name));
    });
  }, [filtered, state.sort]);
  const table = useTable({ features: tableFeaturesConfig, columns: tableColumnHelper.columns([tableColumnHelper.accessor("name", { header: "Fund" })]), data: sorted });
  const tableRows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual returns a mutable API object that React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 54, getItemKey: (index) => tableRows[index]?.original.code ?? index, overscan: 8 });
  const virtualRows = virtualizer.getVirtualItems();
  const facets = useMemo(() => ({
    groups: facetCounts(data.rows, (r) => r.group),
    categories: facetCounts(data.rows, (r) => r.subCategory),
    amcs: facetCounts(data.rows, (r) => r.amc),
    risks: facetCounts(data.rows, (r) => r.riskometer),
  }), [data.rows]);
  const extents = useMemo(() => Object.fromEntries(NUMERIC_COLUMNS.map((c) => [c.id, columnExtent(data.rows, c.id)])), [data.rows]);

  const commit = useCallback((next: ScreenerState) => {
    setState(next);
    window.history.replaceState(null, "", `${window.location.pathname}${queryString(next)}`);
  }, []);

  useEffect(() => {
    const onPopState = () => setState(parseScreenerState(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const updateRange = (id: (typeof NUMERIC_COLUMNS)[number]["id"], range: RangeFilter | undefined) => {
    const ranges = { ...state.ranges };
    if (range) ranges[id] = range; else delete ranges[id];
    commit({ ...state, ranges });
  };
  const toggle = (list: "plans" | "options", value: string) => {
    const values = state[list] as string[];
    const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
    const updated = { ...state, [list]: next.length ? next : [value] } as ScreenerState;
    router.push(`${window.location.pathname}${queryString(updated)}`, { scroll: false });
  };
  const toggleColumn = (id: OptionalColumnId, checked: boolean) => {
    const columns = checked ? [...state.columns, id] : state.columns.filter((c) => c !== id);
    commit({ ...state, columns });
  };
  const sortBy = (id: ColumnId) => commit({ ...state, sort: { id, desc: state.sort.id === id ? !state.sort.desc : id === "name" ? false : true } });
  const toggleCompare = (code: number) => setCompare((current) => current.includes(code) ? current.filter((c) => c !== code) : current.length < 5 ? [...current, code] : current);
  const compareHref = `/compare?codes=${compare.join(",")}`;
  const presetId = activePresetId(state);
  const columns = state.columns;

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-7 sm:px-6">
      <a href="#fund-results" className="sr-only focus:not-sr-only focus:mb-4 focus:inline-flex">Skip to fund results</a>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div><h1 className="text-3xl font-semibold tracking-tight">Find your next fund</h1><p className="mt-1 text-sm text-muted-foreground">Compare returns, risk and cost across Indian mutual funds.</p></div>
        <div className="text-right text-sm text-muted-foreground"><div className="font-medium tabular-nums text-foreground">{formatCount(filtered.length)} funds</div><div>{data.asOf ? `Metrics as of ${formatIsoDate(data.asOf)}` : "Metrics not loaded"}</div></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Preset screens">
        {PRESETS.map((preset) => <Button key={preset.id} variant={presetId === preset.id ? "default" : "outline"} size="sm" title={preset.description} onClick={() => commit(applyPreset(preset, state))}>{preset.label}</Button>)}
        <Button variant="ghost" size="sm" onClick={() => commit(clearFilters(state))}><RotateCcwIcon data-icon="inline-start" />Reset filters</Button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Button className="justify-between lg:hidden" variant="outline" aria-expanded={filtersOpen} aria-controls="screener-filter-panel" onClick={() => setFiltersOpen((open) => !open)}>Filters <span className="text-muted-foreground">{activeFilterCount(state)} active</span></Button>
        <aside id="screener-filter-panel" className={`${filtersOpen ? "flex" : "hidden"} flex-col gap-5 rounded-lg border p-4 lg:flex`} aria-label="Fund filters">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Filters</h2><span className="text-xs text-muted-foreground">{activeFilterCount(state)} active</span></div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Search funds
            <Input name="q" autoComplete="off" placeholder="Name or fund house…" value={state.q} onChange={(e) => commit({ ...state, q: e.target.value })} />
          </label>
          <MultiSelect label="Fund category" noun="category" options={facets.categories} selected={state.categories} onChange={(categories) => commit({ ...state, categories })} />
          <MultiSelect label="Broad asset group" noun="group" options={facets.groups} selected={state.groups} onChange={(groups) => commit({ ...state, groups })} />
          <MultiSelect label="Fund house" noun="fund house" options={facets.amcs} selected={state.amcs} onChange={(amcs) => commit({ ...state, amcs })} />
          <MultiSelect label="Riskometer" noun="risk level" options={facets.risks} selected={state.riskometers} onChange={(riskometers) => commit({ ...state, riskometers })} />
          <fieldset className="flex flex-col gap-2"><legend className="mb-1 text-xs font-medium text-muted-foreground">Plan</legend>{(["direct", "regular"] as const).map((plan) => <label key={plan} className="flex min-h-7 items-center gap-2 text-sm capitalize"><Checkbox checked={state.plans.includes(plan)} onCheckedChange={() => toggle("plans", plan)} />{plan}</label>)}</fieldset>
          <fieldset className="flex flex-col gap-2"><legend className="mb-1 text-xs font-medium text-muted-foreground">Option</legend>{(["growth", "idcw"] as const).map((option) => <label key={option} className="flex min-h-7 items-center gap-2 text-sm capitalize"><Checkbox checked={state.options.includes(option)} onCheckedChange={() => toggle("options", option)} />{option}</label>)}</fieldset>
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Numeric ranges</summary><div className="mt-4 flex flex-col gap-4">{NUMERIC_COLUMNS.map((c) => <details key={c.id}><summary className="cursor-pointer text-xs font-medium">{c.label}{state.ranges[c.id] ? <span className="ml-1 text-muted-foreground">{state.ranges[c.id]?.min !== undefined ? `≥ ${formatWithUnit(c.id, state.ranges[c.id]!.min!)}` : ""}{state.ranges[c.id]?.max !== undefined ? ` ≤ ${formatWithUnit(c.id, state.ranges[c.id]!.max!)}` : ""}</span> : null}</summary><div className="pt-3"><RangeControl id={c.id} state={state.ranges[c.id]} extent={extents[c.id]} onChange={(r) => updateRange(c.id, r)} /></div></details>)}</div></details>
        </aside>

        <section id="fund-results" className="min-w-0" aria-label="Fund results">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">Select up to five funds to compare. {compare.length > 0 && <span className="font-medium text-foreground">{compare.length} selected</span>}</div>
            <div className="flex items-center gap-2">
              {compare.length >= 2 ? <Button size="sm" nativeButton={false} render={<Link href={compareHref} />}>Compare {compare.length} funds</Button> : <Button size="sm" disabled>Compare funds</Button>}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}><Columns3Icon data-icon="inline-start" />Columns</DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[min(75vh,36rem)] overflow-y-auto">
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel><DropdownMenuSeparator />
                  {COLUMN_GROUPS.map((group) => <div key={group}><DropdownMenuLabel>{group}</DropdownMenuLabel>{[...TEXT_COLUMNS, ...NUMERIC_COLUMNS].filter((c) => c.group === group).map((c) => <DropdownMenuCheckboxItem key={c.id} checked={columns.includes(c.id as OptionalColumnId)} onCheckedChange={(checked) => toggleColumn(c.id as OptionalColumnId, checked)} onSelect={(e) => e.preventDefault()} title={c.hint}>{c.label}</DropdownMenuCheckboxItem>)}</div>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div ref={scrollRef} className="overflow-auto rounded-lg border" style={{ maxHeight: "min(72vh, 900px)" }}>
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr className="border-b">
                <th className="sticky left-0 z-20 w-10 bg-muted px-3 text-left"><span className="sr-only">Compare</span></th>
                <th aria-sort={state.sort.id === "name" ? state.sort.desc ? "descending" : "ascending" : "none"} className="sticky left-10 z-20 min-w-64 bg-muted px-3 text-left"><button className="flex min-h-10 items-center gap-1 font-semibold focus-visible:outline-ring" onClick={() => sortBy("name")}>Fund {state.sort.id === "name" && (state.sort.desc ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />)}</button></th>
                {columns.map((id) => <th key={id} aria-sort={state.sort.id === id ? state.sort.desc ? "descending" : "ascending" : "none"} className="px-3 text-right"><button className="min-h-10 whitespace-nowrap font-semibold hover:text-foreground focus-visible:outline-ring" title={getColumnMeta(id).hint} onClick={() => sortBy(id)}>{getColumnMeta(id).header}{state.sort.id === id && (state.sort.desc ? <ArrowDownIcon className="ml-1 inline" size={12} /> : <ArrowUpIcon className="ml-1 inline" size={12} />)}</button></th>)}
              </tr></thead>
              <tbody>
                {virtualRows.length > 0 && <tr aria-hidden><td colSpan={columns.length + 2} style={{ height: virtualRows[0].start, padding: 0, border: 0 }} /></tr>}
                {virtualRows.map((item) => { const row = tableRows[item.index].original; return <tr key={row.code} data-index={item.index} ref={virtualizer.measureElement} className="border-b hover:bg-muted/40">
                <td className="sticky left-0 bg-background px-3"><Checkbox aria-label={`Add ${row.name} to comparison`} checked={compare.includes(row.code)} disabled={!compare.includes(row.code) && compare.length >= 5} onCheckedChange={() => toggleCompare(row.code)} /></td>
                <td className="sticky left-10 min-w-64 max-w-80 bg-background px-3 py-2"><Link href={`/fund/${row.code}`} className="block truncate font-medium hover:underline" title={row.name}>{row.name}</Link><span className="block truncate text-xs text-muted-foreground">{row.amc} · {row.plan} · {row.option}</span></td>
                {columns.map((id) => <td key={id} className="px-3 py-2 text-right tabular-nums">{displayCell(row, id, data.cuts)}</td>)}
              </tr>; })}
                {virtualRows.length > 0 && <tr aria-hidden><td colSpan={columns.length + 2} style={{ height: Math.max(0, virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end), padding: 0, border: 0 }} /></tr>}
              </tbody>
            </table>
            {filtered.length === 0 ? <div className="px-6 py-14 text-center"><h3 className="font-medium">No funds match these filters</h3><p className="mt-1 text-sm text-muted-foreground">Clear one or more filters to see funds again.</p><Button variant="outline" size="sm" className="mt-4" onClick={() => commit(clearFilters(state))}>Clear filters</Button></div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
