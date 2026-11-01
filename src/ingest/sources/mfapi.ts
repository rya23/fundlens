/**
 * Client for mfapi.in, used for scheme discovery and full-history backfill
 * (see `docs/PLAN.md` "Data sources"). No auth, no documented rate limit,
 * so this client is deliberately polite: it throttles between requests and
 * retries transient failures with backoff via `../http`.
 */
import { fetchJson, type FetchRetryOptions } from "../http";

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
}

const DEFAULT_OPTIONS: Required<Pick<FetchRetryOptions, "throttleMs" | "retries" | "timeoutMs" | "backoffMs">> = {
  // mfapi.in has no documented rate limit, but it's a free community service;
  // space requests out by default rather than hammering it during a bulk backfill.
  throttleMs: 250,
  retries: 3,
  timeoutMs: 15_000,
  backoffMs: 500,
};

export class MfApiClient {
  private readonly baseUrl: string;
  private readonly fetchOptions: FetchRetryOptions;

  constructor(options: MfApiClientOptions = {}) {
    const { baseUrl = MFAPI_BASE_URL, ...fetchOptions } = options;
    this.baseUrl = baseUrl;
    this.fetchOptions = { ...DEFAULT_OPTIONS, ...fetchOptions };
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
