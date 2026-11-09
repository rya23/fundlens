import { asc, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { benchmarkNav, categoryStats, schemeMetrics, schemes } from "@/db/schema";
import type { NavStore } from "@/lib/nav-store";
import { annualizedVolatility, betaAlpha, maxDrawdown, sharpeRatio, sortinoRatio, upDownCapture } from "@/lib/metrics/risk";
import { pctRollingWindowsBeatingBenchmark, rollingCAGR, trailingCAGR } from "@/lib/metrics/returns";
import { computeQuartileCutPoints } from "@/lib/metrics/peers";
import { subtractYears } from "@/lib/metrics/series";
import { simulateSip } from "@/lib/metrics/sip";
import { benchmarkId } from "./benchmarks";
import { getBenchmarkMapping, normalizeCategory } from "./classify";
import { forEachConcurrent } from "./pool";

const METRIC_KEYS = ["cagr1y", "cagr3y", "cagr5y", "cagr10y", "rolling3yCagrMedian", "pctRolling3yBeatBenchmark", "sharpe3y", "sortino3y", "alpha3y", "beta3y", "rSquared3y", "stdDev3y", "trackingError3y", "infoRatio3y", "maxDrawdown5y", "upCapture3y", "downCapture3y", "sipXirr3y", "sipXirr5y"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
type CategoryMetricKey = MetricKey | "aumCr" | "terPct" | "ageYears";
type MetricValues = Record<MetricKey, number | null>;
const value = (result: { ok: boolean; value?: number }): number | null => result.ok ? result.value ?? null : null;

type SchemeRow = { schemeCode: number; subCategory: string | null; category: string; aumCr: number | null; terPct: number | null; inceptionDate: string | null };
type NavInput = { date: string; nav: number }[];

/** Every precomputed metric for one scheme. Pure: no I/O. */
export function computeSchemeMetrics(nav: NavInput, bench: NavInput, asOf: string, riskFreeRate: number): MetricValues {
  const c1 = trailingCAGR(nav, 1, { asOf });
  const c3 = trailingCAGR(nav, 3, { asOf });
  const c5 = trailingCAGR(nav, 5, { asOf });
  const c10 = trailingCAGR(nav, 10, { asOf });
  const rolling = rollingCAGR(nav, 3);
  const benchRolling = bench.length ? rollingCAGR(bench, 3) : null;
  const beat = rolling.ok && benchRolling?.ok ? pctRollingWindowsBeatingBenchmark(rolling.value, benchRolling.value) : null;
  const risk = betaAlpha(nav, bench, 3, riskFreeRate, { asOf });
  const capture = upDownCapture(nav, bench, 3, { asOf });
  // SIP windows start on the same calendar date N years before the valuation date.
  const sipResult = (years: 3 | 5) => {
    const start = subtractYears(asOf, years);
    return nav[0].date <= start ? simulateSip(nav, { monthlyAmount: 1000, startDate: new Date(start), endDate: new Date(asOf) }) : null;
  };
  const s3 = sipResult(3); const s5 = sipResult(5);
  return {
    cagr1y: value(c1), cagr3y: value(c3), cagr5y: value(c5), cagr10y: value(c10),
    rolling3yCagrMedian: rolling.ok ? rolling.value.stats.median : null,
    pctRolling3yBeatBenchmark: beat?.ok ? beat.value : null,
    sharpe3y: value(sharpeRatio(nav, 3, riskFreeRate, { asOf })), sortino3y: value(sortinoRatio(nav, 3, riskFreeRate, { asOf })),
    alpha3y: risk.ok ? risk.value.alpha : null, beta3y: risk.ok ? risk.value.beta : null, rSquared3y: risk.ok ? risk.value.r2 : null,
    stdDev3y: value(annualizedVolatility(nav, 3, { asOf })), trackingError3y: risk.ok ? risk.value.trackingError : null,
    infoRatio3y: risk.ok ? value(risk.value.informationRatio) : null,
    maxDrawdown5y: (() => { const r = maxDrawdown(nav, 5, { asOf }); return r.ok ? r.value.drawdown : null; })(),
    upCapture3y: capture.ok ? value(capture.value.upCapture) : null, downCapture3y: capture.ok ? value(capture.value.downCapture) : null,
    sipXirr3y: s3?.ok && s3.value.xirr.ok ? s3.value.xirr.value : null, sipXirr5y: s5?.ok && s5.value.xirr.ok ? s5.value.xirr.value : null,
  };
}

/** Rows per multi-row write; 22 columns x 500 stays far below Postgres' 65535 bind-parameter limit. */
const WRITE_BATCH = 500;
const DEFAULT_CONCURRENCY = 16;

/**
 * Recomputes `scheme_metrics` for every scheme and rebuilds `category_stats`.
 * NAV series are read from the store with bounded concurrency (each read is a
 * network round trip on Supabase/R2) and metric rows are written in batches,
 * so the run is dominated by storage throughput rather than ~8k sequential
 * round trips. A series that fails to load is logged and skipped; its old
 * metrics row is kept rather than deleted.
 */
export async function runPrecompute({ db, store, asOf = new Date().toISOString().slice(0, 10), riskFreeRate = 0.065, concurrency = DEFAULT_CONCURRENCY, log = () => {} }: {
  db: Database; store: NavStore; asOf?: string; riskFreeRate?: number; concurrency?: number; log?: (message: string) => void;
}) {
  const benchmarkRows = await db.select({ id: benchmarkNav.benchmarkId, date: benchmarkNav.date, nav: benchmarkNav.value }).from(benchmarkNav).orderBy(asc(benchmarkNav.date));
  const benchmarkSeries = new Map<string, NavInput>();
  for (const row of benchmarkRows) {
    if (row.date > asOf) continue;
    let series = benchmarkSeries.get(row.id);
    if (!series) benchmarkSeries.set(row.id, series = []);
    series.push({ date: row.date, nav: row.nav });
  }
  const allSchemes: SchemeRow[] = await db.select({ schemeCode: schemes.schemeCode, subCategory: schemes.subCategory, category: schemes.category, aumCr: schemes.aumCr, terPct: schemes.terPct, inceptionDate: schemes.inceptionDate }).from(schemes).orderBy(asc(schemes.schemeCode));

  const stats = new Map<string, Map<CategoryMetricKey, number[]>>();
  const addStat = (subCategory: string, key: CategoryMetricKey, metricValue: number) => {
    let category = stats.get(subCategory);
    if (!category) stats.set(subCategory, category = new Map());
    let values = category.get(key);
    if (!values) category.set(key, values = []);
    values.push(metricValue);
  };

  type MetricRow = typeof schemeMetrics.$inferInsert;
  let pendingRows: MetricRow[] = [];
  let pendingDeletes: number[] = [];
  // Serialises flushes so batches never interleave on the connection pool.
  let writes: Promise<void> = Promise.resolve();
  const flush = () => {
    const rows = pendingRows; const deletes = pendingDeletes;
    pendingRows = []; pendingDeletes = [];
    writes = writes.then(async () => {
      if (rows.length) await db.insert(schemeMetrics).values(rows).onConflictDoUpdate({ target: schemeMetrics.schemeCode, set: excludedSet(rows[0]) });
      if (deletes.length) await db.delete(schemeMetrics).where(inArray(schemeMetrics.schemeCode, deletes));
    });
    return writes;
  };

  let processed = 0;
  let failed = 0;
  let visited = 0;
  await forEachConcurrent(allSchemes, async (scheme) => {
    let stored;
    try {
      stored = await store.getSeries(String(scheme.schemeCode));
    } catch (error) {
      failed++;
      log(`precompute: scheme ${scheme.schemeCode} NAV read failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (scheme.subCategory) {
      const ageYears = scheme.inceptionDate ? (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${scheme.inceptionDate}T00:00:00Z`)) / (365.25 * 86_400_000) : null;
      for (const [key, metricValue] of [["aumCr", scheme.aumCr], ["terPct", scheme.terPct], ["ageYears", ageYears]] as const) {
        if (metricValue !== null) addStat(scheme.subCategory, key, metricValue);
      }
    }
    const nav = stored?.points.filter((point) => point.date <= asOf) ?? [];
    if (!nav.length) {
      pendingDeletes.push(scheme.schemeCode);
    } else {
      const map = getBenchmarkMapping(normalizeCategory(`${scheme.category} Scheme - ${scheme.subCategory ?? ""}`));
      const id = map.triName ? `${scheme.schemeCode >= 9_000_000 ? "synthetic-" : ""}${benchmarkId(map.triName)}` : null;
      const metrics = computeSchemeMetrics(nav, id ? benchmarkSeries.get(id) ?? [] : [], asOf, riskFreeRate);
      pendingRows.push({ schemeCode: scheme.schemeCode, asOf, navLastDate: nav[nav.length - 1].date, ...metrics, updatedAt: new Date() });
      if (scheme.subCategory) for (const key of METRIC_KEYS) if (metrics[key] !== null) addStat(scheme.subCategory, key, metrics[key]!);
      processed++;
    }
    if (pendingRows.length + pendingDeletes.length >= WRITE_BATCH) await flush();
    if (++visited % 500 === 0) log(`precompute: ${visited}/${allSchemes.length} schemes read (${processed} with NAV)`);
  }, { concurrency });
  await flush();

  const statRows: (typeof categoryStats.$inferInsert)[] = [];
  for (const [category, values] of stats) for (const key of [...METRIC_KEYS, "aumCr", "terPct", "ageYears"] as const) {
    const metricValues = values.get(key) ?? [];
    const cuts = computeQuartileCutPoints(metricValues);
    if (cuts) statRows.push({ category, metric: key, count: metricValues.length, cutQ1: cuts.q1, cutQ2: cuts.q2, cutQ3: cuts.q3, asOf });
  }
  await db.transaction(async (tx) => {
    await tx.delete(categoryStats);
    for (let i = 0; i < statRows.length; i += WRITE_BATCH) await tx.insert(categoryStats).values(statRows.slice(i, i + WRITE_BATCH));
  });
  log(`precomputed ${processed} schemes${failed ? `, ${failed} NAV reads failed` : ""}; category stats refreshed`);
  return { processed, failed, categories: stats.size };
}

/** `SET col = excluded.col` for every non-key column of a metrics row (multi-row upsert). */
function excludedSet(row: Record<string, unknown>) {
  const set: Record<string, ReturnType<typeof sql>> = {};
  for (const key of Object.keys(row)) {
    if (key === "schemeCode") continue;
    const column = schemeMetrics[key as keyof typeof schemeMetrics.$inferInsert];
    set[key] = sql.raw(`excluded."${(column as unknown as { name: string }).name}"`);
  }
  return set;
}
