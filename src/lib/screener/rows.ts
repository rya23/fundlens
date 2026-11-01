import { NUMERIC_COLUMNS, getNumericColumn, isNumericColumnId, type NumericColumnId } from "./columns";
import type { CutPoints, CutsBySubCategory, ScreenerRow } from "./types";

/** Stored (DB-native) values for one scheme, as the Drizzle select returns them. */
export interface StoredScheme {
  schemeCode: number;
  name: string;
  amc: string;
  category: string;
  subCategory: string | null;
  plan: "direct" | "regular";
  option: "growth" | "idcw";
  inceptionDate: string | null;
  terPct: number | null;
  aumCr: number | null;
  riskometer: string | null;
  exitLoad: string | null;
}

export type StoredMetrics = Partial<Record<NumericColumnId, number | null>>;

export interface StoredCategoryStat {
  category: string;
  metric: string;
  count: number;
  cutQ1: number | null;
  cutQ2: number | null;
  cutQ3: number | null;
}

export const UNCLASSIFIED = "Unclassified";

/** Removes float noise left by the x100 scaling (12.340000000000002 -> 12.34). */
function toDisplay(stored: number | null | undefined, scale: number): number | null {
  if (stored === null || stored === undefined || !Number.isFinite(stored)) return null;
  return Math.round(stored * scale * 1e6) / 1e6;
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/** Whole-tenth years between two ISO dates, or null if inception is unknown or in the future. */
export function ageInYears(inceptionDate: string | null, asOf: string): number | null {
  if (!inceptionDate) return null;
  const years = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${inceptionDate}T00:00:00Z`)) / MS_PER_YEAR;
  return years >= 0 ? Math.round(years * 10) / 10 : null;
}

/** Joins a scheme with its stored metrics into a display-unit row. */
export function buildRow(scheme: StoredScheme, metrics: StoredMetrics | undefined, asOf: string): ScreenerRow {
  const numbers = {} as Record<NumericColumnId, number | null>;
  for (const column of NUMERIC_COLUMNS) {
    const stored =
      column.id === "aumCr"
        ? scheme.aumCr
        : column.id === "terPct"
          ? scheme.terPct
          : column.id === "ageYears"
            ? null
            : metrics?.[column.id];
    numbers[column.id] = toDisplay(stored, column.scale);
  }
  numbers.ageYears = ageInYears(scheme.inceptionDate, asOf);

  return {
    code: scheme.schemeCode,
    name: scheme.name,
    amc: scheme.amc,
    group: scheme.category,
    subCategory: scheme.subCategory ?? UNCLASSIFIED,
    plan: scheme.plan,
    option: scheme.option,
    riskometer: scheme.riskometer,
    exitLoad: scheme.exitLoad,
    ...numbers,
  };
}

/** category_stats rows -> cut points in display units, keyed by sub-category then metric. */
export function buildCuts(stats: readonly StoredCategoryStat[]): CutsBySubCategory {
  const cuts: CutsBySubCategory = {};
  for (const stat of stats) {
    if (!isNumericColumnId(stat.metric)) continue;
    if (stat.cutQ1 === null || stat.cutQ2 === null || stat.cutQ3 === null) continue;
    const { scale } = getNumericColumn(stat.metric);
    const point: CutPoints = {
      q1: toDisplay(stat.cutQ1, scale)!,
      q2: toDisplay(stat.cutQ2, scale)!,
      q3: toDisplay(stat.cutQ3, scale)!,
      count: stat.count,
    };
    (cuts[stat.category] ??= {})[stat.metric] = point;
  }
  return cuts;
}
