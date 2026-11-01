/**
 * NavStore: a per-scheme NAV (net asset value) history store.
 *
 * One series per AMFI scheme code, held as a gzipped JSON file at
 * `nav/{schemeCode}.json.gz` (same layout on local disk via `FsNavStore`
 * and on Cloudflare R2 via `R2NavStore`; see docs/PLAN.md "Architecture:
 * R2 layout").
 *
 * All operations below are the seam this module is tested at: every
 * implementation (`FsNavStore`, `R2NavStore`, and any future one) must
 * satisfy the shared contract suite in `./contract.ts`.
 */

/** A single NAV observation. */
export interface NavPoint {
  /** Calendar date in `YYYY-MM-DD` form (no time component, no timezone). */
  readonly date: string;
  /** Net asset value per unit, in rupees. */
  readonly nav: number;
}

/** Current on-disk/R2 schema version for `NavSeries`. Bump on format changes. */
export const NAV_SERIES_VERSION = 1;

/**
 * A scheme's full NAV history, always sorted ascending by date and
 * deduplicated so there is at most one point per date. Implementations are
 * responsible for maintaining this invariant; callers can rely on it.
 */
export interface NavSeries {
  readonly version: number;
  readonly schemeCode: string;
  readonly points: readonly NavPoint[];
}

/** Result of merging new points into a (possibly nonexistent) series. */
export interface AppendResult {
  /** Number of dates in the input that were not already present. */
  readonly added: number;
  /** Total number of points in the series after the merge. */
  readonly total: number;
}

/**
 * Thrown for invalid input (e.g. a scheme code that cannot map to a safe
 * storage key) or a corrupt/unsupported stored series. Never thrown for a
 * merely-missing series - `getSeries`/`getHead` return `null` for that.
 */
export class NavStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NavStoreError";
  }
}

export interface NavStore {
  /** Returns the stored series for a scheme, or `null` if none exists yet. */
  getSeries(schemeCode: string): Promise<NavSeries | null>;

  /**
   * Replaces the entire series for a scheme with `points`, after sorting
   * and deduplicating by date (later entries in `points` win ties).
   */
  putSeries(schemeCode: string, points: readonly NavPoint[]): Promise<void>;

  /**
   * Idempotently merges `points` into the existing series for a scheme:
   * exactly one read and one write against the backing store, never a
   * listing. Running the same append twice is a no-op the second time
   * (`added` is `0`).
   */
  appendPoints(
    schemeCode: string,
    points: readonly NavPoint[]
  ): Promise<AppendResult>;

  /** Returns the most recent (max-date) point for a scheme, or `null`. */
  getHead(schemeCode: string): Promise<NavPoint | null>;

  /** Lists every scheme code currently stored. Not meant for hot paths. */
  listCodes(): Promise<string[]>;
}
