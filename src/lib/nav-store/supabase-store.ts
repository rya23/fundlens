import { createClient } from "@supabase/supabase-js";
import { appendResultOf, decodeNavSeries, encodeNavSeries, mergeNavPoints } from "./codec";
import { NAV_SERIES_VERSION, NavStoreError, type AppendResult, type NavPoint, type NavSeries, type NavStore } from "./types";

const SUFFIX = ".json.gz";
const SAFE_CODE = /^[A-Za-z0-9_-]+$/;

/** Private bucket; same nav/{code}.json.gz format as local storage and R2. */
export class SupabaseNavStore implements NavStore {
  private readonly bucket;

  constructor(url: string, secretKey: string, bucket = "fund-nav") {
    const client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, {
          ...init,
          cache: "no-store",
          signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
        }),
      },
    });
    this.bucket = client.storage.from(bucket);
  }

  private path(code: string): string {
    if (!SAFE_CODE.test(code)) throw new NavStoreError("Invalid NAV scheme code");
    return `nav/${code}${SUFFIX}`;
  }

  async getSeries(code: string): Promise<NavSeries | null> {
    const { data, error } = await this.bucket.download(this.path(code));
    if (error) {
      // Older Storage versions return only a message for a missing object.
      if (("code" in error && error.code === "NoSuchKey") || error.message === "Object not found") return null;
      throw error;
    }
    return decodeNavSeries(Buffer.from(await data.arrayBuffer()));
  }

  async putSeries(code: string, points: readonly NavPoint[]): Promise<void> {
    this.path(code);
    const merged = mergeNavPoints([], points);
    await this.put(code, merged.points);
  }

  async appendPoints(code: string, points: readonly NavPoint[]): Promise<AppendResult> {
    const existing = await this.getSeries(code);
    const merged = appendResultOf(existing?.points ?? [], points);
    await this.put(code, merged.points);
    return merged.result;
  }

  async getHead(code: string): Promise<NavPoint | null> {
    return (await this.getSeries(code))?.points.at(-1) ?? null;
  }

  async listCodes(): Promise<string[]> {
    const codes: string[] = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const { data, error } = await this.bucket.list("nav", { limit, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      for (const file of data) {
        const code = file.name.slice(0, -SUFFIX.length);
        if (file.id && file.name.endsWith(SUFFIX) && SAFE_CODE.test(code)) codes.push(code);
      }
      if (data.length < limit) return codes;
    }
  }

  private async put(code: string, points: readonly NavPoint[]): Promise<void> {
    const bytes = encodeNavSeries({ version: NAV_SERIES_VERSION, schemeCode: code, points });
    const { error } = await this.bucket.upload(this.path(code), bytes, {
      // Store gzip as a file, without HTTP Content-Encoding auto-decompression.
      contentType: "application/gzip", cacheControl: "0", upsert: true,
    });
    if (error) throw error;
  }
}
