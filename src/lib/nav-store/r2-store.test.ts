import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runNavStoreContractTests } from "./contract";
import { R2NavStore } from "./r2-store";

/**
 * A minimal in-memory stand-in for `S3Client`, covering only the commands
 * `R2NavStore` sends. Mirrors the real SDK's shapes closely enough for the
 * contract suite: `GetObject` on a missing key rejects with a `NoSuchKey`
 * error, and a successful `GetObject`'s `Body` exposes
 * `transformToByteArray()` (as the real Node S3 client's response does).
 */
class FakeS3 {
  readonly objects = new Map<string, Uint8Array>();
  readonly calls: { command: string; input: unknown }[] = [];

  send = vi.fn(async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      this.calls.push({ command: "PutObject", input: command.input });
      const { Key, Body } = command.input;
      this.objects.set(Key as string, toBytes(Body));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      this.calls.push({ command: "GetObject", input: command.input });
      const bytes = this.objects.get(command.input.Key as string);
      if (!bytes) {
        const err = new Error("not found");
        err.name = "NoSuchKey";
        throw err;
      }
      return {
        Body: {
          transformToByteArray: async () => bytes,
        },
      };
    }
    if (command instanceof ListObjectsV2Command) {
      this.calls.push({ command: "ListObjectsV2", input: command.input });
      const prefix = command.input.Prefix ?? "";
      const keys = Array.from(this.objects.keys()).filter((k) =>
        k.startsWith(prefix)
      );
      return { Contents: keys.map((Key) => ({ Key })), IsTruncated: false };
    }
    throw new Error(`FakeS3: unsupported command ${String(command)}`);
  });
}

function toBytes(body: unknown): Uint8Array {
  if (body instanceof Uint8Array) return body;
  throw new Error("FakeS3 only supports Uint8Array/Buffer bodies");
}

function makeStore(): { store: R2NavStore; fake: FakeS3 } {
  const fake = new FakeS3();
  const store = new R2NavStore({
    client: fake as unknown as S3Client,
    bucket: "nav-bucket",
  });
  return { store, fake };
}

runNavStoreContractTests(() => makeStore().store);

describe("R2NavStore", () => {
  it("stores objects under the nav/ prefix by default", async () => {
    const { store, fake } = makeStore();

    await store.putSeries("100001", [{ date: "2024-01-01", nav: 10 }]);

    expect(Array.from(fake.objects.keys())).toEqual(["nav/100001.json.gz"]);
  });

  it("honors a custom prefix", async () => {
    const fake = new FakeS3();
    const store = new R2NavStore({
      client: fake as unknown as S3Client,
      bucket: "nav-bucket",
      prefix: "custom/",
    });

    await store.putSeries("100001", [{ date: "2024-01-01", nav: 10 }]);

    expect(Array.from(fake.objects.keys())).toEqual([
      "custom/100001.json.gz",
    ]);
  });

  describe("class A op discipline", () => {
    let fake: FakeS3;
    let store: R2NavStore;

    beforeEach(() => {
      ({ store, fake } = makeStore());
    });

    it("appendPoints on a new scheme does exactly one GetObject and one PutObject", async () => {
      await store.appendPoints("100001", [{ date: "2024-01-01", nav: 10 }]);

      expect(fake.calls.map((c) => c.command)).toEqual([
        "GetObject",
        "PutObject",
      ]);
    });

    it("appendPoints on an existing scheme still does exactly one GetObject and one PutObject", async () => {
      await store.putSeries("100001", [{ date: "2024-01-01", nav: 10 }]);
      fake.calls.length = 0;

      await store.appendPoints("100001", [{ date: "2024-01-02", nav: 10.5 }]);

      expect(fake.calls.map((c) => c.command)).toEqual([
        "GetObject",
        "PutObject",
      ]);
    });

    it("never calls ListObjectsV2 from appendPoints, getSeries, putSeries, or getHead", async () => {
      await store.putSeries("100001", [{ date: "2024-01-01", nav: 10 }]);
      await store.appendPoints("100001", [{ date: "2024-01-02", nav: 10.5 }]);
      await store.getSeries("100001");
      await store.getHead("100001");

      expect(fake.calls.some((c) => c.command === "ListObjectsV2")).toBe(
        false
      );
    });

    it("listCodes is the only operation that lists", async () => {
      await store.putSeries("100001", [{ date: "2024-01-01", nav: 10 }]);
      fake.calls.length = 0;

      await store.listCodes();

      expect(fake.calls.map((c) => c.command)).toEqual(["ListObjectsV2"]);
    });
  });
});
