import type { NavPoint } from "@/lib/nav-store";
import { listBenchmarkDefinitions } from "@/ingest/benchmarks";
import type { SyntheticMetrics, SyntheticScheme } from "./synthetic";

const DAY_MS = 86_400_000;
const YEAR_DAYS = 252;

function dateFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function weekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hash(text: string): number {
  let out = 2166136261;
  for (const char of text) out = Math.imul(out ^ char.charCodeAt(0), 16777619);
  return out >>> 0;
}

function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function series(startDate: string, asOf: string, seed: number, yearlyReturn: number, volatility: number, initial: number): NavPoint[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const rand = random(seed);
  const points: NavPoint[] = [];
  let nav = initial;
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const date = dateFromMs(ms);
    if (!weekday(date)) continue;
    if (points.length) nav *= Math.max(0.05, 1 + yearlyReturn / YEAR_DAYS + volatility / Math.sqrt(YEAR_DAYS) * normal(rand));
    points.push({ date, nav: Number(nav.toFixed(6)) });
  }
  return points;
}

/** Generates one reproducible weekday NAV history, capped at 12 years and the fund's inception. */
export function syntheticNavForScheme(scheme: SyntheticScheme, metrics: SyntheticMetrics, asOf: string): NavPoint[] {
  const twelveYearsAgo = `${Number(asOf.slice(0, 4)) - 12}${asOf.slice(4)}`;
  const startDate = scheme.inceptionDate > twelveYearsAgo ? scheme.inceptionDate : twelveYearsAgo;
  const yearlyReturn = metrics.cagr3y ?? metrics.cagr1y ?? (scheme.category === "Debt" ? 0.07 : 0.12);
  const volatility = metrics.stdDev3y ?? (scheme.category === "Debt" ? 0.03 : scheme.category === "Hybrid" ? 0.08 : 0.16);
  return series(startDate, asOf, scheme.schemeCode, yearlyReturn, volatility, 10);
}

/** Synthetic benchmark series use distinct prefixed ids and reproducible 12-year weekday histories. */
export function syntheticBenchmarkNav(asOf: string): Array<{ id: string; name: string; points: NavPoint[] }> {
  const twelveYearsAgo = `${Number(asOf.slice(0, 4)) - 12}${asOf.slice(4)}`;
  return listBenchmarkDefinitions().map((definition) => ({
    id: `synthetic-${definition.id}`,
    name: `[Synthetic] ${definition.name}`,
    points: series(twelveYearsAgo, asOf, hash(definition.id), 0.11, 0.18, 1000),
  }));
}
