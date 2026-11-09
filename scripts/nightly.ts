/**
 * Nightly refresh CLI (`npm run nightly -- [--max-minutes N] [--concurrency N]`).
 * --max-minutes bounds the per-scheme NAV update phase so benchmarks and
 * precompute still run inside the CI job limit; the next run resumes.
 */
import { parseArgs } from "node:util";

import { closeDb, getDb } from "@/db/client";
import { deadlineFromMinutes } from "@/ingest/pool";
import { getEnv } from "@/lib/env";
import { createNavStoreFromEnv } from "@/lib/nav-store";
import { runNightly } from "@/ingest/nightly";
import { IndexFundProxySource } from "@/ingest/benchmarks";
import { MfApiClient } from "@/ingest/sources/mfapi";
import { TigZigMetadataSource } from "@/ingest/sources/metadata";

const { values } = parseArgs({ options: { "max-minutes": { type: "string" }, concurrency: { type: "string" } } });
function positiveInt(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer, got "${value}"`);
  return n;
}

const env = getEnv();
const db = getDb();
const mfapi = new MfApiClient();
try {
  const summary = await runNightly({ db, store: createNavStoreFromEnv(env), mfapi, metadata: new TigZigMetadataSource(), benchmarkSources: [new IndexFundProxySource(mfapi)], riskFreeRate: env.RISK_FREE_RATE, log: console.log, concurrency: positiveInt("concurrency", values.concurrency), deadline: deadlineFromMinutes(positiveInt("max-minutes", values["max-minutes"])) });
  if (summary.failed || summary.benchmarks.some((result) => result.status === "failed")) process.exitCode = 1;
} finally { await closeDb(db); }
