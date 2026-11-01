/**
 * Benchmark history ingestion (ticket 08, docs/benchmarks.md).
 *
 * Each index in the category map (classify.ts) gets one `benchmarks` row and
 * a daily series in `benchmark_nav`. Where the series comes from is behind
 * the `BenchmarkSource` interface. Today the only implementation is
 * `IndexFundProxySource`: the NAV of a low-cost index fund tracking the
 * index, fetched through the existing mfapi client and stored with kind
 * `index_fund_proxy`. A true total-return-index (TRI) source is pending the
 * owner's decision; when one exists it is added to the `sources` list ahead
 * of the proxy and the pipeline upgrades stored history automatically.
 */
import { desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { benchmarkNav, benchmarks } from "@/db/schema";
import { listBenchmarkMappings } from "./classify";
import { toNavPoints } from "./nav-points";
import type { MfApiClient } from "./sources/mfapi";

export type BenchmarkKind = (typeof benchmarks.$inferSelect)["kind"];

export interface BenchmarkDefinition {
  /** Stable slug, see `benchmarkId`. */
  id: string;
  /** Index name, e.g. "NIFTY 500 TRI". */
  name: string;
  /** mfapi scheme code of the low-cost index fund used as a proxy. */
  fallbackSchemeCode: number;
}

export interface BenchmarkPoint {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  value: number;
}

export interface BenchmarkHistory {
  /** Stored in `benchmarks.source`, e.g. "mfapi:153161". */
  source: string;
  points: BenchmarkPoint[];
}

export interface BenchmarkSource {
  readonly kind: BenchmarkKind;
  /**
   * Full available history for the benchmark, or null when this source has
   * no series for it. Throws on failure (the next source is then tried).
   */
  fetchHistory(definition: BenchmarkDefinition): Promise<BenchmarkHistory | null>;
}

/** "NIFTY LARGEMIDCAP 250 TRI" -> "nifty-largemidcap-250-tri". The key precompute uses to find a category's benchmark. */
export function benchmarkId(indexName: string): string {
  return indexName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One definition per distinct index referenced by the category map. */
export function listBenchmarkDefinitions(): BenchmarkDefinition[] {
  const byId = new Map<string, BenchmarkDefinition>();
  for (const mapping of listBenchmarkMappings()) {
    if (mapping.triName === null || mapping.fallbackSchemeCode === null) continue;
    const id = benchmarkId(mapping.triName);
    if (!byId.has(id)) byId.set(id, { id, name: mapping.triName, fallbackSchemeCode: mapping.fallbackSchemeCode });
  }
  return [...byId.values()];
}

/**
 * NAV history of the index fund named in the category map. Understates the
 * index by roughly the fund's TER plus tracking error, and only reaches back
 * to the fund's launch.
 */
export class IndexFundProxySource implements BenchmarkSource {
  readonly kind = "index_fund_proxy" as const;

  constructor(private readonly mfapi: Pick<MfApiClient, "getSchemeHistory">) {}

  async fetchHistory(definition: BenchmarkDefinition): Promise<BenchmarkHistory | null> {
    const history = await this.mfapi.getSchemeHistory(definition.fallbackSchemeCode);
    const points = toNavPoints(history.data)
      .map((p) => ({ date: p.date, value: p.nav }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (points.length === 0) return null;
    return { source: `mfapi:${definition.fallbackSchemeCode}`, points };
  }
}

export interface IngestBenchmarksDeps {
  db: Database;
  /** In priority order; the first that yields history wins. */
  sources: readonly BenchmarkSource[];
  /** Defaults to every index in the category map. */
  definitions?: readonly BenchmarkDefinition[];
  log?: (message: string) => void;
}

export interface BenchmarkIngestResult {
  id: string;
  status: "updated" | "unchanged" | "failed";
  kind?: BenchmarkKind;
  /** Rows inserted. */
  added: number;
  error?: string;
}

/** Higher is better; stored history is never replaced by a lower-ranked kind. */
const KIND_RANK: Record<BenchmarkKind, number> = { index_fund_proxy: 1, tri: 2 };

const CHUNK = 1000;

export async function ingestBenchmarks(deps: IngestBenchmarksDeps): Promise<BenchmarkIngestResult[]> {
  const log = deps.log ?? (() => {});
  const definitions = deps.definitions ?? listBenchmarkDefinitions();
  const results: BenchmarkIngestResult[] = [];
  for (const definition of definitions) {
    const result = await ingestOne(deps.db, deps.sources, definition);
    log(
      `benchmark ${definition.id}: ${result.status}${result.kind ? ` (${result.kind})` : ""}, ${result.added} rows added${result.error ? `, error: ${result.error}` : ""}`
    );
    results.push(result);
  }
  return results;
}

async function ingestOne(
  db: Database,
  sources: readonly BenchmarkSource[],
  definition: BenchmarkDefinition
): Promise<BenchmarkIngestResult> {
  const [stored] = await db.select().from(benchmarks).where(eq(benchmarks.id, definition.id));

  const errors: string[] = [];
  let chosen: { kind: BenchmarkKind; history: BenchmarkHistory } | undefined;
  for (const source of sources) {
    if (stored && KIND_RANK[source.kind] < KIND_RANK[stored.kind]) continue;
    try {
      const history = await source.fetchHistory(definition);
      if (history && history.points.length > 0) {
        chosen = { kind: source.kind, history };
        break;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!chosen) {
    if (errors.length > 0) {
      return { id: definition.id, status: "failed", kind: stored?.kind, added: 0, error: errors.join("; ") };
    }
    return { id: definition.id, status: "unchanged", kind: stored?.kind, added: 0 };
  }

  const { kind, history } = chosen;
  const sameSeries = stored !== undefined && stored.kind === kind && stored.source === history.source;

  if (sameSeries) {
    const [latest] = await db
      .select({ date: benchmarkNav.date })
      .from(benchmarkNav)
      .where(eq(benchmarkNav.benchmarkId, definition.id))
      .orderBy(desc(benchmarkNav.date))
      .limit(1);
    const fresh = latest ? history.points.filter((p) => p.date > latest.date) : history.points;
    if (fresh.length === 0) return { id: definition.id, status: "unchanged", kind, added: 0 };
    await insertPoints(db, definition.id, fresh);
    return { id: definition.id, status: "updated", kind, added: fresh.length };
  }

  // New benchmark, or a different kind/source: levels from different series
  // are not comparable, so swap the whole history atomically.
  await db.transaction(async (tx) => {
    await tx
      .insert(benchmarks)
      .values({ id: definition.id, name: definition.name, kind, source: history.source })
      .onConflictDoUpdate({
        target: benchmarks.id,
        set: { name: definition.name, kind, source: history.source },
      });
    await tx.delete(benchmarkNav).where(eq(benchmarkNav.benchmarkId, definition.id));
    await insertPoints(tx, definition.id, history.points);
  });
  return { id: definition.id, status: "updated", kind, added: history.points.length };
}

type Writer = Pick<Database, "insert">;

async function insertPoints(db: Writer, id: string, points: readonly BenchmarkPoint[]): Promise<void> {
  for (let i = 0; i < points.length; i += CHUNK) {
    await db
      .insert(benchmarkNav)
      .values(points.slice(i, i + CHUNK).map((p) => ({ benchmarkId: id, date: p.date, value: p.value })))
      .onConflictDoUpdate({
        target: [benchmarkNav.benchmarkId, benchmarkNav.date],
        set: { value: sql`excluded.value` },
      });
  }
}
