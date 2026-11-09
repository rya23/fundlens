import type { Database } from "@/db/client";
import { mergeNavPoints, type NavStore } from "@/lib/nav-store";
import { loadStates, recordState } from "./backfill";
import { toNavPoints } from "./nav-points";
import { forEachConcurrent } from "./pool";
import { runPrecompute } from "./precompute";
import { ingestBenchmarks, type BenchmarkSource } from "./benchmarks";
import { syncSchemes, type UniverseEntry } from "./schemes";
import type { MetadataSource } from "./sources/metadata";
import type { MfApiClient } from "./sources/mfapi";

/** Parallel per-scheme NAV updates. Default 16: each one is a couple of storage round trips. */
const DEFAULT_CONCURRENCY = 16;

type Plan = { entry: UniverseEntry & { latestDate: string; latestNav: number }; kind: "append" | "history" };

/**
 * Daily refresh. For every scheme in today's universe, decides from
 * `ingest_state` (one bulk query, no storage reads) what to do:
 *   - up to date (same date and NAV already recorded): nothing;
 *   - has a stored history: merge today's NAV into it (one read, one write);
 *   - never stored successfully (new scheme, or a backfill that did not
 *     finish): fetch the full history from mfapi and write it.
 * The last case makes the nightly job converge on a complete store even if
 * a backfill run was cut short. Appends go first so the site stays fresh if
 * the time budget (`deadline`) runs out during history fetches.
 */
export async function runNightly(deps: {
  db: Database; store: NavStore; mfapi: Pick<MfApiClient, "getLatestNavs" | "getSchemeHistory">;
  metadata: MetadataSource; benchmarkSources: readonly BenchmarkSource[]; fetchNavAll?: () => Promise<string>;
  riskFreeRate?: number; now?: () => Date; log?: (message: string) => void;
  concurrency?: number; deadline?: number;
}) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const date = now().toISOString().slice(0, 10);
  const sync = await syncSchemes(deps.db, { mfapi: deps.mfapi, metadata: deps.metadata, fetchNavAll: deps.fetchNavAll, now: now(), onFallback: (error) => log(`AMFI NAVAll failed (${String(error)}); using mfapi /mf/latest`) });

  const skipped = new Set(sync.skippedUnclassified);
  const candidates = sync.universe.entries.filter((entry): entry is Plan["entry"] => !skipped.has(entry.schemeCode) && entry.latestDate !== null && entry.latestNav !== null);
  const states = await loadStates(deps.db, candidates.map((entry) => entry.schemeCode));
  const plans: Plan[] = [];
  for (const entry of candidates) {
    const state = states.get(entry.schemeCode);
    if (!state?.lastSuccessAt || state.lastNavDate === null) { plans.push({ entry, kind: "history" }); continue; }
    if (state.lastNavDate > entry.latestDate || (state.lastNavDate === entry.latestDate && state.lastNav === entry.latestNav)) continue;
    plans.push({ entry, kind: "append" });
  }
  plans.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "append" ? -1 : 1));
  const histories = plans.filter((plan) => plan.kind === "history").length;
  log(`nightly: ${candidates.length} schemes, ${candidates.length - plans.length} up to date, ${plans.length - histories} to append, ${histories} need full history`);

  let added = 0;
  let failed = 0;
  let historiesFetched = 0;
  let done = 0;
  const pool = await forEachConcurrent(plans, async ({ entry, kind }) => {
    const code = String(entry.schemeCode);
    const attemptAt = now();
    const latest = { date: entry.latestDate, nav: entry.latestNav };
    try {
      let head = latest;
      if (kind === "append") {
        const result = await deps.store.appendPoints(code, [latest]);
        added += result.added;
      } else {
        const history = toNavPoints((await deps.mfapi.getSchemeHistory(entry.schemeCode)).data);
        const merged = mergeNavPoints(history, [latest]).points;
        await deps.store.putSeries(code, merged);
        head = merged[merged.length - 1];
        added += merged.length;
        historiesFetched++;
      }
      await recordState(deps.db, entry.schemeCode, { attemptAt, lastNavDate: head.date, lastNav: head.nav, error: null, successAt: now() });
    } catch (error) {
      failed++;
      await recordState(deps.db, entry.schemeCode, { attemptAt, lastNavDate: undefined, error: error instanceof Error ? error.message : String(error), successAt: undefined });
    }
    if (++done % 500 === 0) log(`nightly: ${done}/${plans.length} schemes updated (${failed} failed)`);
  }, { concurrency: deps.concurrency ?? DEFAULT_CONCURRENCY, deadline: deps.deadline });
  if (pool.stoppedEarly) log(`nightly: time budget reached after ${pool.started}/${plans.length} schemes; the next run continues`);

  const benchmarkResults = await ingestBenchmarks({ db: deps.db, sources: deps.benchmarkSources, log });
  const metrics = await runPrecompute({ db: deps.db, store: deps.store, asOf: date, riskFreeRate: deps.riskFreeRate, log });
  const summary = { source: sync.universe.source, schemes: sync.upserted, navPointsAdded: added, historiesFetched, failed, stoppedEarly: pool.stoppedEarly, benchmarks: benchmarkResults, metrics };
  log(`nightly complete: ${sync.upserted} schemes, ${added} NAV points, ${historiesFetched} full histories, ${failed} failures`);
  return summary;
}
