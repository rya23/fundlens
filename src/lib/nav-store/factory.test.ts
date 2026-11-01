import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "../env";
import { createNavStoreFromEnv } from "./factory";
import { FsNavStore } from "./fs-store";
import { R2NavStore } from "./r2-store";
import { NavStoreError } from "./types";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

function envWith(overrides: Partial<Env>): Env {
  return {
    DATABASE_URL: "pglite:memory",
    NAV_STORE: "fs:.data/nav",
    RISK_FREE_RATE: 0.065,
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET: undefined,
    ...overrides,
  };
}

describe("createNavStoreFromEnv", () => {
  it("builds a working FsNavStore pointed at the configured directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nav-store-factory-"));
    dirs.push(dir);

    const store = createNavStoreFromEnv(envWith({ NAV_STORE: `fs:${dir}` }));

    expect(store).toBeInstanceOf(FsNavStore);
    await store.putSeries("100001", [{ date: "2024-01-01", nav: 10 }]);
    expect(await readdir(dir)).toEqual(["100001.json.gz"]);
  });

  it("builds an R2NavStore when NAV_STORE=r2 with all R2_* vars set", () => {
    const store = createNavStoreFromEnv(
      envWith({
        NAV_STORE: "r2",
        R2_ACCOUNT_ID: "account",
        R2_ACCESS_KEY_ID: "key-id",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET: "nav-bucket",
      })
    );

    expect(store).toBeInstanceOf(R2NavStore);
  });

  it("throws if NAV_STORE=r2 but an R2_* var is missing, even past a hand-built Env", () => {
    const env = envWith({ NAV_STORE: "r2", R2_ACCOUNT_ID: "account" });

    expect(() => createNavStoreFromEnv(env)).toThrow(NavStoreError);
  });

  it("throws for an unsupported NAV_STORE value, even past a hand-built Env", () => {
    const env = { ...envWith({}), NAV_STORE: "s3:bucket" } as Env;

    expect(() => createNavStoreFromEnv(env)).toThrow(NavStoreError);
  });
});
