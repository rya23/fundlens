import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
/** AMFI scheme codes are numeric, but keep this a little more permissive. */
const SAFE_SCHEME_CODE = /^[A-Za-z0-9_-]+$/;

function assertSafeSchemeCode(schemeCode: string): void {
  if (!SAFE_SCHEME_CODE.test(schemeCode)) {
    throw new NavStoreError(
      `invalid scheme code ${JSON.stringify(schemeCode)}: must match ${SAFE_SCHEME_CODE}`
    );
  }
}

/**
 * Filesystem-backed `NavStore`: one gzipped JSON file per scheme at
 * `{dir}/{schemeCode}.json.gz`, written atomically (temp file + rename) so a
 * reader never observes a partial write.
 */
export class FsNavStore implements NavStore {
  constructor(private readonly dir: string) {}

  private pathFor(schemeCode: string): string {
    assertSafeSchemeCode(schemeCode);
    return join(this.dir, `${schemeCode}${FILE_SUFFIX}`);
  }

  async getSeries(schemeCode: string): Promise<NavSeries | null> {
    const path = this.pathFor(schemeCode);
    let data: Buffer;
    try {
      data = await readFile(path);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
    return decodeNavSeries(data);
  }

  async putSeries(schemeCode: string, points: readonly NavPoint[]): Promise<void> {
    const path = this.pathFor(schemeCode);
    const { points: merged } = mergeNavPoints([], points);
    const series: NavSeries = {
      version: NAV_SERIES_VERSION,
      schemeCode,
      points: merged,
    };
    await this.writeAtomic(path, encodeNavSeries(series));
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
    const series: NavSeries = {
      version: NAV_SERIES_VERSION,
      schemeCode,
      points: merged,
    };
    await this.writeAtomic(this.pathFor(schemeCode), encodeNavSeries(series));
    return result;
  }

  async getHead(schemeCode: string): Promise<NavPoint | null> {
    const series = await this.getSeries(schemeCode);
    if (!series || series.points.length === 0) return null;
    return series.points[series.points.length - 1];
  }

  async listCodes(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
    return entries
      .filter((name) => name.endsWith(FILE_SUFFIX))
      .map((name) => name.slice(0, -FILE_SUFFIX.length));
  }

  private async writeAtomic(path: string, data: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tempPath, data);
    await rename(tempPath, path);
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
