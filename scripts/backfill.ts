/**
 * NAV backfill CLI (`npm run backfill`). Idempotent and resumable: re-run it
 * after any interruption and it only fetches what is missing or stale.
 *
 *   npm run backfill -- [--limit N] [--codes 122639,119528] [--concurrency N]
 *
 * Reads DATABASE_URL / NAV_STORE (and R2_*) via src/lib/env.ts. Ctrl-C stops
 * after the in-flight schemes finish; progress is already persisted.
 */
import { parseArgs } from "node:util";

import { closeDb, createDb } from "../src/db/client";
import { runBackfill } from "../src/ingest/backfill";
import { MfApiClient } from "../src/ingest/sources/mfapi";
import { TigZigMetadataSource } from "../src/ingest/sources/metadata";
import { getEnv } from "../src/lib/env";
import { createNavStoreFromEnv } from "../src/lib/nav-store";

function positiveInt(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer, got "${value}"`);
  return n;
}

function parseCodes(value: string | undefined): number[] | undefined {
  if (value === undefined) return undefined;
  const codes = value.split(",").map((part) => Number(part.trim()));
  if (codes.length === 0 || codes.some((c) => !Number.isInteger(c) || c <= 0)) {
    throw new Error(`--codes must be a comma-separated list of scheme codes, got "${value}"`);
  }
  return codes;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      limit: { type: "string" },
      codes: { type: "string" },
      concurrency: { type: "string" },
    },
  });

  const env = getEnv();
  const db = createDb(env.DATABASE_URL);
  const controller = new AbortController();
  process.once("SIGINT", () => {
    console.log("\nSIGINT: finishing in-flight schemes, then stopping (re-run to resume)...");
    controller.abort();
  });

  try {
    const summary = await runBackfill({
      db,
      store: createNavStoreFromEnv(env),
      mfapi: new MfApiClient(),
      metadata: new TigZigMetadataSource(),
      limit: positiveInt("limit", values.limit),
      codes: parseCodes(values.codes),
      concurrency: positiveInt("concurrency", values.concurrency),
      signal: controller.signal,
      log: (message) => console.log(`[${new Date().toISOString()}] ${message}`),
    });
    if (summary.failed > 0) {
      console.warn(`${summary.failed} scheme(s) failed; see ingest_state.last_error. Re-run to retry them.`);
    }
  } finally {
    await closeDb(db);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
