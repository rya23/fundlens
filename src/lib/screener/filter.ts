import { NUMERIC_COLUMNS, type NumericColumnId } from "./columns";
import type { ScreenerState } from "./state";
import type { ScreenerRow } from "./types";

function matchesList(selected: readonly string[], value: string | null): boolean {
  return selected.length === 0 || (value !== null && selected.includes(value));
}

/** Case-insensitive; every whitespace-separated term must appear in the name or AMC. */
function matchesSearch(row: ScreenerRow, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = `${row.name} ${row.amc}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/**
 * Applies every filter in `state` to `rows`. A row with no value for a column
 * that has an active range is excluded: "Sharpe at least 1" must not let
 * through funds whose Sharpe is unknown.
 */
export function filterRows(rows: readonly ScreenerRow[], state: ScreenerState): ScreenerRow[] {
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const ranges = NUMERIC_COLUMNS.flatMap((c) => {
    const r = state.ranges[c.id];
    return r && (r.min !== undefined || r.max !== undefined) ? [[c.id, r] as const] : [];
  });

  return rows.filter((row) => {
    if (!state.plans.includes(row.plan) || !state.options.includes(row.option)) return false;
    if (!matchesList(state.groups, row.group)) return false;
    if (!matchesList(state.categories, row.subCategory)) return false;
    if (!matchesList(state.amcs, row.amc)) return false;
    if (!matchesList(state.riskometers, row.riskometer)) return false;
    if (!matchesSearch(row, terms)) return false;
    for (const [id, range] of ranges) {
      const value = row[id];
      if (value === null) return false;
      if (range.min !== undefined && value < range.min) return false;
      if (range.max !== undefined && value > range.max) return false;
    }
    return true;
  });
}

/** Observed min and max of a column over `rows` (ignoring nulls), or undefined when none. */
export function columnExtent(
  rows: readonly ScreenerRow[],
  id: NumericColumnId
): { min: number; max: number } | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const v = row[id];
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? { min, max } : undefined;
}

/** Counts of each distinct non-empty value, alphabetical. */
export function facetCounts(
  rows: readonly ScreenerRow[],
  pick: (row: ScreenerRow) => string | null
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = pick(row);
    if (v === null || v === "") continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}
