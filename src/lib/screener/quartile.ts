import { quartileFromCutPoints, type PeerQuartile } from "@/lib/metrics/peers";
import { getNumericColumn, type NumericColumnId } from "./columns";
import type { CutsBySubCategory, ScreenerRow } from "./types";

/** Below this many ranked peers the quartiles say nothing, so no colour is shown. */
export const MIN_PEERS_FOR_QUARTILE = 4;

/**
 * Quartile (1 = best) of one cell within the fund's SEBI sub-category, from
 * the precomputed `category_stats` cut points. Undefined for columns that are
 * not ranked (AUM, beta, ...), unknown values, and thin categories.
 */
export function cellQuartile(
  row: ScreenerRow,
  id: NumericColumnId,
  cuts: CutsBySubCategory
): PeerQuartile | undefined {
  const value = row[id];
  const { direction } = getNumericColumn(id);
  if (value === null || direction === undefined) return undefined;
  const cut = cuts[row.subCategory]?.[id];
  if (!cut || cut.count < MIN_PEERS_FOR_QUARTILE) return undefined;
  return quartileFromCutPoints(value, cut, direction);
}
