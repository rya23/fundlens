import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgresJs, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mkdirSync } from "node:fs";
import postgres, { type Sql } from "postgres";

import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * The app talks to Postgres through this one type regardless of driver, so
 * query code (screener, ingestion, etc.) never branches on `DATABASE_URL`.
 * PGlite *is* Postgres (compiled to WASM), so the same Drizzle schema and
 * SQL migrations apply unchanged to both. `$client` (the raw driver handle)
 * is included explicitly - `drizzle()` adds it at the value level, but it's
 * only reflected in the inferred return type, not in the `*Database` type
 * exported by drizzle-orm, so a `Database`-typed variable needs it spelled
 * out here to call `closeDb`.
 */
export type Database =
  | (PostgresJsDatabase<typeof schema> & { $client: Sql })
  | (PgliteDatabase<typeof schema> & { $client: PGlite });

const PGLITE_PREFIX = "pglite:";
const PGLITE_MEMORY = "memory";

/**
 * Builds a `Database` for a given `DATABASE_URL`-shaped connection string.
 * Pure factory (no caching, no env access) so it's easy to point at a
 * throwaway in-memory store in tests - see `getDb` for the cached,
 * env-driven entry point used by the rest of the app.
 *
 *   createDb("pglite:memory")       in-memory PGlite, used by tests
 *   createDb("pglite:.data/db")     PGlite persisted to a local directory
 *   createDb("postgres://...")      postgres-js, e.g. Supabase
 */
export function createDb(databaseUrl: string): Database {
  if (databaseUrl.startsWith(PGLITE_PREFIX)) {
    const target = databaseUrl.slice(PGLITE_PREFIX.length);
    if (target !== PGLITE_MEMORY) {
      // PGlite's node filesystem backend only creates the leaf directory,
      // not missing parents (e.g. a fresh checkout with no `.data/` yet) -
      // create the whole path up front so `pglite:.data/db` works out of
      // the box, matching what `.env.example` documents.
      mkdirSync(target, { recursive: true });
    }
    const client = new PGlite(target === PGLITE_MEMORY ? undefined : target);
    return drizzlePglite(client, { schema });
  }

  // `prepare: false` because Supabase's connection pooler (pgbouncer, in
  // transaction mode) doesn't support prepared statements.
  const client = postgres(databaseUrl, { prepare: false });
  return drizzlePostgresJs(client, { schema });
}

/** Closes the underlying connection/engine. Safe to call on either driver. */
export async function closeDb(db: Database): Promise<void> {
  const client = db.$client;
  if (typeof (client as { end?: unknown }).end === "function") {
    await (client as { end: (opts?: { timeout?: number }) => Promise<void> }).end({ timeout: 1 });
    return;
  }
  if (typeof (client as { close?: unknown }).close === "function") {
    await (client as { close: () => Promise<void> }).close();
  }
}

let cached: Database | undefined;

/** Lazily builds and caches a `Database` from `DATABASE_URL`. */
export function getDb(): Database {
  if (!cached) {
    cached = createDb(getEnv().DATABASE_URL);
  }
  return cached;
}
