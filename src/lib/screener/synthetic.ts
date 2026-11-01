import { computeQuartileCutPoints } from "@/lib/metrics/peers";
import { NUMERIC_COLUMNS, getNumericColumn, type NumericColumnId } from "./columns";

/**
 * Deterministic, clearly fictional fund universe for `npm run seed:dev`, so
 * the screener is reviewable without a backfill. Nothing here resembles real
 * data: AMCs are invented, numbers come from a seeded PRNG with plausible
 * relationships between them (higher volatility, larger drawdowns, etc.).
 *
 * Values are produced in the units the DB stores (fractions: 0.1234 = 12.34%).
 */

export const SYNTHETIC_CODE_BASE = 9_000_000;
export const SYNTHETIC_AS_OF = "2026-10-30";

export interface SyntheticScheme {
  schemeCode: number;
  name: string;
  amc: string;
  category: string;
  subCategory: string;
  plan: "direct" | "regular";
  option: "growth" | "idcw";
  inceptionDate: string;
  officialBenchmarkName: string | null;
  terPct: number;
  aumCr: number;
  riskometer: string;
  exitLoad: string;
  managers: string;
}

export type SyntheticMetrics = Partial<Record<NumericColumnId, number | null>>;

export interface SyntheticCategoryStat {
  category: string;
  metric: NumericColumnId;
  count: number;
  cutQ1: number;
  cutQ2: number;
  cutQ3: number;
}

export interface SyntheticUniverse {
  schemes: SyntheticScheme[];
  metrics: Array<{ schemeCode: number; asOf: string; navLastDate: string; values: SyntheticMetrics }>;
  categoryStats: SyntheticCategoryStat[];
}

/** mulberry32: tiny, fast, and good enough for fixture data. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CategorySpec {
  group: string;
  name: string;
  funds: number;
  /** Mean 3Y CAGR, % */
  ret: number;
  /** Cross-sectional spread of 3Y CAGR, % */
  spread: number;
  /** Annualised volatility, % */
  vol: number;
  ter: [number, number];
  /** Median AUM, crore */
  aum: number;
  risk: string;
  /** Benchmark-relative metrics exist (equity categories with a mapped TRI). */
  benchmarked: boolean;
  benchmark: string | null;
  /** Typical volatility of an index tracker rather than an active fund. */
  passive?: boolean;
}

const CATEGORIES: readonly CategorySpec[] = [
  { group: "Equity", name: "Large Cap Fund", funds: 26, ret: 15.2, spread: 2.2, vol: 12.5, ter: [0.45, 1.0], aum: 9500, risk: "Very High", benchmarked: true, benchmark: "NIFTY 100 TRI" },
  { group: "Equity", name: "Large & Mid Cap Fund", funds: 20, ret: 18.1, spread: 2.8, vol: 14.0, ter: [0.55, 1.1], aum: 7200, risk: "Very High", benchmarked: true, benchmark: "NIFTY LargeMidcap 250 TRI" },
  { group: "Equity", name: "Mid Cap Fund", funds: 22, ret: 21.4, spread: 3.4, vol: 15.8, ter: [0.6, 1.15], aum: 6400, risk: "Very High", benchmarked: true, benchmark: "NIFTY Midcap 150 TRI" },
  { group: "Equity", name: "Small Cap Fund", funds: 18, ret: 24.0, spread: 4.5, vol: 17.5, ter: [0.6, 1.2], aum: 5200, risk: "Very High", benchmarked: true, benchmark: "NIFTY Smallcap 250 TRI" },
  { group: "Equity", name: "Flexi Cap Fund", funds: 28, ret: 17.0, spread: 2.9, vol: 13.2, ter: [0.5, 1.05], aum: 8800, risk: "Very High", benchmarked: true, benchmark: "NIFTY 500 TRI" },
  { group: "Equity", name: "Multi Cap Fund", funds: 14, ret: 18.8, spread: 3.0, vol: 14.4, ter: [0.55, 1.1], aum: 5600, risk: "Very High", benchmarked: true, benchmark: "NIFTY 500 Multicap 50:25:25 TRI" },
  { group: "Equity", name: "ELSS", funds: 20, ret: 16.8, spread: 3.0, vol: 13.6, ter: [0.5, 1.1], aum: 3900, risk: "Very High", benchmarked: true, benchmark: "NIFTY 500 TRI" },
  { group: "Equity", name: "Focused Fund", funds: 12, ret: 16.2, spread: 3.2, vol: 13.8, ter: [0.6, 1.1], aum: 3100, risk: "Very High", benchmarked: true, benchmark: "NIFTY 500 TRI" },
  { group: "Equity", name: "Value Fund", funds: 10, ret: 19.4, spread: 3.1, vol: 13.9, ter: [0.55, 1.1], aum: 4100, risk: "Very High", benchmarked: true, benchmark: "NIFTY 500 TRI" },
  { group: "Equity", name: "Sectoral/Thematic Fund", funds: 24, ret: 20.0, spread: 6.0, vol: 17.0, ter: [0.6, 1.25], aum: 2300, risk: "Very High", benchmarked: false, benchmark: null },
  { group: "Hybrid", name: "Aggressive Hybrid Fund", funds: 18, ret: 14.6, spread: 2.2, vol: 9.4, ter: [0.5, 1.05], aum: 6900, risk: "Very High", benchmarked: false, benchmark: "CRISIL Hybrid 35+65 Aggressive Index" },
  { group: "Hybrid", name: "Dynamic Asset Allocation / Balanced Advantage Fund", funds: 14, ret: 11.8, spread: 1.6, vol: 6.4, ter: [0.45, 0.95], aum: 9100, risk: "High", benchmarked: false, benchmark: "NIFTY 50 Hybrid Composite Debt 50:50 Index" },
  { group: "Hybrid", name: "Equity Savings Fund", funds: 10, ret: 9.4, spread: 1.2, vol: 4.2, ter: [0.4, 0.9], aum: 1400, risk: "Moderately High", benchmarked: false, benchmark: "NIFTY Equity Savings Index" },
  { group: "Hybrid", name: "Multi Asset Allocation Fund", funds: 10, ret: 15.4, spread: 2.6, vol: 8.4, ter: [0.5, 1.0], aum: 3800, risk: "Very High", benchmarked: false, benchmark: null },
  { group: "Debt", name: "Liquid Fund", funds: 18, ret: 6.9, spread: 0.3, vol: 0.5, ter: [0.1, 0.3], aum: 14000, risk: "Low to Moderate", benchmarked: false, benchmark: "NIFTY Liquid Index A-I" },
  { group: "Debt", name: "Short Duration Fund", funds: 14, ret: 7.4, spread: 0.6, vol: 1.1, ter: [0.2, 0.7], aum: 4400, risk: "Moderate", benchmarked: false, benchmark: "NIFTY Short Duration Debt Index A-II" },
  { group: "Debt", name: "Corporate Bond Fund", funds: 14, ret: 7.7, spread: 0.7, vol: 1.4, ter: [0.2, 0.7], aum: 6100, risk: "Moderate", benchmarked: false, benchmark: "NIFTY Corporate Bond Index A-II" },
  { group: "Debt", name: "Gilt Fund", funds: 10, ret: 7.9, spread: 1.0, vol: 2.8, ter: [0.25, 0.8], aum: 1500, risk: "Moderate", benchmarked: false, benchmark: "NIFTY All Duration G-Sec Index" },
  { group: "Other", name: "Index Funds", funds: 24, ret: 15.0, spread: 1.4, vol: 12.4, ter: [0.07, 0.6], aum: 2600, risk: "Very High", benchmarked: false, benchmark: "NIFTY 50 TRI", passive: true },
  { group: "Other", name: "FoF Domestic", funds: 8, ret: 11.0, spread: 2.4, vol: 7.0, ter: [0.1, 0.7], aum: 700, risk: "High", benchmarked: false, benchmark: null },
];

const AMCS = [
  "Kestrel Mutual Fund",
  "Northwind Asset Management",
  "Bluepeak Mutual Fund",
  "Harbor Lane Mutual Fund",
  "Sandalwood Capital Mutual Fund",
  "Orchid Row Mutual Fund",
  "Ironbridge Mutual Fund",
  "Lantern Hill Asset Management",
  "Cobalt Ridge Mutual Fund",
  "Tamarind Mutual Fund",
  "Silverleaf Mutual Fund",
  "Quillon Mutual Fund",
  "Meridian Lakeshore Infrastructure and Wealth Partners Mutual Fund",
  "Evergreen Delta Mutual Fund",
  "Pinecrest Mutual Fund",
  "Aurelian Mutual Fund",
];

const THEMES = ["", "Prime", "Select", "Opportunities", "Advantage", "Bluechip", "Core", "Pioneer", "Edge", "Growth Engine", "Emerging Leaders", "Heritage"];

const MANAGER_FIRST = ["Anika", "Rohan", "Meera", "Vikram", "Sana", "Karan", "Divya", "Imran", "Leela", "Arjun", "Tara", "Nikhil"];
const MANAGER_LAST = ["Rao", "Mehta", "Iyer", "Banerjee", "Kulkarni", "Shetty", "Menon", "Joshi", "Pillai", "Desai", "Nair", "Chopra"];

interface Generator {
  uniform: () => number;
  normal: () => number;
  between: (lo: number, hi: number) => number;
  pick: <T>(items: readonly T[]) => T;
}

function makeGenerator(seed: number): Generator {
  const uniform = createRng(seed);
  const normal = () => {
    const u = Math.max(uniform(), 1e-12);
    const v = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    uniform,
    normal,
    between: (lo, hi) => lo + (hi - lo) * uniform(),
    pick: (items) => items[Math.floor(uniform() * items.length)],
  };
}

const round = (value: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface BaseFund {
  spec: CategorySpec;
  amc: string;
  title: string;
  inception: string;
  ageYears: number;
  quality: number;
  terDirect: number;
  aum: number;
  managers: string;
  values: SyntheticMetrics;
}

function metricsFor(g: Generator, spec: CategorySpec, ageYears: number, quality: number, terDirect: number): SyntheticMetrics {
  const pct = (x: number) => round(x / 100, 4);
  const cagr3 = spec.ret + spec.spread * quality + g.normal() * spec.spread * 0.25 - (terDirect - 0.7) * 0.4;
  const vol = Math.max(0.2, spec.vol * (0.88 + 0.24 * g.uniform()) * (spec.passive ? 0.97 : 1));
  const has = (years: number) => ageYears >= years;
  const rf = 6.5;

  const sharpe = (cagr3 - rf) / vol + g.normal() * 0.08;
  const downVol = vol * g.between(0.62, 0.78);
  // Mirrors classify.ts: only mapped equity categories get benchmark-relative metrics.
  const benchmarked = spec.benchmarked;
  const alpha = benchmarked ? 3.2 * quality + g.normal() * 1.4 - (terDirect - 0.7) : null;
  const beta = benchmarked ? g.between(0.82, 1.12) : null;
  const trackingError = benchmarked ? g.between(2.2, 7.5) : null;

  const values: SyntheticMetrics = {
    cagr1y: has(1) ? pct(cagr3 + g.normal() * 9) : null,
    cagr3y: has(3) ? pct(cagr3) : null,
    cagr5y: has(5) ? pct(cagr3 - 1.4 + g.normal() * spec.spread * 0.2) : null,
    cagr10y: has(10) ? pct(cagr3 - 2.6 + g.normal() * spec.spread * 0.2) : null,
    rolling3yCagrMedian: has(4) ? pct(cagr3 * 0.93 + g.normal() * 0.7) : null,
    pctRolling3yBeatBenchmark: has(4) && spec.benchmarked ? round(Math.min(0.98, Math.max(0.02, 0.5 + 0.1 * quality + g.normal() * 0.08)), 4) : null,
    sipXirr3y: has(3) ? pct(cagr3 + 1.2 + g.normal() * 1.8) : null,
    sipXirr5y: has(5) ? pct(cagr3 - 0.4 + g.normal() * 1.4) : null,
    sharpe3y: has(3) ? round(sharpe, 4) : null,
    sortino3y: has(3) ? round(((cagr3 - rf) / downVol) * 1.0 + g.normal() * 0.1, 4) : null,
    stdDev3y: has(3) ? pct(vol) : null,
    maxDrawdown5y: has(2) ? -pct(Math.min(70, vol * g.between(1.3, 2.1) + (spec.vol > 8 ? 0 : 0.3))) : null,
    alpha3y: has(3) && alpha !== null ? pct(alpha) : null,
    beta3y: has(3) && beta !== null ? round(beta, 4) : null,
    rSquared3y: has(3) && benchmarked ? round(g.between(0.78, 0.97), 4) : null,
    trackingError3y: has(3) && trackingError !== null ? pct(trackingError) : null,
    infoRatio3y: has(3) && alpha !== null && trackingError !== null ? round(alpha / trackingError, 4) : null,
    upCapture3y: has(3) && benchmarked ? round(0.97 + 0.04 * quality + g.normal() * 0.04, 4) : null,
    downCapture3y: has(3) && benchmarked ? round(0.93 - 0.05 * quality + g.normal() * 0.05, 4) : null,
  };
  return values;
}

function shiftForVariant(values: SyntheticMetrics, terDelta: number, option: "growth" | "idcw"): SyntheticMetrics {
  const shifted: SyntheticMetrics = { ...values };
  const returnLike: NumericColumnId[] = ["cagr1y", "cagr3y", "cagr5y", "cagr10y", "rolling3yCagrMedian", "sipXirr3y", "sipXirr5y", "alpha3y"];
  const drag = terDelta / 100 + (option === "idcw" ? 0.012 : 0);
  for (const id of returnLike) {
    const v = shifted[id];
    if (v !== null && v !== undefined) shifted[id] = round(v - drag, 4);
  }
  const sharpe = shifted.sharpe3y;
  if (sharpe !== null && sharpe !== undefined) shifted.sharpe3y = round(sharpe - drag * 8, 4);
  return shifted;
}

/** Builds the whole fictional universe. Same seed, same output. */
export function generateSyntheticUniverse(seed = 20261101): SyntheticUniverse {
  const g = makeGenerator(seed);
  const schemes: SyntheticScheme[] = [];
  const metrics: SyntheticUniverse["metrics"] = [];
  let code = SYNTHETIC_CODE_BASE;

  for (const spec of CATEGORIES) {
    const usedTitles = new Set<string>();
    const funds: BaseFund[] = [];
    for (let i = 0; i < spec.funds; i++) {
      let amc = g.pick(AMCS);
      let title = "";
      // An AMC runs one fund per theme per category; retry until unique.
      for (let attempt = 0; attempt < 20; attempt++) {
        title = `${amc}|${g.pick(THEMES)}`;
        if (!usedTitles.has(title)) break;
        amc = g.pick(AMCS);
      }
      usedTitles.add(title);

      const ageYears = g.uniform() < 0.12 ? g.between(0.4, 2.8) : g.between(3.1, 21);
      const year = 2026 - Math.floor(ageYears);
      const inception = isoDate(Math.min(year, 2026), 1 + Math.floor(g.uniform() * 12), 1 + Math.floor(g.uniform() * 27));
      const quality = Math.max(-2.2, Math.min(2.2, g.normal()));
      const terDirect = round(g.between(spec.ter[0], spec.ter[1]) * (spec.passive ? 0.8 : 1), 2);
      const aum = Math.round(spec.aum * Math.exp(g.normal() * 0.85) * (0.4 + Math.min(ageYears, 12) / 12));
      const managers = `${g.pick(MANAGER_FIRST)} ${g.pick(MANAGER_LAST)}; ${g.pick(MANAGER_FIRST)} ${g.pick(MANAGER_LAST)}`;
      funds.push({
        spec,
        amc: title.split("|")[0],
        title: title.split("|")[1],
        inception,
        ageYears,
        quality,
        terDirect,
        aum,
        managers,
        values: metricsFor(g, spec, ageYears, quality, terDirect),
      });
    }

    for (const fund of funds) {
      const brand = fund.amc.replace(/ (Mutual Fund|Asset Management)$/, "");
      const base = [brand, fund.title, spec.name].filter(Boolean).join(" ");
      const variants: Array<{ plan: "direct" | "regular"; option: "growth" | "idcw" }> = [
        { plan: "direct", option: "growth" },
        { plan: "direct", option: "idcw" },
        { plan: "regular", option: "growth" },
        { plan: "regular", option: "idcw" },
      ];
      for (const variant of variants) {
        const terDelta = variant.plan === "regular" ? g.between(0.7, 1.3) : 0;
        const scheme: SyntheticScheme = {
          schemeCode: code++,
          name: `${base} - ${variant.plan === "direct" ? "Direct" : "Regular"} Plan - ${variant.option === "growth" ? "Growth" : "IDCW"}`,
          amc: fund.amc,
          category: spec.group,
          subCategory: spec.name,
          plan: variant.plan,
          option: variant.option,
          inceptionDate: fund.inception,
          officialBenchmarkName: spec.benchmark,
          terPct: round(fund.terDirect + terDelta, 2),
          aumCr: fund.aum,
          riskometer: fund.quality < -1.8 && spec.group === "Equity" ? "Very High" : spec.risk,
          exitLoad: spec.group === "Debt" ? (spec.name === "Liquid Fund" ? "Graded: 0.0070% on day 1 falling to nil from day 7" : "Nil") : "1% if redeemed within 1 year of allotment",
          managers: fund.managers,
        };
        schemes.push(scheme);
        const values = variant.plan === "direct" && variant.option === "growth" ? fund.values : shiftForVariant(fund.values, terDelta, variant.option);
        metrics.push({ schemeCode: scheme.schemeCode, asOf: SYNTHETIC_AS_OF, navLastDate: SYNTHETIC_AS_OF, values });
      }
    }
  }

  return { schemes, metrics, categoryStats: buildCategoryStats(schemes, metrics) };
}

/** Quartile cut points per (sub-category, metric) across every scheme in the category. */
export function buildCategoryStats(
  schemeList: readonly SyntheticScheme[],
  metricList: SyntheticUniverse["metrics"]
): SyntheticCategoryStat[] {
  const byCode = new Map(metricList.map((m) => [m.schemeCode, m.values]));
  const subCategories = [...new Set(schemeList.map((s) => s.subCategory))];
  const stats: SyntheticCategoryStat[] = [];
  for (const subCategory of subCategories) {
    const members = schemeList.filter((s) => s.subCategory === subCategory);
    for (const column of NUMERIC_COLUMNS) {
      if (getNumericColumn(column.id).direction === undefined) continue;
      const values = members.map((s) => (column.id === "terPct" ? s.terPct : (byCode.get(s.schemeCode)?.[column.id] ?? null)));
      const cuts = computeQuartileCutPoints(values);
      if (!cuts) continue;
      stats.push({
        category: subCategory,
        metric: column.id,
        count: values.filter((v) => v !== null).length,
        cutQ1: round(cuts.q1, 4),
        cutQ2: round(cuts.q2, 4),
        cutQ3: round(cuts.q3, 4),
      });
    }
  }
  return stats;
}
