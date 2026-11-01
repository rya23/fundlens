import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, createDb, type Database } from "@/db/client";
import { benchmarkNav, benchmarks } from "@/db/schema";
import {
  benchmarkId,
  IndexFundProxySource,
  ingestBenchmarks,
  listBenchmarkDefinitions,
  type BenchmarkDefinition,
  type BenchmarkSource,
} from "./benchmarks";
import { listBenchmarkMappings } from "./classify";
import type { MfApiSchemeHistory } from "./sources/mfapi";

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/mfapi-scheme-history.json", import.meta.url), "utf-8")
) as MfApiSchemeHistory;

const NIFTY500: BenchmarkDefinition = { id: "nifty-500-tri", name: "NIFTY 500 TRI", fallbackSchemeCode: 153161 };

function mfapiReturning(history: MfApiSchemeHistory) {
  const calls: number[] = [];
  return {
    calls,
    client: {
      async getSchemeHistory(code: number) {
        calls.push(code);
        return history;
      },
    },
  };
}

describe("benchmark definitions", () => {
  it("has one definition per distinct index in the category map, with a proxy fund", () => {
    const defs = listBenchmarkDefinitions();
    expect(defs.map((d) => d.name).sort()).toEqual([
      "NIFTY 100 TRI",
      "NIFTY 500 TRI",
      "NIFTY LARGEMIDCAP 250 TRI",
      "NIFTY MIDCAP 150 TRI",
      "NIFTY SMALLCAP 250 TRI",
    ]);
    expect(defs.every((d) => d.fallbackSchemeCode > 0)).toBe(true);
    expect(listBenchmarkMappings().length).toBeGreaterThan(defs.length);
  });

  it("derives a stable slug id from the index name", () => {
    expect(benchmarkId("NIFTY LARGEMIDCAP 250 TRI")).toBe("nifty-largemidcap-250-tri");
    expect(benchmarkId("NIFTY 500 TRI")).toBe("nifty-500-tri");
  });
});

describe("IndexFundProxySource", () => {
  it("turns mfapi history into ascending ISO-dated points and names the fund as source", async () => {
    const { client, calls } = mfapiReturning(fixture);
    const result = await new IndexFundProxySource(client).fetchHistory(NIFTY500);

    expect(calls).toEqual([153161]);
    expect(result?.source).toBe("mfapi:153161");
    expect(result?.points).toHaveLength(12);
    expect(result?.points[0]).toEqual({ date: "2013-05-28", value: 9.9992 });
    expect(result?.points.at(-1)).toEqual({ date: "2026-10-30", value: 89.2332 });
    const dates = result?.points.map((p) => p.date) ?? [];
    expect(dates).toEqual([...dates].sort());
  });
});

describe("ingestBenchmarks", () => {
  let db: Database;

  beforeEach(async () => {
    db = createDb("pglite:memory");
    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "drizzle" });
  });
  afterEach(async () => {
    await closeDb(db);
  });

  const quiet = () => {};

  it("stores proxy NAVs as an index_fund_proxy benchmark", async () => {
    const { client } = mfapiReturning(fixture);
    const results = await ingestBenchmarks({ db, sources: [new IndexFundProxySource(client)], definitions: [NIFTY500], log: quiet });

    expect(results).toEqual([expect.objectContaining({ id: "nifty-500-tri", status: "updated", added: 12 })]);
    const [row] = await db.select().from(benchmarks).where(eq(benchmarks.id, "nifty-500-tri"));
    expect(row).toMatchObject({ name: "NIFTY 500 TRI", kind: "index_fund_proxy", source: "mfapi:153161" });
    const points = await db.select().from(benchmarkNav).where(eq(benchmarkNav.benchmarkId, "nifty-500-tri"));
    expect(points).toHaveLength(12);
    expect(points.find((p) => p.date === "2026-10-30")?.value).toBe(89.2332);
  });

  it("is incremental: a second run only adds dates newer than the stored ones", async () => {
    const older: MfApiSchemeHistory = { ...fixture, data: fixture.data.slice(2) };
    await ingestBenchmarks({ db, sources: [new IndexFundProxySource(mfapiReturning(older).client)], definitions: [NIFTY500], log: quiet });

    const [again] = await ingestBenchmarks({ db, sources: [new IndexFundProxySource(mfapiReturning(fixture).client)], definitions: [NIFTY500], log: quiet });
    expect(again).toMatchObject({ status: "updated", added: 2 });

    const [third] = await ingestBenchmarks({ db, sources: [new IndexFundProxySource(mfapiReturning(fixture).client)], definitions: [NIFTY500], log: quiet });
    expect(third).toMatchObject({ status: "unchanged", added: 0 });
    expect(await db.select().from(benchmarkNav)).toHaveLength(12);
  });

  it("falls back to the next source when a higher-priority source fails", async () => {
    const failingTri: BenchmarkSource = {
      kind: "tri",
      async fetchHistory() {
        throw new Error("tri endpoint down");
      },
    };
    const { client } = mfapiReturning(fixture);
    const [result] = await ingestBenchmarks({
      db,
      sources: [failingTri, new IndexFundProxySource(client)],
      definitions: [NIFTY500],
      log: quiet,
    });
    expect(result).toMatchObject({ status: "updated", kind: "index_fund_proxy" });
  });

  it("reports a failure and keeps stored data when every source fails", async () => {
    await ingestBenchmarks({ db, sources: [new IndexFundProxySource(mfapiReturning(fixture).client)], definitions: [NIFTY500], log: quiet });
    const broken: BenchmarkSource = {
      kind: "index_fund_proxy",
      async fetchHistory() {
        throw new Error("mfapi down");
      },
    };
    const [result] = await ingestBenchmarks({ db, sources: [broken], definitions: [NIFTY500], log: quiet });
    expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("mfapi down") });
    expect(await db.select().from(benchmarkNav)).toHaveLength(12);
  });

  it("replaces a proxy history when a TRI source becomes available, never the reverse", async () => {
    await ingestBenchmarks({ db, sources: [new IndexFundProxySource(mfapiReturning(fixture).client)], definitions: [NIFTY500], log: quiet });

    const tri: BenchmarkSource = {
      kind: "tri",
      async fetchHistory() {
        return {
          source: "test-tri",
          points: [
            { date: "2026-10-29", value: 30000 },
            { date: "2026-10-30", value: 30100 },
          ],
        };
      },
    };
    const [upgraded] = await ingestBenchmarks({ db, sources: [tri], definitions: [NIFTY500], log: quiet });
    expect(upgraded).toMatchObject({ status: "updated", kind: "tri" });
    expect(await db.select().from(benchmarkNav)).toHaveLength(2);
    const [row] = await db.select().from(benchmarks);
    expect(row).toMatchObject({ kind: "tri", source: "test-tri" });

    const [kept] = await ingestBenchmarks({ db, sources: [new IndexFundProxySource(mfapiReturning(fixture).client)], definitions: [NIFTY500], log: quiet });
    expect(kept).toMatchObject({ status: "unchanged", kind: "tri" });
    expect(await db.select().from(benchmarkNav)).toHaveLength(2);
  });
});
