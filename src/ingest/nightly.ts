import type { Database } from "@/db/client";
import { ingestState } from "@/db/schema";
import type { NavStore } from "@/lib/nav-store";
import { runPrecompute } from "./precompute";
import { ingestBenchmarks, type BenchmarkSource } from "./benchmarks";
import { syncSchemes } from "./schemes";
import type { MetadataSource } from "./sources/metadata";
import type { MfApiClient } from "./sources/mfapi";

export async function runNightly(deps: {
  db: Database; store: NavStore; mfapi: Pick<MfApiClient, "getLatestNavs" | "getSchemeHistory">;
  metadata: MetadataSource; benchmarkSources: readonly BenchmarkSource[]; fetchNavAll?: () => Promise<string>;
  riskFreeRate?: number; now?: () => Date; log?: (message: string) => void;
}) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const date = now().toISOString().slice(0, 10);
  const sync = await syncSchemes(deps.db, { mfapi: deps.mfapi, metadata: deps.metadata, fetchNavAll: deps.fetchNavAll, now: now(), onFallback: (error) => log(`AMFI NAVAll failed (${String(error)}); using mfapi /mf/latest`) });
  let added = 0;
  let failed = 0;
  for (const entry of sync.universe.entries) {
    if (sync.skippedUnclassified.includes(entry.schemeCode) || !entry.latestDate || !entry.latestNav) continue;
    const code = String(entry.schemeCode);
    try {
      const head = await deps.store.getHead(code);
      if (!head || head.date < entry.latestDate || (head.date === entry.latestDate && head.nav !== entry.latestNav)) {
        const result = await deps.store.appendPoints(code, [{ date: entry.latestDate, nav: entry.latestNav }]);
        added += result.added;
      }
      await deps.db.insert(ingestState).values({ schemeCode: entry.schemeCode, lastNavDate: entry.latestDate, lastAttemptAt: now(), lastSuccessAt: now(), lastError: null, updatedAt: now() }).onConflictDoUpdate({ target: ingestState.schemeCode, set: { lastNavDate: entry.latestDate, lastAttemptAt: now(), lastSuccessAt: now(), lastError: null, updatedAt: now() } });
    } catch (error) {
      failed++;
      await deps.db.insert(ingestState).values({ schemeCode: entry.schemeCode, lastAttemptAt: now(), lastError: String(error), updatedAt: now() }).onConflictDoUpdate({ target: ingestState.schemeCode, set: { lastAttemptAt: now(), lastError: String(error), updatedAt: now() } });
    }
  }
  const benchmarkResults = await ingestBenchmarks({ db: deps.db, sources: deps.benchmarkSources, log });
  const metrics = await runPrecompute({ db: deps.db, store: deps.store, asOf: date, riskFreeRate: deps.riskFreeRate, log });
  const summary = { source: sync.universe.source, schemes: sync.upserted, navPointsAdded: added, failed, benchmarks: benchmarkResults, metrics };
  log(`nightly complete: ${sync.upserted} schemes, ${added} NAV points, ${failed} failures`);
  return summary;
}
