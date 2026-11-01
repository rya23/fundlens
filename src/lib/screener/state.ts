import {
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
  isColumnId,
  isNumericColumnId,
  normalizeColumns,
  NUMERIC_COLUMNS,
  type ColumnId,
  type NumericColumnId,
  type OptionalColumnId,
} from "./columns";
import type { OptionValue, PlanValue } from "./types";

/**
 * The whole screen (filters, sort, columns) as one plain object that
 * round-trips through the URL query string. Only values that differ from the
 * defaults are written, so `/` is the default screen and every shared link is
 * as short as it can be.
 *
 *   q=hdfc                      name search
 *   group=Equity                broad category (repeatable)
 *   cat=Flexi Cap Fund          sub-category (repeatable)
 *   amc=...  risk=...           AMC / riskometer (repeatable)
 *   plan=regular  option=idcw   plan / option (repeatable; default direct + growth)
 *   min_cagr3y=12 max_cagr3y=30 numeric range, display units, either end optional
 *   cols=aumCr,cagr3y           visible columns (default set omitted)
 *   sort=-cagr3y                column id, "-" prefix for descending
 */

export interface RangeFilter {
  min?: number;
  max?: number;
}

export type RangeFilters = Partial<Record<NumericColumnId, RangeFilter>>;

export interface ScreenerSort {
  id: ColumnId;
  desc: boolean;
}

export interface ScreenerState {
  q: string;
  groups: string[];
  categories: string[];
  amcs: string[];
  riskometers: string[];
  plans: PlanValue[];
  options: OptionValue[];
  ranges: RangeFilters;
  columns: OptionalColumnId[];
  sort: ScreenerSort;
}

export const DEFAULT_PLANS: readonly PlanValue[] = ["direct"];
export const DEFAULT_OPTIONS: readonly OptionValue[] = ["growth"];

export function defaultState(): ScreenerState {
  return {
    q: "",
    groups: [],
    categories: [],
    amcs: [],
    riskometers: [],
    plans: [...DEFAULT_PLANS],
    options: [...DEFAULT_OPTIONS],
    ranges: {},
    columns: [...DEFAULT_COLUMNS],
    sort: { ...DEFAULT_SORT },
  };
}

export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | string;

function toParams(input: SearchParamsInput): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === "string") return new URLSearchParams(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  return params;
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))];
}

function parseEnumList<T extends string>(values: string[], allowed: readonly T[], fallback: readonly T[]): T[] {
  const picked = allowed.filter((a) => values.includes(a));
  return picked.length > 0 ? picked : [...fallback];
}

function parseNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Tolerant: unknown keys are ignored and malformed values fall back to the default. */
export function parseScreenerState(input: SearchParamsInput): ScreenerState {
  const params = toParams(input);
  const state = defaultState();

  state.q = (params.get("q") ?? "").trim();
  state.groups = uniqueNonEmpty(params.getAll("group"));
  state.categories = uniqueNonEmpty(params.getAll("cat"));
  state.amcs = uniqueNonEmpty(params.getAll("amc"));
  state.riskometers = uniqueNonEmpty(params.getAll("risk"));
  state.plans = parseEnumList(params.getAll("plan"), ["direct", "regular"] as const, DEFAULT_PLANS);
  state.options = parseEnumList(params.getAll("option"), ["growth", "idcw"] as const, DEFAULT_OPTIONS);

  for (const column of NUMERIC_COLUMNS) {
    let min = parseNumber(params.get(`min_${column.id}`));
    let max = parseNumber(params.get(`max_${column.id}`));
    if (min === undefined && max === undefined) continue;
    if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
    const range: RangeFilter = {};
    if (min !== undefined) range.min = min;
    if (max !== undefined) range.max = max;
    state.ranges[column.id] = range;
  }

  const cols = params.get("cols");
  if (cols !== null) {
    const parsed = normalizeColumns(cols.split(",").filter((c) => c.length > 0));
    // `cols=` with nothing valid keeps the default rather than an empty table.
    if (parsed.length > 0) state.columns = parsed;
  }

  const sort = params.get("sort");
  if (sort) {
    const desc = sort.startsWith("-");
    const id = desc ? sort.slice(1) : sort;
    if (isColumnId(id)) state.sort = { id, desc };
  }

  return state;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Canonical query string for a state (defaults omitted, stable key order). */
export function serializeScreenerState(state: ScreenerState): URLSearchParams {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set("q", q);
  for (const v of [...state.groups].sort()) params.append("group", v);
  for (const v of [...state.categories].sort()) params.append("cat", v);
  for (const v of [...state.amcs].sort()) params.append("amc", v);
  for (const v of [...state.riskometers].sort()) params.append("risk", v);
  if (!sameList([...state.plans].sort(), DEFAULT_PLANS)) {
    for (const v of [...state.plans].sort()) params.append("plan", v);
  }
  if (!sameList([...state.options].sort(), DEFAULT_OPTIONS)) {
    for (const v of [...state.options].sort()) params.append("option", v);
  }
  for (const column of NUMERIC_COLUMNS) {
    const range = state.ranges[column.id];
    if (!range) continue;
    if (range.min !== undefined) params.set(`min_${column.id}`, String(range.min));
    if (range.max !== undefined) params.set(`max_${column.id}`, String(range.max));
  }
  const columns = normalizeColumns(state.columns);
  if (!sameList(columns, DEFAULT_COLUMNS)) params.set("cols", columns.join(","));
  if (state.sort.id !== DEFAULT_SORT.id || state.sort.desc !== DEFAULT_SORT.desc) {
    params.set("sort", `${state.sort.desc ? "-" : ""}${state.sort.id}`);
  }
  return params;
}

/** `?a=b` or empty string, ready to append to a pathname. */
export function stateToQueryString(state: ScreenerState): string {
  const qs = serializeScreenerState(state).toString();
  return qs ? `?${qs}` : "";
}

export function isNumericSort(id: ColumnId): id is NumericColumnId {
  return isNumericColumnId(id);
}

/** Number of narrowing filters in effect (plan/option excluded; they are the universe). */
export function activeFilterCount(state: ScreenerState): number {
  return (
    (state.q.trim() ? 1 : 0) +
    (state.groups.length > 0 ? 1 : 0) +
    (state.categories.length > 0 ? 1 : 0) +
    (state.amcs.length > 0 ? 1 : 0) +
    (state.riskometers.length > 0 ? 1 : 0) +
    Object.keys(state.ranges).length
  );
}

export function clearFilters(state: ScreenerState): ScreenerState {
  return { ...state, q: "", groups: [], categories: [], amcs: [], riskometers: [], ranges: {} };
}
