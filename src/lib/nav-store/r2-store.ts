import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type GetObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { appendResultOf, decodeNavSeries, encodeNavSeries, mergeNavPoints } from "./codec";
import {
  NAV_SERIES_VERSION,
  NavStoreError,
  type AppendResult,
  type NavPoint,
  type NavSeries,
  type NavStore,
} from "./types";

const FILE_SUFFIX = ".json.gz";
const DEFAULT_PREFIX = "nav/";
/** AMFI scheme codes are numeric, but keep this a little more permissive. */
const SAFE_SCHEME_CODE = /^[A-Za-z0-9_-]+$/;

function assertSafeSchemeCode(schemeCode: string): void {
  if (!SAFE_SCHEME_CODE.test(schemeCode)) {
    throw new NavStoreError(
      `invalid scheme code ${JSON.stringify(schemeCode)}: must match ${SAFE_SCHEME_CODE}`
    );
  }
}

function isNoSuchKey(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("name" in err)) {
    return false;
  }
  const name = (err as { name?: unknown }).name;
  return name === "NoSuchKey" || name === "NotFound";
}

export interface R2NavStoreOptions {
  client: S3Client;
  bucket: string;
  /** Key prefix for NAV objects. Defaults to `"nav/"` per docs/PLAN.md. */
  prefix?: string;
}

/**
 * Cloudflare R2-backed `NavStore`, via R2's S3-compatible API. One object
 * per scheme at `{prefix}{schemeCode}.json.gz` (default prefix `nav/`,
 * matching `FsNavStore`'s local layout).
 *
 * Op discipline (see docs/PLAN.md's R2 limits): `appendPoints` does exactly
 * one GetObject (class B, cheap) and one PutObject (class A); `listCodes` is
 * the only method that calls ListObjectsV2 and is not meant for hot paths.
 */
export class R2NavStore implements NavStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(options: R2NavStoreOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
  }

  private keyFor(schemeCode: string): string {
    assertSafeSchemeCode(schemeCode);
    return `${this.prefix}${schemeCode}${FILE_SUFFIX}`;
  }

  async getSeries(schemeCode: string): Promise<NavSeries | null> {
    const key = this.keyFor(schemeCode);
    let output: GetObjectCommandOutput;
    try {
      output = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
    } catch (err) {
      if (isNoSuchKey(err)) return null;
      throw err;
    }
    if (!output.Body) return null;
    const bytes = await output.Body.transformToByteArray();
    return decodeNavSeries(Buffer.from(bytes));
  }

  async putSeries(schemeCode: string, points: readonly NavPoint[]): Promise<void> {
    const { points: merged } = mergeNavPoints([], points);
    await this.put(schemeCode, {
      version: NAV_SERIES_VERSION,
      schemeCode,
      points: merged,
    });
  }

  async appendPoints(
    schemeCode: string,
    points: readonly NavPoint[]
  ): Promise<AppendResult> {
    const existing = await this.getSeries(schemeCode);
    const { points: merged, result } = appendResultOf(
      existing?.points ?? [],
      points
    );
    await this.put(schemeCode, {
      version: NAV_SERIES_VERSION,
      schemeCode,
      points: merged,
    });
    return result;
  }

  async getHead(schemeCode: string): Promise<NavPoint | null> {
    const series = await this.getSeries(schemeCode);
    if (!series || series.points.length === 0) return null;
    return series.points[series.points.length - 1];
  }

  async listCodes(): Promise<string[]> {
    const codes: string[] = [];
    let continuationToken: string | undefined;
    do {
      const output = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix,
          ContinuationToken: continuationToken,
        })
      );
      for (const obj of output.Contents ?? []) {
        if (!obj.Key) continue;
        const name = obj.Key.slice(this.prefix.length);
        if (name.endsWith(FILE_SUFFIX)) {
          codes.push(name.slice(0, -FILE_SUFFIX.length));
        }
      }
      continuationToken = output.IsTruncated
        ? output.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return codes;
  }

  private async put(schemeCode: string, series: NavSeries): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(schemeCode),
        Body: encodeNavSeries(series),
        ContentType: "application/json",
        ContentEncoding: "gzip",
      })
    );
  }
}
