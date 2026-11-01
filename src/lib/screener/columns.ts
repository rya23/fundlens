import type { PeerDirection } from "@/lib/metrics/peers";

/**
 * Registry of every numeric screener column. The id doubles as the key on a
 * `ScreenerRow`, the key in the URL (`min_cagr3y`, `cols=...`, `sort=...`) and
 * the `category_stats.metric` key used for quartile colouring, so there is one
 * name per metric everywhere.
 *
 * Units: row values are always in *display units*. `scale` is what the server
 * loader multiplies the stored value by to get there (scheme_metrics stores
 * returns and ratios the way the metrics library produces them, as fractions:
 * 0.1234 is 12.34%).
 */

export type ColumnGroup = "Returns" | "Risk" | "Benchmark-relative" | "Cost and size" | "Profile";

export type NumericFormat = "percent" | "ratio" | "crore" | "years";

interface NumericColumnSpec {
  id: string;
  /** Full name: picker, filter panel, accessible names. */
  label: string;
  /** Compact table header; the unit lives here so cells stay bare numbers. */
  header: string;
  group: ColumnGroup;
  format: NumericFormat;
  decimals: number;
  /** Stored value x scale = display value. */
  scale: number;
  /** Colour by category quartile in this direction; undefined = not ranked. */
  direction?: PeerDirection;
  /** Slider step for the range filter, in display units. */
  step: number;
  /** One-line plain-language explanation shown in the column picker. */
  hint: string;
}

export const NUMERIC_COLUMNS = [
  { id: "aumCr", label: "AUM", header: "AUM (₹ Cr)", group: "Cost and size", format: "crore", decimals: 0, scale: 1, step: 100, hint: "Assets under management, in crore rupees." },
  { id: "terPct", label: "Expense ratio (TER)", header: "TER %", group: "Cost and size", format: "percent", decimals: 2, scale: 1, direction: "lower-is-better", step: 0.05, hint: "Yearly fee charged by the fund. Lower is better." },
  { id: "cagr1y", label: "1Y CAGR", header: "1Y %", group: "Returns", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.5, hint: "Return over the last year." },
  { id: "cagr3y", label: "3Y CAGR", header: "3Y %", group: "Returns", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.5, hint: "Annualised return over the last 3 years." },
  { id: "cagr5y", label: "5Y CAGR", header: "5Y %", group: "Returns", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.5, hint: "Annualised return over the last 5 years." },
  { id: "cagr10y", label: "10Y CAGR", header: "10Y %", group: "Returns", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.5, hint: "Annualised return over the last 10 years." },
  { id: "rolling3yCagrMedian", label: "3Y rolling return (median)", header: "3Y roll. %", group: "Returns", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.5, hint: "Median 3Y CAGR across every daily window in the fund's history." },
  { id: "pctRolling3yBeatBenchmark", label: "3Y rolling windows beating benchmark", header: "Beat bm. %", group: "Returns", format: "percent", decimals: 0, scale: 100, direction: "higher-is-better", step: 1, hint: "Share of 3Y rolling windows where the fund beat its benchmark." },
  { id: "sipXirr3y", label: "3Y SIP XIRR", header: "SIP 3Y %", group: "Returns", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.5, hint: "XIRR of a monthly SIP over the last 3 years." },
  { id: "sipXirr5y", label: "5Y SIP XIRR", header: "SIP 5Y %", group: "Returns", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.5, hint: "XIRR of a monthly SIP over the last 5 years." },
  { id: "sharpe3y", label: "Sharpe ratio (3Y)", header: "Sharpe", group: "Risk", format: "ratio", decimals: 2, scale: 1, direction: "higher-is-better", step: 0.05, hint: "Excess return per unit of total volatility." },
  { id: "sortino3y", label: "Sortino ratio (3Y)", header: "Sortino", group: "Risk", format: "ratio", decimals: 2, scale: 1, direction: "higher-is-better", step: 0.05, hint: "Excess return per unit of downside volatility." },
  { id: "stdDev3y", label: "Standard deviation (3Y)", header: "Std dev %", group: "Risk", format: "percent", decimals: 1, scale: 100, direction: "lower-is-better", step: 0.5, hint: "Annualised volatility of returns. Lower is steadier." },
  { id: "maxDrawdown5y", label: "Max drawdown (5Y)", header: "Max DD %", group: "Risk", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 1, hint: "Worst peak-to-trough fall in the last 5 years." },
  { id: "alpha3y", label: "Alpha (3Y)", header: "Alpha %", group: "Benchmark-relative", format: "percent", decimals: 1, scale: 100, direction: "higher-is-better", step: 0.25, hint: "Annualised return beyond what the benchmark explains." },
  { id: "beta3y", label: "Beta (3Y)", header: "Beta", group: "Benchmark-relative", format: "ratio", decimals: 2, scale: 1, step: 0.05, hint: "Sensitivity to the benchmark. 1.00 moves with it." },
  { id: "rSquared3y", label: "R-squared (3Y)", header: "R²", group: "Benchmark-relative", format: "ratio", decimals: 2, scale: 1, step: 0.01, hint: "How much of the fund's movement the benchmark explains." },
  { id: "trackingError3y", label: "Tracking error (3Y)", header: "Track. err. %", group: "Benchmark-relative", format: "percent", decimals: 1, scale: 100, direction: "lower-is-better", step: 0.25, hint: "Volatility of the gap to the benchmark." },
  { id: "infoRatio3y", label: "Information ratio (3Y)", header: "Info ratio", group: "Benchmark-relative", format: "ratio", decimals: 2, scale: 1, direction: "higher-is-better", step: 0.05, hint: "Active return per unit of tracking error." },
  { id: "upCapture3y", label: "Upside capture (3Y)", header: "Up cap. %", group: "Benchmark-relative", format: "percent", decimals: 0, scale: 100, direction: "higher-is-better", step: 1, hint: "Share of the benchmark's gains the fund captured in up months." },
  { id: "downCapture3y", label: "Downside capture (3Y)", header: "Down cap. %", group: "Benchmark-relative", format: "percent", decimals: 0, scale: 100, direction: "lower-is-better", step: 1, hint: "Share of the benchmark's losses the fund took in down months." },
  { id: "ageYears", label: "Fund age", header: "Age (yrs)", group: "Profile", format: "years", decimals: 1, scale: 1, step: 0.5, hint: "Years since the scheme launched." },
] as const satisfies readonly NumericColumnSpec[];

export type NumericColumnId = (typeof NUMERIC_COLUMNS)[number]["id"];

export interface NumericColumn extends NumericColumnSpec {
  id: NumericColumnId;
}

export type TextColumnId = "subCategory" | "amc" | "riskometer" | "exitLoad";

/** Every id a user can toggle in the picker. `name` is pinned and not listed. */
export type OptionalColumnId = NumericColumnId | TextColumnId;
export type ColumnId = "name" | OptionalColumnId;

export interface TextColumn {
  id: TextColumnId;
  label: string;
  header: string;
  group: ColumnGroup;
  hint: string;
}

export const TEXT_COLUMNS: readonly TextColumn[] = [
  { id: "subCategory", label: "Category", header: "Category", group: "Profile", hint: "SEBI sub-category; peers are ranked within it." },
  { id: "amc", label: "AMC", header: "AMC", group: "Profile", hint: "The fund house." },
  { id: "riskometer", label: "Riskometer", header: "Riskometer", group: "Profile", hint: "SEBI risk label." },
  { id: "exitLoad", label: "Exit load", header: "Exit load", group: "Cost and size", hint: "Exit charge terms." },
];

/** Picker order, left to right in the table. */
export const COLUMN_ORDER: readonly OptionalColumnId[] = [
  "subCategory",
  "amc",
  "aumCr",
  "terPct",
  "cagr1y",
  "cagr3y",
  "cagr5y",
  "cagr10y",
  "rolling3yCagrMedian",
  "pctRolling3yBeatBenchmark",
  "sipXirr3y",
  "sipXirr5y",
  "sharpe3y",
  "sortino3y",
  "stdDev3y",
  "alpha3y",
  "beta3y",
  "rSquared3y",
  "trackingError3y",
  "infoRatio3y",
  "upCapture3y",
  "downCapture3y",
  "maxDrawdown5y",
  "riskometer",
  "exitLoad",
  "ageYears",
];

export const DEFAULT_COLUMNS: readonly OptionalColumnId[] = [
  "subCategory",
  "aumCr",
  "terPct",
  "cagr1y",
  "cagr3y",
  "cagr5y",
  "rolling3yCagrMedian",
  "sharpe3y",
  "alpha3y",
  "beta3y",
  "maxDrawdown5y",
];

const numericById = new Map<string, NumericColumn>(
  NUMERIC_COLUMNS.map((c): [string, NumericColumn] => [c.id, c as NumericColumn])
);
const textById = new Map<string, TextColumn>(TEXT_COLUMNS.map((c) => [c.id, c]));

export function isNumericColumnId(id: string): id is NumericColumnId {
  return numericById.has(id);
}

export function isOptionalColumnId(id: string): id is OptionalColumnId {
  return numericById.has(id) || textById.has(id);
}

export function isColumnId(id: string): id is ColumnId {
  return id === "name" || isOptionalColumnId(id);
}

export function getNumericColumn(id: NumericColumnId): NumericColumn {
  return numericById.get(id)!;
}

export function getColumnMeta(id: OptionalColumnId): {
  label: string;
  header: string;
  group: ColumnGroup;
  hint: string;
} {
  return numericById.get(id) ?? textById.get(id)!;
}

/** Orders an arbitrary id list into table order, dropping unknown and duplicate ids. */
export function normalizeColumns(ids: readonly string[]): OptionalColumnId[] {
  const wanted = new Set(ids);
  return COLUMN_ORDER.filter((id) => wanted.has(id));
}

export const COLUMN_GROUPS: readonly ColumnGroup[] = [
  "Returns",
  "Risk",
  "Benchmark-relative",
  "Cost and size",
  "Profile",
];

/** The default sort: best 3Y CAGR first. */
export const DEFAULT_SORT = { id: "cagr3y", desc: true } as const;
