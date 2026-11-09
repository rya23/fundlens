/**
 * Client for mfapi.in, used for scheme discovery and full-history backfill
 * (see `docs/PLAN.md` "Data sources"). No auth and no documented rate limit,
 * but it rejects bursts with HTTP 429, so this client paces every request
 * through one shared limiter and retries transient failures with backoff via
 * `../http`.
 */
import { fetchJson, RateLimiter, type FetchRetryOptions } from "../http";

export const MFAPI_BASE_URL = "https://api.mfapi.in/mf";

/** One row of the full scheme list returned by `GET /mf`. */
export interface MfApiSchemeSummary {
  schemeCode: number;
  schemeName: string;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
}

/** One NAV observation, as returned by mfapi (date is `DD-MM-YYYY`, nav is a decimal string). */
export interface MfApiNavPoint {
  date: string;
  nav: string;
}

export interface MfApiSchemeMeta {
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
  scheme_code: number;
  scheme_name: string;
  isin_growth: string | null;
  isin_div_reinvestment: string | null;
}

/** Response shape of `GET /mf/{code}`. */
export interface MfApiSchemeHistory {
  meta: MfApiSchemeMeta;
  data: MfApiNavPoint[];
  status?: string;
}

/** One row of `GET /mf/latest`: every scheme's most recent NAV in one payload. */
export interface MfApiLatestNav {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeType: string;
  schemeCategory: string;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
  nav: string;
  date: string;
}

export interface MfApiClientOptions extends FetchRetryOptions {
  baseUrl?: string;
  /**
   * Aggregate request rate across all concurrent callers of this client.
   * mfapi.in (nginx) starts answering 429 above ~10 req/s (measured
   * 2026-11-10); the default stays at half that to be a polite user of a free
   * service. A full ~8.4k-scheme backfill then takes about half an hour.
   */
  requestsPerSecond?: number;
}

const DEFAULT_OPTIONS: Required<Pick<FetchRetryOptions, "throttleMs" | "retries" | "timeoutMs" | "backoffMs">> = {
  // Pacing comes from the shared RateLimiter (see requestsPerSecond), which
  // holds across concurrent workers; a per-request sleep does not.
  throttleMs: 0,
  retries: 3,
  timeoutMs: 15_000,
  backoffMs: 500,
};

export class MfApiClient {
  private readonly baseUrl: string;
  private readonly fetchOptions: FetchRetryOptions;

  constructor(options: MfApiClientOptions = {}) {
    const { baseUrl = MFAPI_BASE_URL, requestsPerSecond = 5, ...fetchOptions } = options;
    this.baseUrl = baseUrl;
    this.fetchOptions = { ...DEFAULT_OPTIONS, rateLimiter: new RateLimiter(requestsPerSecond), ...fetchOptions };
  }

  /** `GET /mf` - the full scheme list, optionally paginated. */
  async listSchemes(params: { limit?: number; offset?: number } = {}): Promise<MfApiSchemeSummary[]> {
    const url = new URL(this.baseUrl);
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    if (params.offset !== undefined) url.searchParams.set("offset", String(params.offset));
    return fetchJson<MfApiSchemeSummary[]>(url.toString(), this.fetchOptions);
  }

  /**
   * `GET /mf/{code}` - full (or date-bounded) NAV history for one scheme.
   * mfapi doesn't return an HTTP error for an unknown code; it answers with
   * an all-empty payload (`scheme_code: 0`, no data points), so that case is
   * turned into a thrown error here instead of being handed to the caller silently.
   */
  async getSchemeHistory(
    schemeCode: number,
    params: { startDate?: string; endDate?: string } = {}
  ): Promise<MfApiSchemeHistory> {
    const url = new URL(`${this.baseUrl}/${schemeCode}`);
    if (params.startDate) url.searchParams.set("startDate", params.startDate);
    if (params.endDate) url.searchParams.set("endDate", params.endDate);

    const result = await fetchJson<MfApiSchemeHistory>(url.toString(), this.fetchOptions);
    if (result.meta.scheme_code === 0 && result.data.length === 0) {
      throw new Error(`mfapi.in returned an unknown scheme code: ${schemeCode}`);
    }
    return result;
  }

  /** `GET /mf/latest` - the latest NAV for every scheme in one (large) payload. */
  async getLatestNavs(): Promise<MfApiLatestNav[]> {
    return fetchJson<MfApiLatestNav[]>(`${this.baseUrl}/latest`, this.fetchOptions);
  }
}
