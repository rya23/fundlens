import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, createDb, type Database } from "./client";
import { benchmarkNav, benchmarks, categoryStats, ingestState, schemeMetrics, schemes } from "./schema";

// One in-memory PGlite instance, migrated from the real generated SQL in
// `drizzle/`, shared by every test below - this exercises the actual
// migration files, not just the Drizzle schema objects.
let db: Database;

beforeEach(async () => {
  db = createDb("pglite:memory");
  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "drizzle" });
});

afterEach(async () => {
  await closeDb(db);
});

describe("schemes", () => {
  it("inserts and reads back a row", async () => {
    await db.insert(schemes).values({
      schemeCode: 120503,
      name: "Example Flexi Cap Fund - Direct Growth",
      amc: "Example Mutual Fund",
      category: "Equity",
      subCategory: "Flexi Cap Fund",
      plan: "direct",
      option: "growth",
      inceptionDate: "2013-01-07",
      terPct: 0.45,
      aumCr: 12345.67,
      riskometer: "Very High",
    });

    const [row] = await db.select().from(schemes).where(eq(schemes.schemeCode, 120503));

    expect(row).toMatchObject({
      schemeCode: 120503,
      name: "Example Flexi Cap Fund - Direct Growth",
      amc: "Example Mutual Fund",
      category: "Equity",
      subCategory: "Flexi Cap Fund",
      plan: "direct",
      option: "growth",
      inceptionDate: "2013-01-07",
      terPct: 0.45,
      aumCr: 12345.67,
      riskometer: "Very High",
    });
  });
});

describe("benchmarks and benchmarkNav", () => {
  it("inserts and reads back a benchmark and a NAV point for it", async () => {
    await db.insert(benchmarks).values({
      id: "nifty500-tri",
      name: "Nifty 500 TRI",
      kind: "tri",
      source: "niftyindices.com",
    });

    await db.insert(benchmarkNav).values({
      benchmarkId: "nifty500-tri",
      date: "2026-03-14",
      value: 25483.456789,
    });

    const [benchmark] = await db.select().from(benchmarks).where(eq(benchmarks.id, "nifty500-tri"));
    const [navPoint] = await db.select().from(benchmarkNav).where(eq(benchmarkNav.benchmarkId, "nifty500-tri"));

    expect(benchmark).toMatchObject({
      id: "nifty500-tri",
      name: "Nifty 500 TRI",
      kind: "tri",
      source: "niftyindices.com",
    });
    expect(navPoint).toMatchObject({
      benchmarkId: "nifty500-tri",
      date: "2026-03-14",
      value: 25483.456789,
    });
  });
});

describe("schemeMetrics", () => {
  it("inserts and reads back a computed-metrics row for a scheme", async () => {
    await db.insert(schemes).values({
      schemeCode: 120503,
      name: "Example Flexi Cap Fund - Direct Growth",
      amc: "Example Mutual Fund",
      category: "Equity",
      plan: "direct",
      option: "growth",
    });

    await db.insert(schemeMetrics).values({
      schemeCode: 120503,
      asOf: "2026-10-31",
      navLastDate: "2026-10-31",
      cagr1y: 18.234,
      cagr3y: 15.1,
      cagr5y: 14.75,
      cagr10y: null,
      rolling3yCagrMedian: 13.5,
      pctRolling3yBeatBenchmark: 62.5,
      sharpe3y: 0.95,
      sortino3y: 1.4,
      alpha3y: 2.3,
      beta3y: 0.98,
      rSquared3y: 0.92,
      stdDev3y: 14.2,
      trackingError3y: 3.1,
      infoRatio3y: 0.6,
      maxDrawdown5y: -23.4,
      upCapture3y: 101.2,
      downCapture3y: 94.5,
      sipXirr3y: 16.8,
      sipXirr5y: 15.9,
    });

    const [row] = await db
      .select()
      .from(schemeMetrics)
      .where(eq(schemeMetrics.schemeCode, 120503));

    expect(row).toMatchObject({
      schemeCode: 120503,
      asOf: "2026-10-31",
      navLastDate: "2026-10-31",
      cagr1y: 18.234,
      cagr3y: 15.1,
      cagr5y: 14.75,
      cagr10y: null,
      rolling3yCagrMedian: 13.5,
      pctRolling3yBeatBenchmark: 62.5,
      sharpe3y: 0.95,
      sortino3y: 1.4,
      alpha3y: 2.3,
      beta3y: 0.98,
      rSquared3y: 0.92,
      stdDev3y: 14.2,
      trackingError3y: 3.1,
      infoRatio3y: 0.6,
      maxDrawdown5y: -23.4,
      upCapture3y: 101.2,
      downCapture3y: 94.5,
      sipXirr3y: 16.8,
      sipXirr5y: 15.9,
    });
  });
});

describe("categoryStats", () => {
  it("inserts and reads back quartile cut points for a category/metric pair", async () => {
    await db.insert(categoryStats).values({
      category: "Flexi Cap Fund",
      metric: "cagr3y",
      count: 42,
      cutQ1: 10.2,
      cutQ2: 13.5,
      cutQ3: 16.8,
      asOf: "2026-10-31",
    });

    const [row] = await db
      .select()
      .from(categoryStats)
      .where(and(eq(categoryStats.category, "Flexi Cap Fund"), eq(categoryStats.metric, "cagr3y")));

    expect(row).toMatchObject({
      category: "Flexi Cap Fund",
      metric: "cagr3y",
      count: 42,
      cutQ1: 10.2,
      cutQ2: 13.5,
      cutQ3: 16.8,
      asOf: "2026-10-31",
    });
  });
});

describe("ingestState", () => {
  it("inserts and reads back the per-scheme ingest bookkeeping row", async () => {
    await db.insert(schemes).values({
      schemeCode: 120503,
      name: "Example Flexi Cap Fund - Direct Growth",
      amc: "Example Mutual Fund",
      category: "Equity",
      plan: "direct",
      option: "growth",
    });

    const lastAttemptAt = new Date("2026-10-31T21:00:00.000Z");

    await db.insert(ingestState).values({
      schemeCode: 120503,
      lastNavDate: "2026-10-31",
      lastAttemptAt,
      lastSuccessAt: lastAttemptAt,
      lastError: null,
    });

    const [row] = await db.select().from(ingestState).where(eq(ingestState.schemeCode, 120503));

    expect(row).toMatchObject({
      schemeCode: 120503,
      lastNavDate: "2026-10-31",
      lastError: null,
    });
    expect(row?.lastAttemptAt).toEqual(lastAttemptAt);
    expect(row?.lastSuccessAt).toEqual(lastAttemptAt);
  });
});
