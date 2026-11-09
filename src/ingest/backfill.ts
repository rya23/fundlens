/**
 * One-off, idempotent, resumable NAV backfill (ticket 09, docs/PLAN.md
 * "Architecture: backfill").
 *
 * 1. Discover the universe (AMFI NAVAll, mfapi fallback) and upsert every
 *    scheme with its metadata. All plans/options are kept so Regular/IDCW
 *    work later.
 * 2. For every scheme, fetch the full NAV history from mfapi into the
 *    NavStore and record progress in `ingest_state`.
 *
 * Resumability: a scheme is skipped when `ingest_state` shows a success whose
 * `lastNavDate` already reaches the newest date the universe source knows
 * of. A crash between the store write and the state write only costs one
 * redundant fetch, because `appendPoints` is an idempotent merge. Per-scheme
 * errors are recorded in `ingest_state.lastError` and never abort the run.
 */
import { inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { ingestState } from "@/db/schema";
import type { NavStore } from "@/lib/nav-store";
import { toNavPoints } from "./nav-points";
import { forEachConcurrent } from "./pool";
import { syncSchemes, type FetchUniverseDeps, type UniverseEntry } from "./schemes";
import type { MfApiClient } from "./sources/mfapi";
import type { MetadataSource } from "./sources/metadata";

export interface BackfillDeps extends Omit<FetchUniverseDeps, "mfapi"> {
  db: Database;
  store: NavStore;
  mfapi: Pick<MfApiClient, "getSchemeHistory" | "getLatestNavs">;
  metadata: MetadataSource;
  /** Parallel scheme fetches. Default 8. */
  concurrency?: number;
  /** Cap on schemes fetched this run (after skipping up-to-date ones). */
  limit?: number;
  /** Restrict the run to these scheme codes. */
  codes?: readonly number[];
  /** Stop picking up new schemes once aborted; in-flight ones finish. */
  signal?: AbortSignal;
  /** Epoch ms after which no new schemes are started (CI time budget). */
  deadline?: number;
  log?: (message: string) => void;
  now?: () => Date;
}

export interface BackfillSummary {
  /** Schemes in scope (after `codes`). */
  total: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skippedUpToDate: number;
  /** True when the signal or the deadline stopped the run before every scheme was attempted. */
  aborted: boolean;
}

const DEFAULT_CONCURRENCY = 8;
const PROGRESS_EVERY = 100;

export function isUpToDate(
  state: { lastNavDate: string | null; lastSuccessAt: Date | null } | undefined,
  entry: Pick<UniverseEntry, "latestDate">
): boolean {
  if (!state?.lastSuccessAt) return false;
  if (entry.latestDate === null) return true;
  return state.lastNavDate !== null && state.lastNavDate >= entry.latestDate;
}

export interface IngestStateRow {
  lastNavDate: string | null;
  lastNav: number | null;
  lastSuccessAt: Date | null;
}

/** `ingest_state` rows for `codes`, keyed by scheme code (absent = never attempted). */
export async function loadStates(db: Database, codes: readonly number[]): Promise<Map<number, IngestStateRow>> {
  const out = new Map<number, IngestStateRow>();
  const CHUNK = 5000;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const rows = await db
      .select({
        schemeCode: ingestState.schemeCode,
        lastNavDate: ingestState.lastNavDate,
        lastNav: ingestState.lastNav,
        lastSuccessAt: ingestState.lastSuccessAt,
      })
      .from(ingestState)
      .where(inArray(ingestState.schemeCode, codes.slice(i, i + CHUNK)));
    for (const row of rows) out.set(row.schemeCode, row);
  }
  return out;
}

export async function runBackfill(deps: BackfillDeps): Promise<BackfillSummary> {
  const { db, store, mfapi, signal } = deps;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const concurrency = Math.max(1, deps.concurrency ?? DEFAULT_CONCURRENCY);

  const sync = await syncSchemes(db, { ...deps, mfapi, now: now(), onFallback: (e) => log(`AMFI NAVAll failed (${String(e)}); using mfapi /mf/latest`) });
  log(
    `schemes: ${sync.upserted} upserted from ${sync.universe.source}, ${sync.skippedUnclassified.length} skipped (unknown option), ${sync.metadataRows} metadata rows`
  );

  const skippedCodes = new Set(sync.skippedUnclassified);
  const wanted = deps.codes ? new Set(deps.codes) : null;
  const inScope = sync.universe.entries
    .filter((e) => !skippedCodes.has(e.schemeCode) && (!wanted || wanted.has(e.schemeCode)))
    .sort((a, b) => a.schemeCode - b.schemeCode);

  const states = await loadStates(
    db,
    inScope.map((e) => e.schemeCode)
  );
  let todo = inScope.filter((e) => !isUpToDate(states.get(e.schemeCode), e));
  const skippedUpToDate = inScope.length - todo.length;
  if (deps.limit !== undefined) todo = todo.slice(0, deps.limit);
  log(`backfill: ${inScope.length} in scope, ${skippedUpToDate} up to date, ${todo.length} to fetch (concurrency ${concurrency})`);

  const summary: BackfillSummary = {
    total: inScope.length,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skippedUpToDate,
    aborted: false,
  };

  const pool = await forEachConcurrent(
    todo,
    async (entry) => {
      summary.attempted++;
      const attemptAt = now();
      try {
        const history = await mfapi.getSchemeHistory(entry.schemeCode);
        const points = toNavPoints(history.data);
        // mfapi returns the full history, so a scheme with no stored series is
        // written outright; merging (one extra storage read) is only needed
        // when an earlier run already stored something.
        if (states.get(entry.schemeCode)?.lastSuccessAt) await store.appendPoints(String(entry.schemeCode), points);
        else await store.putSeries(String(entry.schemeCode), points);
        const head = points.reduce<(typeof points)[number] | null>((max, p) => (max === null || p.date > max.date ? p : max), null);
        await recordState(db, entry.schemeCode, { attemptAt, lastNavDate: head?.date ?? null, lastNav: head?.nav ?? null, error: null, successAt: now() });
        summary.succeeded++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordState(db, entry.schemeCode, { attemptAt, lastNavDate: undefined, error: message, successAt: undefined });
        summary.failed++;
        log(`scheme ${entry.schemeCode} failed: ${message}`);
      }
      const finished = summary.succeeded + summary.failed;
      if (finished % PROGRESS_EVERY === 0) {
        log(`progress: ${finished}/${todo.length} (ok ${summary.succeeded}, failed ${summary.failed})`);
      }
    },
    { concurrency, signal, deadline: deps.deadline, now: () => now().getTime() }
  );

  summary.aborted = pool.stoppedEarly;
  log(
    `backfill ${summary.aborted ? "interrupted" : "done"}: ok ${summary.succeeded}, failed ${summary.failed}, skipped ${summary.skippedUpToDate}`
  );
  return summary;
}

/** Upserts `ingest_state`; on failure the previous lastNavDate/lastSuccessAt are kept. */
export async function recordState(
  db: Database,
  schemeCode: number,
  update: { attemptAt: Date; lastNavDate: string | null | undefined; lastNav?: number | null; error: string | null; successAt: Date | undefined }
): Promise<void> {
  const success = update.successAt !== undefined;
  await db
    .insert(ingestState)
    .values({
      schemeCode,
      lastNavDate: update.lastNavDate ?? null,
      lastNav: update.lastNav ?? null,
      lastAttemptAt: update.attemptAt,
      lastSuccessAt: update.successAt ?? null,
      lastError: update.error,
    })
    .onConflictDoUpdate({
      target: ingestState.schemeCode,
      set: {
        lastAttemptAt: update.attemptAt,
        lastError: update.error,
        updatedAt: sql`now()`,
        ...(success ? { lastNavDate: update.lastNavDate ?? null, lastNav: update.lastNav ?? null, lastSuccessAt: update.successAt } : {}),
      },
    });
}
