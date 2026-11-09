import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, createDb, type Database } from "@/db/client";
import { categoryStats, ingestState, schemeMetrics } from "@/db/schema";
import { FsNavStore, type NavPoint } from "@/lib/nav-store";
import { runNightly } from "./nightly";
import { runPrecompute } from "./precompute";
import type { MfApiSchemeHistory } from "./sources/mfapi";

const navAll = (rows: string[]) => [
  "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date",
  "",
  "Open Ended Schemes(Equity Scheme - Flexi Cap Fund)",
  "",
  "Alpha Mutual Fund",
  "",
  ...rows,
  "",
].join("\r\n");
const row = (code: number, nav: string, date: string) => `${code};INF00000${code};-;Alpha Fund ${code};Direct Plan;Growth;${nav};${date}`;

/** mfapi history ending 29-Oct-2026 (the day before the NAVAll date). */
function historyFor(code: number): MfApiSchemeHistory {
  const days = ["26-10-2026", "27-10-2026", "28-10-2026", "29-10-2026"];
  return {
    meta: { fund_house: "Alpha Mutual Fund", scheme_type: "Open Ended Schemes", scheme_category: "Equity Scheme - Flexi Cap Fund", scheme_code: code, scheme_name: `Alpha Fund ${code}`, isin_growth: null, isin_div_reinvestment: null },
    data: days.map((date, i) => ({ date, nav: (10 + i).toFixed(4) })).reverse(),
  };
}

class FakeMfApi {
  calls: number[] = [];
  failing = new Set<number>();
  async getSchemeHistory(code: number): Promise<MfApiSchemeHistory> {
    this.calls.push(code);
    if (this.failing.has(code)) throw new Error(`boom ${code}`);
    return historyFor(code);
  }
  async getLatestNavs(): Promise<never[]> {
    throw new Error("not used");
  }
}

/** Counts storage operations so tests can assert the nightly avoids needless reads. */
class CountingStore extends FsNavStore {
  reads = 0;
  override async getSeries(code: string) {
    this.reads++;
    return super.getSeries(code);
  }
}

let db: Database;
let dir: string;
let store: CountingStore;
const quiet = () => {};

beforeEach(async () => {
  db = createDb("pglite:memory");
  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "drizzle" });
  dir = await mkdtemp(join(tmpdir(), "nightly-"));
  store = new CountingStore(dir);
});

afterEach(async () => {
  await closeDb(db);
  await rm(dir, { recursive: true, force: true });
});

function run(mfapi: FakeMfApi, body: string, extra: Partial<Parameters<typeof runNightly>[0]> = {}) {
  return runNightly({ db, store, mfapi, metadata: { fetchAll: async () => [] }, benchmarkSources: [], fetchNavAll: async () => body, now: () => new Date("2026-10-31T00:00:00Z"), log: quiet, ...extra });
}

const dates = (points: readonly NavPoint[] | undefined) => points?.map((p) => p.date);

describe("runNightly", () => {
  it("fetches full history for schemes never stored, then skips them once current", async () => {
    const mfapi = new FakeMfApi();
    const body = navAll([row(100001, "12.5000", "30-Oct-2026"), row(100002, "20.0000", "30-Oct-2026")]);
    const first = await run(mfapi, body);
    expect(first).toMatchObject({ historiesFetched: 2, failed: 0, stoppedEarly: false });
    expect(mfapi.calls.sort()).toEqual([100001, 100002]);
    const series = await store.getSeries("100001");
    expect(dates(series?.points)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(series?.points.at(-1)).toEqual({ date: "2026-10-30", nav: 12.5 });
    const [state] = await db.select().from(ingestState).where(eq(ingestState.schemeCode, 100001));
    expect(state).toMatchObject({ lastNavDate: "2026-10-30", lastNav: 12.5, lastError: null });

    // Same NAVAll again: decided from ingest_state alone, so no mfapi calls and
    // no storage reads beyond precompute's one read per scheme.
    const again = new FakeMfApi();
    store.reads = 0;
    const second = await run(again, body);
    expect(second).toMatchObject({ historiesFetched: 0, navPointsAdded: 0 });
    expect(again.calls).toEqual([]);
    expect(store.reads).toBe(2);
  });

  it("appends a new day and applies a same-day NAV correction", async () => {
    await run(new FakeMfApi(), navAll([row(100001, "12.5000", "30-Oct-2026"), row(100002, "20.0000", "30-Oct-2026")]));
    const mfapi = new FakeMfApi();
    const summary = await run(mfapi, navAll([row(100001, "12.7500", "31-Oct-2026"), row(100002, "20.1000", "30-Oct-2026")]));
    expect(mfapi.calls).toEqual([]);
    expect(summary).toMatchObject({ navPointsAdded: 1, historiesFetched: 0, failed: 0 });
    expect((await store.getSeries("100001"))?.points.at(-1)).toEqual({ date: "2026-10-31", nav: 12.75 });
    expect((await store.getSeries("100002"))?.points.at(-1)).toEqual({ date: "2026-10-30", nav: 20.1 });
    const [state] = await db.select().from(ingestState).where(eq(ingestState.schemeCode, 100002));
    expect(state.lastNav).toBe(20.1);
  });

  it("records a failed history fetch and retries it on the next run", async () => {
    const mfapi = new FakeMfApi();
    mfapi.failing.add(100002);
    const body = navAll([row(100001, "12.5000", "30-Oct-2026"), row(100002, "20.0000", "30-Oct-2026")]);
    expect(await run(mfapi, body)).toMatchObject({ historiesFetched: 1, failed: 1 });
    expect(await store.getSeries("100002")).toBeNull();
    const [failed] = await db.select().from(ingestState).where(eq(ingestState.schemeCode, 100002));
    expect(failed).toMatchObject({ lastSuccessAt: null, lastError: "boom 100002" });

    const retry = new FakeMfApi();
    expect(await run(retry, body)).toMatchObject({ historiesFetched: 1, failed: 0 });
    expect(retry.calls).toEqual([100002]);
  });

  it("stops scheme updates at the deadline but still refreshes metrics", async () => {
    const mfapi = new FakeMfApi();
    const summary = await run(mfapi, navAll([row(100001, "12.5000", "30-Oct-2026")]), { deadline: 0 });
    expect(summary).toMatchObject({ stoppedEarly: true, historiesFetched: 0 });
    expect(mfapi.calls).toEqual([]);
    expect(summary.metrics).toMatchObject({ processed: 0 });
  });
});

describe("runPrecompute", () => {
  it("writes metrics in batches, deletes rows for schemes without NAV, and rebuilds category stats", async () => {
    await run(new FakeMfApi(), navAll([100001, 100002, 100003, 100004, 100005].map((code) => row(code, "12.5000", "30-Oct-2026"))));
    expect(await db.select({ code: schemeMetrics.schemeCode }).from(schemeMetrics)).toHaveLength(5);

    await rm(join(dir, "100003.json.gz"));
    const result = await runPrecompute({ db, store, asOf: "2026-10-31", concurrency: 3 });
    expect(result).toMatchObject({ processed: 4, failed: 0 });
    const codes = (await db.select({ code: schemeMetrics.schemeCode }).from(schemeMetrics)).map((r) => r.code).sort();
    expect(codes).toEqual([100001, 100002, 100004, 100005]);
    const [metrics] = await db.select().from(schemeMetrics).where(eq(schemeMetrics.schemeCode, 100001));
    expect(metrics).toMatchObject({ asOf: "2026-10-31", navLastDate: "2026-10-30" });
    expect(Array.isArray(await db.select().from(categoryStats))).toBe(true);
  });

  it("keeps existing metrics when a NAV read fails instead of aborting the run", async () => {
    await run(new FakeMfApi(), navAll([row(100001, "12.5000", "30-Oct-2026"), row(100002, "20.0000", "30-Oct-2026")]));
    const flaky = new FsNavStore(dir);
    const original = flaky.getSeries.bind(flaky);
    flaky.getSeries = async (code) => {
      if (code === "100002") throw new Error("storage timeout");
      return original(code);
    };
    const result = await runPrecompute({ db, store: flaky, asOf: "2026-10-31" });
    expect(result).toMatchObject({ processed: 1, failed: 1 });
    expect(await db.select().from(schemeMetrics).where(eq(schemeMetrics.schemeCode, 100002))).toHaveLength(1);
  });
});
