import { closeDb, getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { createNavStoreFromEnv } from "@/lib/nav-store";
import { runPrecompute } from "@/ingest/precompute";

const env = getEnv();
const db = getDb();
try { await runPrecompute({ db, store: createNavStoreFromEnv(env), riskFreeRate: env.RISK_FREE_RATE, log: console.log }); }
finally { await closeDb(db); }
