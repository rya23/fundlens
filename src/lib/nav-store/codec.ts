import { gunzipSync, gzipSync } from "node:zlib";
import {
  NAV_SERIES_VERSION,
  NavStoreError,
  type AppendResult,
  type NavPoint,
  type NavSeries,
} from "./types";

/** On-wire shape: points as `[date, nav]` tuples, per the NavStore spec. */
interface NavSeriesFile {
  version: number;
  schemeCode: string;
  points: [string, number][];
}

/**
 * Merges `incoming` into `existing`, sorted ascending by date and
 * deduplicated by date (an incoming point replaces an existing one for the
 * same date). Pure function; used by every `NavStore` implementation so
 * "sorted, deduped by date" is enforced in exactly one place.
 */
export function mergeNavPoints(
  existing: readonly NavPoint[],
  incoming: readonly NavPoint[]
): { points: NavPoint[]; added: number } {
  const byDate = new Map<string, number>();
  for (const point of existing) byDate.set(point.date, point.nav);

  let added = 0;
  for (const point of incoming) {
    if (!byDate.has(point.date)) added += 1;
    byDate.set(point.date, point.nav);
  }

  const points = Array.from(byDate, ([date, nav]) => ({ date, nav })).sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  );

  return { points, added };
}

/** Convenience wrapper over `mergeNavPoints` returning the public result shape. */
export function appendResultOf(
  existing: readonly NavPoint[],
  incoming: readonly NavPoint[]
): { points: NavPoint[]; result: AppendResult } {
  const { points, added } = mergeNavPoints(existing, incoming);
  return { points, result: { added, total: points.length } };
}

/** Serializes a `NavSeries` to gzipped JSON, tuple-encoding its points. */
export function encodeNavSeries(series: NavSeries): Buffer {
  const file: NavSeriesFile = {
    version: series.version,
    schemeCode: series.schemeCode,
    points: series.points.map((p) => [p.date, p.nav]),
  };
  return gzipSync(Buffer.from(JSON.stringify(file), "utf8"));
}

/**
 * Parses gzipped JSON produced by `encodeNavSeries`. Throws `NavStoreError`
 * for corrupt data or an unsupported `version`.
 */
export function decodeNavSeries(data: Buffer | Uint8Array): NavSeries {
  let json: unknown;
  try {
    json = JSON.parse(gunzipSync(data).toString("utf8"));
  } catch (cause) {
    throw new NavStoreError(
      `failed to decode NAV series: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  if (
    typeof json !== "object" ||
    json === null ||
    !("version" in json) ||
    !("schemeCode" in json) ||
    !("points" in json)
  ) {
    throw new NavStoreError("decoded NAV series is missing required fields");
  }

  const file = json as NavSeriesFile;
  if (file.version !== NAV_SERIES_VERSION) {
    throw new NavStoreError(
      `unsupported NAV series version ${String(file.version)} (expected ${NAV_SERIES_VERSION})`
    );
  }
  if (typeof file.schemeCode !== "string" || !Array.isArray(file.points)) {
    throw new NavStoreError("decoded NAV series has an invalid shape");
  }

  return {
    version: file.version,
    schemeCode: file.schemeCode,
    points: file.points.map(([date, nav]) => ({ date, nav })),
  };
}
