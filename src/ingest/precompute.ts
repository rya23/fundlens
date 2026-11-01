import { asc, eq } from "drizzle-orm";

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

const METRIC_KEYS = ["cagr1y", "cagr3y", "cagr5y", "cagr10y", "rolling3yCagrMedian", "pctRolling3yBeatBenchmark", "sharpe3y", "sortino3y", "alpha3y", "beta3y", "rSquared3y", "stdDev3y", "trackingError3y", "infoRatio3y", "maxDrawdown5y", "upCapture3y", "downCapture3y", "sipXirr3y", "sipXirr5y"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
type CategoryMetricKey = MetricKey | "aumCr" | "terPct" | "ageYears";
type MetricValues = Record<MetricKey, number | null>;
const value = (result: { ok: boolean; value?: number }): number | null => result.ok ? result.value ?? null : null;

export async function runPrecompute({ db, store, asOf = new Date().toISOString().slice(0, 10), riskFreeRate = 0.065, log = () => {} }: {
  db: Database; store: NavStore; asOf?: string; riskFreeRate?: number; log?: (message: string) => void;
}) {
  const benchmarkRows = await db.select({ id: benchmarkNav.benchmarkId, date: benchmarkNav.date, nav: benchmarkNav.value }).from(benchmarkNav).orderBy(asc(benchmarkNav.date));
  const benchmarkSeries = new Map<string, { date: string; nav: number }[]>();
  for (const row of benchmarkRows) {
    if (row.date > asOf) continue;
    let series = benchmarkSeries.get(row.id);
    if (!series) benchmarkSeries.set(row.id, series = []);
    series.push({ date: row.date, nav: row.nav });
  }
  const stats = new Map<string, Map<CategoryMetricKey, number[]>>();
  let processed = 0;
  const PAGE_SIZE = 250;
  let offset = 0;
  while (true) {
    const page = await db.select({ schemeCode: schemes.schemeCode, subCategory: schemes.subCategory, category: schemes.category, aumCr: schemes.aumCr, terPct: schemes.terPct, inceptionDate: schemes.inceptionDate }).from(schemes).orderBy(asc(schemes.schemeCode)).limit(PAGE_SIZE).offset(offset);
    if (!page.length) break;
    offset += page.length;
    for (const scheme of page) {
    if (scheme.subCategory) {
      let category = stats.get(scheme.subCategory);
      if (!category) stats.set(scheme.subCategory, category = new Map());
      const ageYears = scheme.inceptionDate ? (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${scheme.inceptionDate}T00:00:00Z`)) / (365.25 * 86_400_000) : null;
      for (const [key, metricValue] of [["aumCr", scheme.aumCr], ["terPct", scheme.terPct], ["ageYears", ageYears]] as const) {
        if (metricValue === null) continue;
        let values = category.get(key);
        if (!values) category.set(key, values = []);
        values.push(metricValue);
      }
    }
    const stored = await store.getSeries(String(scheme.schemeCode));
    const nav = stored?.points.filter((point) => point.date <= asOf) ?? [];
    if (!nav.length) {
      await db.delete(schemeMetrics).where(eq(schemeMetrics.schemeCode, scheme.schemeCode));
      continue;
    }
    const map = getBenchmarkMapping(normalizeCategory(`${scheme.category} Scheme - ${scheme.subCategory ?? ""}`));
    const id = map.triName ? `${scheme.schemeCode >= 9_000_000 ? "synthetic-" : ""}${benchmarkId(map.triName)}` : null;
    const bench = id ? benchmarkSeries.get(id) ?? [] : [];
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
    const metrics: MetricValues = {
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
    await db.insert(schemeMetrics).values({ schemeCode: scheme.schemeCode, asOf, navLastDate: nav[nav.length - 1].date, ...metrics, updatedAt: new Date() }).onConflictDoUpdate({ target: schemeMetrics.schemeCode, set: { asOf, navLastDate: nav[nav.length - 1].date, ...metrics, updatedAt: new Date() } });
    if (scheme.subCategory) {
      let category = stats.get(scheme.subCategory);
      if (!category) stats.set(scheme.subCategory, category = new Map());
      for (const key of METRIC_KEYS) {
        if (metrics[key] === null) continue;
        let values = category.get(key);
        if (!values) category.set(key, values = []);
        values.push(metrics[key]!);
      }
    }
    processed++;
    if (processed % 500 === 0) log(`precomputed ${processed} schemes`);
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(categoryStats);
    for (const [category, values] of stats) for (const key of [...METRIC_KEYS, "aumCr", "terPct", "ageYears"] as const) {
      const metricValues = values.get(key) ?? [];
      const cuts = computeQuartileCutPoints(metricValues);
      if (cuts) await tx.insert(categoryStats).values({ category, metric: key, count: metricValues.length, cutQ1: cuts.q1, cutQ2: cuts.q2, cutQ3: cuts.q3, asOf });
    }
  });
  log(`precomputed ${processed} schemes; category stats refreshed`);
  return { processed, categories: stats.size };
}
