import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, createDb, type Database } from "@/db/client";
import { categoryStats, schemeMetrics, schemes } from "@/db/schema";
import { loadScreenerData } from "./data";
import { cellQuartile } from "./quartile";

let db: Database;

beforeAll(async () => {
  db = createDb("pglite:memory");
  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "drizzle" });

  const base = {
    amc: "Kestrel Mutual Fund",
    category: "Equity",
    subCategory: "Flexi Cap Fund",
    riskometer: "Very High",
    terPct: 0.5,
    aumCr: 1000,
    inceptionDate: "2020-10-30",
  };
  await db.insert(schemes).values([
    { ...base, schemeCode: 1, name: "A Direct Growth", plan: "direct", option: "growth" },
    { ...base, schemeCode: 2, name: "A Direct IDCW", plan: "direct", option: "idcw" },
    { ...base, schemeCode: 3, name: "A Regular Growth", plan: "regular", option: "growth", terPct: 1.4 },
    { ...base, schemeCode: 4, name: "No Metrics Yet", plan: "direct", option: "growth", subCategory: null },
  ]);
  await db.insert(schemeMetrics).values([
    { schemeCode: 1, asOf: "2026-10-30", cagr3y: 0.19, sharpe3y: 1.1, maxDrawdown5y: -0.21 },
    { schemeCode: 2, asOf: "2026-10-30", cagr3y: 0.17 },
    { schemeCode: 3, asOf: "2026-10-29", cagr3y: 0.18 },
  ]);
  await db.insert(categoryStats).values([
    { category: "Flexi Cap Fund", metric: "cagr3y", count: 12, cutQ1: 0.12, cutQ2: 0.15, cutQ3: 0.18, asOf: "2026-10-30" },
  ]);
});

afterAll(async () => {
  await closeDb(db);
});

describe("loadScreenerData", () => {
  it("returns Direct Growth only by default selection, left-joining schemes without metrics", async () => {
    const data = await loadScreenerData(db, { plans: ["direct"], options: ["growth"] });
    expect(data.rows.map((r) => r.code).sort()).toEqual([1, 4]);
    const noMetrics = data.rows.find((r) => r.code === 4)!;
    expect(noMetrics.cagr3y).toBeNull();
    expect(noMetrics.subCategory).toBe("Unclassified");
  });

  it("widens the universe when Regular and IDCW are requested", async () => {
    const data = await loadScreenerData(db, { plans: ["direct", "regular"], options: ["growth", "idcw"] });
    expect(data.rows).toHaveLength(4);
  });

  it("converts stored fractions to display units and derives fund age from the latest snapshot date", async () => {
    const data = await loadScreenerData(db, { plans: ["direct"], options: ["growth"] });
    const row = data.rows.find((r) => r.code === 1)!;
    expect(row).toMatchObject({ cagr3y: 19, sharpe3y: 1.1, maxDrawdown5y: -21, terPct: 0.5, aumCr: 1000, ageYears: 6 });
    expect(data.asOf).toBe("2026-10-30");
  });

  it("provides cut points in display units that colour a row consistently with its value", async () => {
    const data = await loadScreenerData(db, { plans: ["direct"], options: ["growth"] });
    expect(data.cuts["Flexi Cap Fund"]?.cagr3y).toEqual({ q1: 12, q2: 15, q3: 18, count: 12 });
    const row = data.rows.find((r) => r.code === 1)!;
    expect(cellQuartile(row, "cagr3y", data.cuts)).toBe(1);
  });
});
