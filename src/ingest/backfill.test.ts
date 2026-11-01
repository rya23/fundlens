import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, createDb, type Database } from "@/db/client";
import { ingestState, schemes } from "@/db/schema";
import { FsNavStore } from "@/lib/nav-store";
import { runBackfill } from "./backfill";
import type { MfApiSchemeHistory } from "./sources/mfapi";
import type { MetadataSource } from "./sources/metadata";

const NAVALL = [
  "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date",
  "",
  "Open Ended Schemes(Equity Scheme - Flexi Cap Fund)",
  "",
  "Alpha Mutual Fund",
  "",
  "100001;INF000000001;-;Alpha Flexi Cap Fund;Direct Plan;Growth;12.5000;30-Oct-2026",
  "100002;-;INF000000002;Alpha Flexi Cap Fund;Direct Plan;IDCW;11.5000;30-Oct-2026",
  "100003;INF000000003;-;Alpha Flexi Cap Fund;Regular Plan;Growth;11.0000;30-Oct-2026",
  "100004;INF000000004;-;Alpha Flexi Cap Fund Series 4;Direct Plan;Growth;10.0000;30-Oct-2026",
  "100005;INF000000005;-;Alpha Flexi Cap Fund Series 5;Direct Plan;Growth;10.0000;30-Oct-2026",
  "",
].join("\r\n");

const noMetadata: MetadataSource = { fetchAll: async () => [] };

/** Five rows ending 2026-10-30, in mfapi's DD-MM-YYYY / string-nav shape. */
function historyFor(code: number): MfApiSchemeHistory {
  const days = ["26-10-2026", "27-10-2026", "28-10-2026", "29-10-2026", "30-10-2026"];
  return {
    meta: {
      fund_house: "Alpha Mutual Fund",
      scheme_type: "Open Ended Schemes",
      scheme_category: "Equity Scheme - Flexi Cap Fund",
      scheme_code: code,
      scheme_name: `Scheme ${code}`,
      isin_growth: null,
      isin_div_reinvestment: null,
    },
    data: days.map((date, i) => ({ date, nav: (10 + i).toFixed(4) })).reverse(),
  };
}

class FakeMfApi {
  calls: number[] = [];
  failing = new Set<number>();
  onCall?: (code: number) => void;

  async getSchemeHistory(code: number): Promise<MfApiSchemeHistory> {
    this.calls.push(code);
    this.onCall?.(code);
    if (this.failing.has(code)) throw new Error(`boom ${code}`);
    return historyFor(code);
  }
  async getLatestNavs(): Promise<never[]> {
    throw new Error("not used");
  }
}

let db: Database;
let dir: string;
let store: FsNavStore;
const quiet = () => {};

beforeEach(async () => {
  db = createDb("pglite:memory");
  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "drizzle" });
  dir = await mkdtemp(join(tmpdir(), "backfill-"));
  store = new FsNavStore(dir);
});

afterEach(async () => {
  await closeDb(db);
  await rm(dir, { recursive: true, force: true });
});

function deps(mfapi: FakeMfApi, extra: Partial<Parameters<typeof runBackfill>[0]> = {}) {
  return { db, store, mfapi, metadata: noMetadata, fetchNavAll: async () => NAVALL, log: quiet, ...extra };
}

describe("runBackfill", () => {
  it("upserts schemes and stores the full history of every plan and option", async () => {
    const mfapi = new FakeMfApi();
    const summary = await runBackfill(deps(mfapi, { concurrency: 2 }));

    expect(summary).toMatchObject({ total: 5, succeeded: 5, failed: 0, skippedUpToDate: 0, aborted: false });
    expect(await db.select().from(schemes)).toHaveLength(5);
    const idcw = await db.select().from(schemes).where(eq(schemes.schemeCode, 100002));
    expect(idcw[0]).toMatchObject({ plan: "direct", option: "idcw", subCategory: "Flexi Cap Fund" });

    const series = await store.getSeries("100001");
    expect(series?.points.map((p) => p.date)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(series?.points[4]).toEqual({ date: "2026-10-30", nav: 14 });

    const [state] = await db.select().from(ingestState).where(eq(ingestState.schemeCode, 100001));
    expect(state).toMatchObject({ lastNavDate: "2026-10-30", lastError: null });
    expect(state.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("resumes after an interrupt without redoing finished schemes", async () => {
    const first = new FakeMfApi();
    const controller = new AbortController();
    first.onCall = () => {
      if (first.calls.length === 2) controller.abort();
    };
    const interrupted = await runBackfill(deps(first, { concurrency: 1, signal: controller.signal }));
    expect(interrupted.aborted).toBe(true);
    expect(interrupted.succeeded).toBe(2);

    const second = new FakeMfApi();
    const resumed = await runBackfill(deps(second, { concurrency: 1 }));
    expect(resumed).toMatchObject({ succeeded: 3, skippedUpToDate: 2, failed: 0, aborted: false });
    expect(second.calls.sort()).toEqual([100003, 100004, 100005]);
    expect([...first.calls, ...second.calls].sort()).toEqual([100001, 100002, 100003, 100004, 100005]);

    for (const code of [100001, 100002, 100003, 100004, 100005]) {
      expect((await store.getSeries(String(code)))?.points).toHaveLength(5);
    }

    const third = new FakeMfApi();
    await runBackfill(deps(third));
    expect(third.calls).toEqual([]);
  });

  it("records per-scheme failures without stopping, and retries them next run", async () => {
    const mfapi = new FakeMfApi();
    mfapi.failing.add(100003);
    const summary = await runBackfill(deps(mfapi));
    expect(summary).toMatchObject({ succeeded: 4, failed: 1 });

    const [state] = await db.select().from(ingestState).where(eq(ingestState.schemeCode, 100003));
    expect(state.lastError).toContain("boom 100003");
    expect(state.lastSuccessAt).toBeNull();
    expect(await store.getSeries("100003")).toBeNull();

    const retry = new FakeMfApi();
    const second = await runBackfill(deps(retry));
    expect(retry.calls).toEqual([100003]);
    expect(second).toMatchObject({ succeeded: 1, skippedUpToDate: 4 });
    const [cleared] = await db.select().from(ingestState).where(eq(ingestState.schemeCode, 100003));
    expect(cleared.lastError).toBeNull();
  });

  it("honours --codes", async () => {
    const byCodes = new FakeMfApi();
    await runBackfill(deps(byCodes, { codes: [100002, 100004] }));
    expect(byCodes.calls.sort()).toEqual([100002, 100004]);
  });

  it("honours --limit", async () => {
    const limited = new FakeMfApi();
    const summary = await runBackfill(deps(limited, { limit: 3 }));
    expect(summary).toMatchObject({ total: 5, attempted: 3 });
    expect(limited.calls.sort()).toEqual([100001, 100002, 100003]);

    // The limit caps work done, not schemes considered, so repeating it makes progress.
    const next = new FakeMfApi();
    await runBackfill(deps(next, { limit: 3 }));
    expect(next.calls.sort()).toEqual([100004, 100005]);
  });

  it("refetches a scheme once the source publishes a newer NAV date", async () => {
    await runBackfill(deps(new FakeMfApi()));
    const newer = NAVALL.replaceAll("30-Oct-2026", "02-Nov-2026");
    const mfapi = new FakeMfApi();
    const summary = await runBackfill(deps(mfapi, { fetchNavAll: async () => newer }));
    expect(summary.succeeded).toBe(5);
  });
});
