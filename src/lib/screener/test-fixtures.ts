import { NUMERIC_COLUMNS, type NumericColumnId } from "./columns";
import type { ScreenerRow } from "./types";

/** Test helper: a row with every metric null unless overridden. */
export function makeRow(overrides: Partial<ScreenerRow> & { code: number }): ScreenerRow {
  const nulls = Object.fromEntries(NUMERIC_COLUMNS.map((c) => [c.id, null])) as Record<NumericColumnId, number | null>;
  return {
    name: `Fund ${overrides.code}`,
    amc: "Kestrel Mutual Fund",
    group: "Equity",
    subCategory: "Flexi Cap Fund",
    plan: "direct",
    option: "growth",
    riskometer: "Very High",
    exitLoad: null,
    ...nulls,
    ...overrides,
  };
}
