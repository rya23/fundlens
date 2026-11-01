/**
 * Peer quartile cut points and percentile ranks, computed within a fund's
 * full SEBI category (never a subset - see docs/PLAN.md).
 *
 * "Higher is better" metrics (CAGR, Sharpe, alpha, ...) rank the top of the
 * numeric distribution as quartile 1 / high percentile. "Lower is better"
 * metrics (TER, std dev, max drawdown magnitude, ...) rank the bottom of
 * the numeric distribution as quartile 1 / high percentile, with no
 * inversion needed since the bottom is already numeric quartile 1.
 */

export type PeerDirection = "higher-is-better" | "lower-is-better";

export interface QuartileCutPoints {
  /** Value at the 25th percentile. */
  q1: number;
  /** Value at the 50th percentile (median). */
  q2: number;
  /** Value at the 75th percentile. */
  q3: number;
}

export type PeerQuartile = 1 | 2 | 3 | 4;

export interface PeerRank {
  /** 0-100. Percentage of peers this value outperforms, per `direction`. */
  percentile: number;
  /** 1 = best quartile per `direction`, 4 = worst. */
  quartile: PeerQuartile;
  /** Number of peers (after excluding null/undefined) the rank was computed over. */
  peerCount: number;
}

function excludeNullish(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => v !== null && v !== undefined);
}

/** Linear-interpolation percentile (Excel PERCENTILE.INC / numpy default). */
function percentileValue(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];

  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];

  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/**
 * Quartile cut points (25th/50th/75th percentile values) for a peer set.
 * Nulls/undefineds are excluded. Returns `undefined` when no values remain.
 */
export function computeQuartileCutPoints(
  values: readonly (number | null | undefined)[]
): QuartileCutPoints | undefined {
  const clean = excludeNullish(values);
  if (clean.length === 0) return undefined;

  const sorted = [...clean].sort((a, b) => a - b);
  return {
    q1: percentileValue(sorted, 0.25),
    q2: percentileValue(sorted, 0.5),
    q3: percentileValue(sorted, 0.75),
  };
}

/** Numeric quartile (1 = bottom 25% of values, 4 = top 25%), ignoring direction. */
function numericQuartile(value: number, cuts: QuartileCutPoints): PeerQuartile {
  if (value <= cuts.q1) return 1;
  if (value <= cuts.q2) return 2;
  if (value <= cuts.q3) return 3;
  return 4;
}

function toRankQuartile(
  numeric: PeerQuartile,
  direction: PeerDirection
): PeerQuartile {
  if (direction === "higher-is-better") {
    return (5 - numeric) as PeerQuartile;
  }
  return numeric;
}

/**
 * Percentage of peers that `value` outperforms, per `direction`. Ties split
 * credit evenly (the standard "average rank" convention): a peer exactly
 * equal to `value` counts as half-beaten, half-not.
 */
function computePercentile(
  value: number,
  peers: readonly number[],
  direction: PeerDirection
): number {
  let worse = 0;
  let equal = 0;
  for (const peer of peers) {
    if (peer === value) {
      equal += 1;
    } else if (direction === "higher-is-better" ? peer < value : peer > value) {
      worse += 1;
    }
  }
  return ((worse + 0.5 * equal) / peers.length) * 100;
}

/**
 * Ranks `value` within `peerValues` (nulls/undefineds excluded), per
 * `direction`. `peerValues` is expected to be the full category's values
 * for this metric, typically including `value` itself. Returns `undefined`
 * when no peers remain after filtering.
 *
 * A single-peer category is a trivial edge case (no distribution to speak
 * of): it is reported as quartile 1 / 100th percentile regardless of
 * direction, rather than running the general formula (which would be
 * direction-dependent and effectively arbitrary for n=1).
 */
export function rankPeer(
  value: number,
  peerValues: readonly (number | null | undefined)[],
  direction: PeerDirection
): PeerRank | undefined {
  const peers = excludeNullish(peerValues);
  if (peers.length === 0) return undefined;

  if (peers.length === 1) {
    return { percentile: 100, quartile: 1, peerCount: 1 };
  }

  const cuts = computeQuartileCutPoints(peers)!;
  const percentile = computePercentile(value, peers, direction);
  const quartile = toRankQuartile(numericQuartile(value, cuts), direction);

  return { percentile, quartile, peerCount: peers.length };
}

const ORDINAL_SUFFIXES: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

function formatOrdinal(n: number): string {
  const rounded = Math.round(n);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${rounded}th`;
  }
  const suffix = ORDINAL_SUFFIXES[rounded % 10] ?? "th";
  return `${rounded}${suffix}`;
}

/** e.g. `rankPeer(..., { percentile: 87.4, quartile: 1, ... })` -> "Q1 · 87th pct in Flexi Cap" */
export function formatPeerRankLabel(rank: PeerRank, categoryLabel: string): string {
  return `Q${rank.quartile} · ${formatOrdinal(rank.percentile)} pct in ${categoryLabel}`;
}
