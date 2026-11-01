/**
 * Fund metadata (TER, AUM, benchmark, riskometer, exit load, managers,
 * inception) from the unofficial TigZig mirror of AMFI data (see
 * `docs/PLAN.md` "Data sources" and `stonk.py`'s `load_details` for prior
 * art). This is third-party and unofficial, so it is wrapped behind the
 * `MetadataSource` interface and is never allowed to throw: on any failure
 * (network, decompression, or an unexpectedly-shaped CSV) `fetchAll`
 * resolves to an empty array so the rest of the screener still works with
 * blank TER/AUM rather than failing outright.
 */
import { gunzipSync } from "node:zlib";
import { parseCsv } from "../csv";
import { fetchArrayBuffer, type FetchRetryOptions } from "../http";

export const TIGZIG_METADATA_URL = "https://api.tigzig.com/mf/v1/download/scheme_details_latest.csv.gz";

export interface SchemeMetadata {
  schemeCode: number;
  /** TigZig's own plan tag for this row ("Direct" | "Regular" | "Other"), null if unrecognised. */
  schemePlan: "Direct" | "Regular" | "Other" | null;
  /** Whole-fund AUM across all plans, in Rs crore. */
  aumCr: number | null;
  terDirect: number | null;
  terRegular: number | null;
  /** ISO date the TER figures were filed as of. */
  terDate: string | null;
  benchmark: string | null;
  riskometer: string | null;
  exitLoad: string | null;
  /** ISO date of scheme allotment (used for fund age). */
  allotmentDate: string | null;
  /** Fund manager names only; "(since YYYY-MM-DD)" tenure suffixes are stripped. */
  managers: string[];
  /** TigZig's own SEBI category text. Inconsistently formatted (see `classify.ts`); kept raw. */
  sebiCategory: string | null;
}

/** Columns this parser depends on; used to fail fast and clearly if TigZig changes its export shape. */
const REQUIRED_COLUMNS = [
  "scheme_code",
  "scheme_plan",
  "ssd_sebi_category",
  "amfi_daily_fund_aum_cr_all_plans",
  "amfi_daily_benchmark",
  "amfi_daily_riskometer",
  "ssd_exit_load",
  "ssd_fund_managers",
  "ssd_allotment_date",
  "ter_date",
  "ter_regular",
  "ter_direct",
] as const;

const MANAGER_TENURE = /^(.*?)\s*\(since\s+\d{4}-\d{2}-\d{2}\)$/i;

function toNumberOrNull(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function toTextOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

function parseManagers(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const match = MANAGER_TENURE.exec(part);
      return match ? match[1].trim() : part;
    });
}

function toSchemePlan(text: string): SchemeMetadata["schemePlan"] {
  const trimmed = text.trim();
  return trimmed === "Direct" || trimmed === "Regular" || trimmed === "Other" ? trimmed : null;
}

/** Parses the decompressed TigZig scheme-details CSV into typed metadata rows. */
export function parseTigZigCsv(csvText: string): SchemeMetadata[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];

  const [header, ...dataRows] = rows;
  const columnIndex = new Map(header.map((name, i) => [name.trim(), i]));

  const missing = REQUIRED_COLUMNS.filter((name) => !columnIndex.has(name));
  if (missing.length > 0) {
    throw new Error(`TigZig CSV is missing expected columns: ${missing.join(", ")}`);
  }

  const field = (row: string[], name: (typeof REQUIRED_COLUMNS)[number]): string => {
    const index = columnIndex.get(name);
    return index === undefined ? "" : (row[index] ?? "");
  };

  const out: SchemeMetadata[] = [];
  for (const row of dataRows) {
    if (row.length <= 1 && (row[0] ?? "") === "") continue; // trailing blank row

    const schemeCode = Number(field(row, "scheme_code").trim());
    if (!Number.isInteger(schemeCode) || schemeCode <= 0) continue;

    out.push({
      schemeCode,
      schemePlan: toSchemePlan(field(row, "scheme_plan")),
      aumCr: toNumberOrNull(field(row, "amfi_daily_fund_aum_cr_all_plans")),
      terDirect: toNumberOrNull(field(row, "ter_direct")),
      terRegular: toNumberOrNull(field(row, "ter_regular")),
      terDate: toTextOrNull(field(row, "ter_date")),
      benchmark: toTextOrNull(field(row, "amfi_daily_benchmark")),
      riskometer: toTextOrNull(field(row, "amfi_daily_riskometer")),
      exitLoad: toTextOrNull(field(row, "ssd_exit_load")),
      allotmentDate: toTextOrNull(field(row, "ssd_allotment_date")),
      managers: parseManagers(field(row, "ssd_fund_managers")),
      sebiCategory: toTextOrNull(field(row, "ssd_sebi_category")),
    });
  }

  return out;
}

/** A source of per-scheme metadata. Implementations must never throw; failure means an empty result. */
export interface MetadataSource {
  fetchAll(): Promise<SchemeMetadata[]>;
}

export interface TigZigMetadataSourceOptions extends FetchRetryOptions {
  url?: string;
}

export class TigZigMetadataSource implements MetadataSource {
  private readonly url: string;
  private readonly fetchOptions: FetchRetryOptions;

  constructor(options: TigZigMetadataSourceOptions = {}) {
    const { url = TIGZIG_METADATA_URL, ...fetchOptions } = options;
    this.url = url;
    this.fetchOptions = {
      // The export is tens of MB; give it room, and don't hammer a free
      // third-party mirror with aggressive retries.
      timeoutMs: 120_000,
      retries: 2,
      backoffMs: 1_000,
      throttleMs: 0,
      ...fetchOptions,
    };
  }

  async fetchAll(): Promise<SchemeMetadata[]> {
    try {
      const compressed = await fetchArrayBuffer(this.url, this.fetchOptions);
      const csvText = gunzipSync(Buffer.from(compressed)).toString("utf-8");
      return parseTigZigCsv(csvText);
    } catch {
      return [];
    }
  }
}
