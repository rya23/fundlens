/**
 * Fills the local PGlite database with a fictional fund universe so the
 * screener is reviewable without running a backfill.
 *
 *   npm run seed:dev
 *
 * Uses DATABASE_URL (default `pglite:.data/db`) and refuses anything that is
 * not PGlite, so it can never write fake funds into a real Postgres. Safe to
 * re-run: it replaces its own rows (scheme codes from 9,000,000 up and the
 * category_stats rows for its categories) and leaves everything else alone.
 *
 * Stop `npm run dev` first: a PGlite directory belongs to one process at a time.
 */
import { gte, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import { closeDb, createDb } from "../src/db/client";
import { categoryStats, schemeMetrics, schemes } from "../src/db/schema";
import { SYNTHETIC_CODE_BASE, generateSyntheticUniverse } from "../src/lib/screener/synthetic";
import type * as schema from "../src/db/schema";

const BATCH = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "pglite:.data/db";
  if (!url.startsWith("pglite:")) {
    throw new Error(`seed:dev only writes to a local PGlite database (got DATABASE_URL=${url.split("@").pop()}).`);
  }

  const db = createDb(url);
  try {
    await migrate(db as PgliteDatabase<typeof schema>, { migrationsFolder: "drizzle" });

    const universe = generateSyntheticUniverse();
    const categories = [...new Set(universe.schemes.map((s) => s.subCategory))];

    // Delete our previous rows first (metrics cascade from schemes).
    await db.delete(schemes).where(gte(schemes.schemeCode, SYNTHETIC_CODE_BASE));
    await db.delete(categoryStats).where(inArray(categoryStats.category, categories));

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
        `in ${categories.length} categories into ${url}.`
    );
  } finally {
    await closeDb(db);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
