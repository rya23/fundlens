import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runNavStoreContractTests } from "./contract";
import { FsNavStore } from "./fs-store";

const dirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "nav-store-test-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

runNavStoreContractTests(async () => new FsNavStore(await makeTmpDir()));

describe("FsNavStore", () => {
  it("creates the store directory on first write if it does not exist yet", async () => {
    const dir = await makeTmpDir();
    const nested = join(dir, "nested", "nav");
    const store = new FsNavStore(nested);

    await store.putSeries("100001", [{ date: "2024-01-01", nav: 10 }]);

    const files = await readdir(nested);
    expect(files).toContain("100001.json.gz");
  });

  it("writes atomically: no leftover temp file after a successful write", async () => {
    const dir = await makeTmpDir();
    const store = new FsNavStore(dir);

    await store.putSeries("100002", [{ date: "2024-01-01", nav: 10 }]);

    const files = await readdir(dir);
    expect(files).toEqual(["100002.json.gz"]);
  });
});
