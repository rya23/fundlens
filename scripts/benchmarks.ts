/**
 * Refreshes benchmark history (`npm run benchmarks`). Incremental and safe to
 * re-run. See docs/benchmarks.md.
 */
import { closeDb, createDb } from "../src/db/client";
import { IndexFundProxySource, ingestBenchmarks } from "../src/ingest/benchmarks";
import { MfApiClient } from "../src/ingest/sources/mfapi";
import { getEnv } from "../src/lib/env";

async function main(): Promise<void> {
  const db = createDb(getEnv().DATABASE_URL);
  try {
    const results = await ingestBenchmarks({
      db,
      sources: [new IndexFundProxySource(new MfApiClient())],
      log: (message) => console.log(message),
    });
    if (results.some((r) => r.status === "failed")) process.exitCode = 1;
  } finally {
    await closeDb(db);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
