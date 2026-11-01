import type { NumericColumnId } from "./columns";

export type PlanValue = "direct" | "regular";
export type OptionValue = "growth" | "idcw";

/** One fund (one scheme code), flattened for the client. All numbers are in display units. */
export type ScreenerRow = {
  code: number;
  name: string;
  amc: string;
  /** Broad SEBI group: Equity, Debt, Hybrid, ... */
  group: string;
  /** Fine SEBI category; the peer set for quartiles. */
  subCategory: string;
  plan: PlanValue;
  option: OptionValue;
  riskometer: string | null;
  exitLoad: string | null;
} & Record<NumericColumnId, number | null>;

/** Quartile cut points for one (sub-category, metric), in display units. */
export interface CutPoints {
  q1: number;
  q2: number;
  q3: number;
  /** Funds with a value for this metric in the category. */
  count: number;
}

export type CutsBySubCategory = Record<string, Partial<Record<NumericColumnId, CutPoints>>>;

export interface ScreenerData {
  rows: ScreenerRow[];
  cuts: CutsBySubCategory;
  /** Date of the metrics snapshot (ISO), if any metrics exist. */
  asOf: string | null;
}
