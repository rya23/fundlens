/**
 * Scheme universe discovery and upsert, shared by the backfill (ticket 09)
 * and nightly (ticket 11) jobs.
 *
 * The universe comes from AMFI's NAVAll.txt (it carries AMC, SEBI category,
 * plan, option and ISINs per scheme code); if AMFI is unreachable, mfapi's
 * `/mf/latest` is used instead (same fields, coarser category text). Fund
 * metadata (TER, AUM, ...) is merged in from a `MetadataSource`, which is
 * allowed to be empty: existing metadata columns are then left untouched.
 */
import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { schemes } from "@/db/schema";
import { classifyOption, classifyPlan, normalizeCategory } from "./classify";
import { fetchText, type FetchRetryOptions } from "./http";
import { parseAmfiNavAll } from "./sources/amfi-navall";
import type { MfApiClient } from "./sources/mfapi";
import type { MetadataSource, SchemeMetadata } from "./sources/metadata";

export const AMFI_NAVALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

/** One scheme as discovered from a daily NAV source. */
export interface UniverseEntry {
  schemeCode: number;
  schemeName: string;
  amc: string;
  /** Raw SEBI category text (normalised later by `normalizeCategory`). */
  category: string;
  /** Raw AMFI plan text or null; falls back to the scheme name. */
  plan: string | null;
  option: string | null;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
  /** Latest published NAV, if the source is a daily-NAV one. */
  latestNav: number | null;
  /** ISO date of `latestNav`. */
  latestDate: string | null;
}

export type UniverseSourceName = "amfi" | "mfapi-latest";

export interface Universe {
  source: UniverseSourceName;
  entries: UniverseEntry[];
}

export interface FetchUniverseDeps {
  /** Returns the raw NAVAll.txt body. Defaults to a live fetch. */
  fetchNavAll?: () => Promise<string>;
  mfapi: Pick<MfApiClient, "getLatestNavs">;
  /** Called when AMFI fails and mfapi is used. */
  onFallback?: (error: unknown) => void;
}

const MFAPI_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

/** mfapi dates are `DD-MM-YYYY`; returns ISO or null when malformed. */
export function mfapiDateToIso(date: string): string | null {
  const match = MFAPI_DATE.exec(date.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function parseNav(text: string): number | null {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function defaultFetchNavAll(options: FetchRetryOptions = {}): () => Promise<string> {
  return () => fetchText(AMFI_NAVALL_URL, { timeoutMs: 60_000, ...options });
}

/** A scheme code can appear twice in a source file; the last row wins (a duplicate would break a bulk upsert). */
function dedupeByCode<T extends { schemeCode: number }>(rows: readonly T[]): T[] {
  return [...new Map(rows.map((r) => [r.schemeCode, r])).values()];
}

/** Fetches the scheme universe: AMFI NAVAll first, mfapi `/mf/latest` as the fallback. */
export async function fetchUniverse(deps: FetchUniverseDeps): Promise<Universe> {
  const fetchNavAll = deps.fetchNavAll ?? defaultFetchNavAll();
  try {
    const records = parseAmfiNavAll(await fetchNavAll());
    if (records.length === 0) throw new Error("AMFI NAVAll.txt parsed to zero records");
    return {
      source: "amfi",
      entries: dedupeByCode(records).map((r) => ({
        schemeCode: r.schemeCode,
        schemeName: r.schemeName,
        amc: r.amc,
        category: r.category,
        plan: r.plan,
        option: r.option,
        isinGrowth: r.isinGrowth,
        isinDivReinvestment: r.isinDivReinvestment,
        latestNav: r.nav,
        latestDate: r.date,
      })),
    };
  } catch (error) {
    deps.onFallback?.(error);
    const latest = await deps.mfapi.getLatestNavs();
    return {
      source: "mfapi-latest",
      entries: dedupeByCode(latest).map((r) => ({
        schemeCode: r.schemeCode,
        schemeName: r.schemeName,
        amc: r.fundHouse,
        category: r.schemeCategory,
        plan: null,
        option: null,
        isinGrowth: r.isinGrowth,
        isinDivReinvestment: r.isinDivReinvestment,
        latestNav: parseNav(r.nav),
        latestDate: mfapiDateToIso(r.date),
      })),
    };
  }
}

type SchemeInsert = typeof schemes.$inferInsert;

export interface SchemeRows {
  /** Rows that also carry metadata columns. */
  withMetadata: SchemeInsert[];
  /** Rows with no metadata available (existing metadata columns are preserved on upsert). */
  withoutMetadata: SchemeInsert[];
  /** Codes dropped because their option (Growth/IDCW) could not be determined. */
  skippedUnclassified: number[];
}

/**
 * Plan/option come from the AMFI fields, then the scheme name. Schemes that
 * predate the 2013 Direct/Regular split have no plan text and were Regular
 * by definition, so unknown plan maps to "regular". An unknown option has
 * no honest default, so those (closed legacy series) are skipped.
 */
export function buildSchemeRows(
  entries: readonly UniverseEntry[],
  metadata: readonly SchemeMetadata[],
  now: Date
): SchemeRows {
  const metaByCode = new Map(metadata.map((m) => [m.schemeCode, m]));
  const withMetadata: SchemeInsert[] = [];
  const withoutMetadata: SchemeInsert[] = [];
  const skippedUnclassified: number[] = [];

  for (const entry of entries) {
    let plan = entry.plan ? classifyPlan(entry.plan) : "unknown";
    if (plan === "unknown") plan = classifyPlan(entry.schemeName);
    let option = entry.option ? classifyOption(entry.option) : "unknown";
    if (option === "unknown") option = classifyOption(entry.schemeName);
    if (option === "unknown") {
      skippedUnclassified.push(entry.schemeCode);
      continue;
    }
    const normalized = normalizeCategory(entry.category);

    const base: SchemeInsert = {
      schemeCode: entry.schemeCode,
      name: entry.schemeName,
      amc: entry.amc,
      category: normalized.group,
      subCategory: normalized.subCategory,
      plan: plan === "unknown" ? "regular" : plan,
      option,
      isinGrowthOrPayout: entry.isinGrowth,
      isinReinvestment: entry.isinDivReinvestment,
    };

    const meta = metaByCode.get(entry.schemeCode);
    if (!meta) {
      withoutMetadata.push(base);
      continue;
    }
    withMetadata.push({
      ...base,
      inceptionDate: meta.allotmentDate,
      officialBenchmarkName: meta.benchmark,
      terPct: base.plan === "direct" ? meta.terDirect : meta.terRegular,
      aumCr: meta.aumCr,
      riskometer: meta.riskometer,
      exitLoad: meta.exitLoad,
      managers: meta.managers.length > 0 ? meta.managers.join("; ") : null,
      metadataUpdatedAt: now,
    });
  }
  return { withMetadata, withoutMetadata, skippedUnclassified };
}

/** Rows per INSERT: stays well under Postgres' 65535 bind-parameter limit. */
const CHUNK = 500;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const BASE_SET = {
  isinGrowthOrPayout: sql`excluded.isin_growth_or_payout`,
  isinReinvestment: sql`excluded.isin_reinvestment`,
  name: sql`excluded.name`,
  amc: sql`excluded.amc`,
  category: sql`excluded.category`,
  subCategory: sql`excluded.sub_category`,
  plan: sql`excluded.plan`,
  option: sql`excluded.option`,
};

const METADATA_SET = {
  inceptionDate: sql`coalesce(excluded.inception_date, ${schemes.inceptionDate})`,
  officialBenchmarkName: sql`coalesce(excluded.official_benchmark_name, ${schemes.officialBenchmarkName})`,
  terPct: sql`coalesce(excluded.ter_pct, ${schemes.terPct})`,
  aumCr: sql`coalesce(excluded.aum_cr, ${schemes.aumCr})`,
  riskometer: sql`coalesce(excluded.riskometer, ${schemes.riskometer})`,
  exitLoad: sql`coalesce(excluded.exit_load, ${schemes.exitLoad})`,
  managers: sql`coalesce(excluded.managers, ${schemes.managers})`,
  metadataUpdatedAt: sql`excluded.metadata_updated_at`,
};

/** Upserts scheme rows; metadata columns a source left blank never overwrite stored values. */
export async function upsertSchemes(db: Database, rows: SchemeRows): Promise<void> {
  for (const chunk of chunks(rows.withoutMetadata, CHUNK)) {
    await db.insert(schemes).values(chunk).onConflictDoUpdate({ target: schemes.schemeCode, set: BASE_SET });
  }
  for (const chunk of chunks(rows.withMetadata, CHUNK)) {
    await db
      .insert(schemes)
      .values(chunk)
      .onConflictDoUpdate({ target: schemes.schemeCode, set: { ...BASE_SET, ...METADATA_SET } });
  }
}

export interface SyncSchemesResult {
  universe: Universe;
  upserted: number;
  skippedUnclassified: number[];
  metadataRows: number;
}

/** Fetches the universe and metadata, then upserts every classifiable scheme. */
export async function syncSchemes(
  db: Database,
  deps: FetchUniverseDeps & { metadata: MetadataSource; now?: Date }
): Promise<SyncSchemesResult> {
  const universe = await fetchUniverse(deps);
  const metadata = await deps.metadata.fetchAll();
  const rows = buildSchemeRows(universe.entries, metadata, deps.now ?? new Date());
  await upsertSchemes(db, rows);
  return {
    universe,
    upserted: rows.withMetadata.length + rows.withoutMetadata.length,
    skippedUnclassified: rows.skippedUnclassified,
    metadataRows: metadata.length,
  };
}
