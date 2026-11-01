/**
 * Fills the local PGlite database with a fictional fund universe so the
 * screener is reviewable without running a backfill.
 *
 *   npm run seed:dev
 *
 * Uses DATABASE_URL (default `pglite:.data/db`) and refuses anything that is
 * not PGlite, so it can never write fake funds into a real Postgres. Safe to
 * re-run: it replaces its own rows (scheme codes from 9,000,000 up, prefixed
 * synthetic benchmarks, and category_stats for its categories). It refuses a
 * database containing real schemes or benchmark rows.
 *
 * Stop `npm run dev` first: a PGlite directory belongs to one process at a time.
 */
import { gte, inArray, lt, ne } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import { closeDb, createDb } from "../src/db/client";
import { benchmarks, benchmarkNav, categoryStats, schemeMetrics, schemes } from "../src/db/schema";
import { FsNavStore } from "../src/lib/nav-store";
import { SYNTHETIC_CODE_BASE, generateSyntheticUniverse } from "../src/lib/screener/synthetic";
import { syntheticBenchmarkNav, syntheticNavForScheme } from "../src/lib/screener/synthetic-nav";
import type * as schema from "../src/db/schema";

const BATCH = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "pglite:.data/db";
  const navStoreConfig = process.env.NAV_STORE ?? "fs:.data/nav";
  if (!navStoreConfig.startsWith("fs:") || navStoreConfig.length === 3) {
    throw new Error(`seed:dev only writes synthetic NAV to a filesystem store (got NAV_STORE=${navStoreConfig}).`);
  }
  const store = new FsNavStore(navStoreConfig.slice(3));
  if (!url.startsWith("pglite:")) {
    throw new Error(`seed:dev only writes to a local PGlite database (got DATABASE_URL=${url.split("@").pop()}).`);
  }

  const db = createDb(url);
  try {
    await migrate(db as PgliteDatabase<typeof schema>, { migrationsFolder: "drizzle" });

    const [realScheme] = await db.select({ schemeCode: schemes.schemeCode }).from(schemes).where(lt(schemes.schemeCode, SYNTHETIC_CODE_BASE)).limit(1);
    const [realBenchmark] = await db.select({ id: benchmarks.id }).from(benchmarks).where(ne(benchmarks.source, "synthetic:seed-dev")).limit(1);
    if (realScheme || realBenchmark) {
      throw new Error("seed:dev requires a fresh local database without real schemes or benchmarks; choose a separate DATABASE_URL.");
    }

    const universe = generateSyntheticUniverse();
    const categories = [...new Set(universe.schemes.map((s) => s.subCategory))];
    const metricsByCode = new Map(universe.metrics.map((m) => [m.schemeCode, m.values]));
    for (const scheme of universe.schemes) {
      await store.putSeries(String(scheme.schemeCode), syntheticNavForScheme(scheme, metricsByCode.get(scheme.schemeCode) ?? {}, universe.metrics[0].asOf));
    }
    const benchmarkSeries = syntheticBenchmarkNav(universe.metrics[0].asOf);
    const benchmarkIds = benchmarkSeries.map((benchmark) => benchmark.id);

    // Delete our previous rows first (metrics cascade from schemes).
    await db.delete(schemes).where(gte(schemes.schemeCode, SYNTHETIC_CODE_BASE));
    await db.delete(categoryStats).where(inArray(categoryStats.category, categories));
    await db.delete(benchmarks).where(inArray(benchmarks.id, benchmarkIds));

    for (const rows of chunk(benchmarkSeries, BATCH)) {
      await db.insert(benchmarks).values(rows.map((b) => ({ id: b.id, name: b.name, kind: "tri" as const, source: "synthetic:seed-dev" })));
    }
    for (const benchmark of benchmarkSeries) {
      for (const rows of chunk(benchmark.points, BATCH)) {
        await db.insert(benchmarkNav).values(rows.map((point) => ({ benchmarkId: benchmark.id, date: point.date, value: point.nav })));
      }
    }

    for (const rows of chunk(universe.schemes, BATCH)) {
      await db.insert(schemes).values(rows.map((s) => ({ ...s, metadataUpdatedAt: new Date() })));
    }
    for (const rows of chunk(universe.metrics, BATCH)) {
      await db.insert(schemeMetrics).values(
        rows.map((m) => ({ schemeCode: m.schemeCode, asOf: m.asOf, navLastDate: m.navLastDate, ...m.values }))
      );
    }
    for (const rows of chunk(universe.categoryStats, BATCH)) {
      await db.insert(categoryStats).values(rows.map((r) => ({ ...r, asOf: universe.metrics[0].asOf })));
    }

    console.log(
      `Seeded ${universe.schemes.length} schemes (${universe.schemes.filter((s) => s.plan === "direct" && s.option === "growth").length} Direct Growth) ` +
        `in ${categories.length} categories into ${url}; seeded NAV in ${navStoreConfig}.`
    );
  } finally {
    await closeDb(db);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
