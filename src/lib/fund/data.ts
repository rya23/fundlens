import { unstable_cache } from "next/cache";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { benchmarkNav, benchmarks, schemeMetrics, schemes } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { createNavStoreFromEnv, type NavPoint as StoredNavPoint } from "@/lib/nav-store";
import { betaAlpha, maxDrawdown, annualizedVolatility, sharpeRatio, sortinoRatio, upDownCapture } from "@/lib/metrics/risk";
import { pctRollingWindowsBeatingBenchmark, rollingCAGR, trailingCAGR, type RollingWindowYears, type TrailingWindowYears } from "@/lib/metrics/returns";
import { rankPeer } from "@/lib/metrics/peers";
import type { MetricResult } from "@/lib/metrics/types";
import { benchmarkId } from "@/ingest/benchmarks";
import { getBenchmarkMapping, normalizeCategory } from "@/ingest/classify";

export type FundWindow = TrailingWindowYears;
export type FundRollingWindow = RollingWindowYears;
export type FundMetric = "cagr" | "sharpe" | "sortino" | "alpha" | "beta" | "rSquared" | "stdDev" | "maxDrawdown" | "trackingError" | "infoRatio" | "upCapture" | "downCapture";
export type FundData = {
  scheme: { code: number; name: string; amc: string; category: string; subCategory: string; plan: string; option: string; inceptionDate: string | null; officialBenchmarkName: string | null; terPct: number | null; aumCr: number | null; riskometer: string | null; exitLoad: string | null; managers: string | null };
  benchmark: { name: string; kind: "tri" | "index_fund_proxy"; source: string } | null;
  nav: StoredNavPoint[];
  benchmarkNav: StoredNavPoint[];
  trailing: Record<FundWindow, MetricResult<number>>;
  rolling: Record<FundRollingWindow, { points: Array<{ date: string; cagr: number }>; benchmarkPoints: Array<{ date: string; cagr: number }>; min: number | null; median: number | null; max: number | null; pctBeatBenchmark: number | null }>;
  risk: Record<FundWindow, Record<FundMetric, MetricResult<number>>>;
  peers: Partial<Record<FundMetric, { window: 3 | 5; quartile: 1 | 2 | 3 | 4; percentile: number; count: number } | null>>;
};

export interface FundAssemblyInput {
  scheme: FundData["scheme"];
  benchmark: FundData["benchmark"];
  nav: StoredNavPoint[];
  benchmarkNav: StoredNavPoint[];
  peerValues?: Partial<Record<FundMetric, Array<number | null>>>;
  riskFreeRate?: number;
}

export function assembleFundData(input: FundAssemblyInput): FundData {
  const { scheme, benchmark, nav, benchmarkNav } = input;
  const rf = input.riskFreeRate ?? 0.065;
  const trailing = Object.fromEntries(([1, 3, 5, 10] as const).map((years) => [years, trailingCAGR(nav, years)])) as FundData["trailing"];
  const rolling = Object.fromEntries(([1, 3, 5] as const).map((years) => {
    const fund = rollingCAGR(nav, years);
    const index = rollingCAGR(benchmarkNav, years);
    const distribution = fund.ok ? fund.value : null;
    const beat = distribution && index.ok ? pctRollingWindowsBeatingBenchmark(distribution, index.value) : null;
    return [years, { points: distribution?.points ?? [], benchmarkPoints: index.ok ? index.value.points : [], min: distribution?.stats.min ?? null, median: distribution?.stats.median ?? null, max: distribution?.stats.max ?? null, pctBeatBenchmark: beat?.ok ? beat.value : null }];
  })) as FundData["rolling"];
  const risk = Object.fromEntries(([1, 3, 5, 10] as const).map((years) => {
    const regression = betaAlpha(nav, benchmarkNav, years, rf);
    const capture = upDownCapture(nav, benchmarkNav, years);
    const drawdown = maxDrawdown(nav, years);
    const result: FundData["risk"][FundWindow] = {
      cagr: trailing[years], sharpe: sharpeRatio(nav, years, rf), sortino: sortinoRatio(nav, years, rf),
      alpha: regression.ok ? { ok: true, value: regression.value.alpha } : regression,
      beta: regression.ok ? { ok: true, value: regression.value.beta } : regression,
      rSquared: regression.ok ? { ok: true, value: regression.value.r2 } : regression,
      stdDev: annualizedVolatility(nav, years), maxDrawdown: drawdown.ok ? { ok: true, value: drawdown.value.drawdown } : drawdown,
      trackingError: regression.ok ? { ok: true, value: regression.value.trackingError } : regression,
      infoRatio: regression.ok ? regression.value.informationRatio : regression,
      upCapture: capture.ok ? capture.value.upCapture : capture,
      downCapture: capture.ok ? capture.value.downCapture : capture,
    };
    return [years, result];
  })) as FundData["risk"];
  const peers: FundData["peers"] = {};
  for (const [metric, values] of Object.entries(input.peerValues ?? {}) as [FundMetric, Array<number | null>][]) {
    const window = metric === "maxDrawdown" ? 5 : 3;
    const value = metric === "cagr" ? trailing[3] : risk[window][metric];
    if (!value?.ok) { peers[metric] = null; continue; }
    const direction = metric === "stdDev" || metric === "trackingError" || metric === "downCapture" ? "lower-is-better" : "higher-is-better";
    const rank = rankPeer(value.value, values, direction);
    peers[metric] = rank && rank.peerCount >= 4 ? { window, quartile: rank.quartile, percentile: rank.percentile, count: rank.peerCount } : null;
  }
  return { scheme, benchmark, nav, benchmarkNav, trailing, rolling, risk, peers };
}

async function loadFundData(schemeCode: string): Promise<FundData | null> {
  if (!/^\d{1,10}$/.test(schemeCode) || Number(schemeCode) > 2_147_483_647) return null;
  const db = getDb();
  const code = Number(schemeCode);
  const [row] = await db.select().from(schemes).where(eq(schemes.schemeCode, code)).limit(1);
  if (!row) return null;
  const normalized = normalizeCategory(`${row.category} Scheme - ${row.subCategory ?? ""}`);
  const mapping = getBenchmarkMapping(normalized);
  const id = mapping.triName ? benchmarkId(mapping.triName) : null;
  const benchmarkIds = id ? (code >= 9_000_000 ? [`synthetic-${id}`, id] : [id, `synthetic-${id}`]) : [];
  let benchmark: typeof benchmarks.$inferSelect | undefined;
  for (const benchmarkId of benchmarkIds) {
    [benchmark] = await db.select().from(benchmarks).where(eq(benchmarks.id, benchmarkId)).limit(1);
    if (benchmark) break;
  }
  const [fundSeries, indexRows] = await Promise.all([
    createNavStoreFromEnv(getEnv()).getSeries(schemeCode),
    benchmark ? db.select({ date: benchmarkNav.date, value: benchmarkNav.value }).from(benchmarkNav).where(eq(benchmarkNav.benchmarkId, benchmark.id)).orderBy(asc(benchmarkNav.date)) : Promise.resolve([]),
  ]);
  const peerMetricColumns = { cagr: [schemeMetrics.cagr3y, "cagr3y"], sharpe: [schemeMetrics.sharpe3y, "sharpe3y"], sortino: [schemeMetrics.sortino3y, "sortino3y"], alpha: [schemeMetrics.alpha3y, "alpha3y"], beta: [schemeMetrics.beta3y, "beta3y"], rSquared: [schemeMetrics.rSquared3y, "rSquared3y"], stdDev: [schemeMetrics.stdDev3y, "stdDev3y"], maxDrawdown: [schemeMetrics.maxDrawdown5y, "maxDrawdown5y"], trackingError: [schemeMetrics.trackingError3y, "trackingError3y"], infoRatio: [schemeMetrics.infoRatio3y, "infoRatio3y"], upCapture: [schemeMetrics.upCapture3y, "upCapture3y"], downCapture: [schemeMetrics.downCapture3y, "downCapture3y"] } as const;
  const peerProjection = Object.fromEntries(Object.entries(peerMetricColumns).map(([metric, [column]]) => [metric, column]));
  const peerRows = row.subCategory ? await db.select(peerProjection).from(schemes).innerJoin(schemeMetrics, eq(schemeMetrics.schemeCode, schemes.schemeCode)).where(eq(schemes.subCategory, row.subCategory)) : [];
  const peerValues: FundAssemblyInput["peerValues"] = {};
  for (const metric of Object.keys(peerMetricColumns) as (keyof typeof peerMetricColumns)[]) {
    peerValues[metric] = peerRows.map((peer) => peer[metric] as number | null);
  }
  const series = (fundSeries?.points ?? []).map(({ date, nav }) => ({ date, nav }));
  const indexSeries = indexRows.map(({ date, value }) => ({ date, nav: value }));
  const schemeInfo: FundData["scheme"] = {
    code, name: row.name, amc: row.amc, category: row.category, subCategory: normalized.subCategory,
    plan: row.plan, option: row.option, inceptionDate: row.inceptionDate, officialBenchmarkName: row.officialBenchmarkName,
    terPct: row.terPct, aumCr: row.aumCr, riskometer: row.riskometer, exitLoad: row.exitLoad, managers: row.managers,
  };
  return assembleFundData({ scheme: schemeInfo, benchmark: benchmark ? { name: benchmark.name, kind: benchmark.kind, source: benchmark.source } : null, nav: series, benchmarkNav: indexSeries, peerValues, riskFreeRate: getEnv().RISK_FREE_RATE });
}

export const getFundData = unstable_cache(loadFundData, ["fund-data-v1"], { revalidate: 86_400 });

export const getFundOptions = unstable_cache(async () => {
  return getDb().select({ code: schemes.schemeCode, name: schemes.name, amc: schemes.amc, subCategory: schemes.subCategory }).from(schemes).orderBy(schemes.name);
}, ["fund-options-v1"], { revalidate: 86_400 });

export function parseCompareCodes(codes: string | string[] | undefined): string[] {
  const raw = Array.isArray(codes) ? codes.join(",") : codes ?? "";
  return [...new Set(raw.split(",").map((code) => code.trim()).filter((code) => /^\d{1,10}$/.test(code) && Number(code) <= 2_147_483_647))].slice(0, 5);
}

