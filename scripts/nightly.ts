import { closeDb, getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { createNavStoreFromEnv } from "@/lib/nav-store";
import { runNightly } from "@/ingest/nightly";
import { IndexFundProxySource } from "@/ingest/benchmarks";
import { MfApiClient } from "@/ingest/sources/mfapi";
import { TigZigMetadataSource } from "@/ingest/sources/metadata";

const env = getEnv();
const db = getDb();
const mfapi = new MfApiClient();
try {
  const summary = await runNightly({ db, store: createNavStoreFromEnv(env), mfapi, metadata: new TigZigMetadataSource(), benchmarkSources: [new IndexFundProxySource(mfapi)], riskFreeRate: env.RISK_FREE_RATE, log: console.log });
  if (summary.failed || summary.benchmarks.some((result) => result.status === "failed")) process.exitCode = 1;
} finally { await closeDb(db); }
