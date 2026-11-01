import { describe, expect, it } from "vitest";
import { NavStoreError, type NavStore } from "./types";

/**
 * Shared behavioral contract for every `NavStore` implementation. Each
 * implementation's own test file calls this with a fresh, isolated store
 * per test so the suite runs identically against `FsNavStore` and
 * `R2NavStore`.
 */
export function runNavStoreContractTests(
  createStore: () => NavStore | Promise<NavStore>
): void {
  describe("NavStore contract", () => {
    it("returns null for getSeries on a scheme that was never written", async () => {
      const store = await createStore();

      await expect(store.getSeries("000000")).resolves.toBeNull();
    });

    it("returns null for getHead on a scheme that was never written", async () => {
      const store = await createStore();

      await expect(store.getHead("000000")).resolves.toBeNull();
    });

    it("returns an empty list for listCodes on a fresh store", async () => {
      const store = await createStore();

      await expect(store.listCodes()).resolves.toEqual([]);
    });

    it("round-trips putSeries/getSeries, sorted and deduped by date", async () => {
      const store = await createStore();

      await store.putSeries("100001", [
        { date: "2024-01-03", nav: 12 },
        { date: "2024-01-01", nav: 10 },
        { date: "2024-01-01", nav: 10.1 },
      ]);

      const series = await store.getSeries("100001");

      expect(series).not.toBeNull();
      expect(series?.points).toEqual([
        { date: "2024-01-01", nav: 10.1 },
        { date: "2024-01-03", nav: 12 },
      ]);
    });

    it("putSeries fully replaces a previously stored series", async () => {
      const store = await createStore();

      await store.putSeries("100002", [{ date: "2024-01-01", nav: 10 }]);
      await store.putSeries("100002", [{ date: "2024-02-01", nav: 20 }]);

      const series = await store.getSeries("100002");

      expect(series?.points).toEqual([{ date: "2024-02-01", nav: 20 }]);
    });

    it("appendPoints creates a series when none exists", async () => {
      const store = await createStore();

      const result = await store.appendPoints("100003", [
        { date: "2024-01-01", nav: 10 },
        { date: "2024-01-02", nav: 10.5 },
      ]);

      expect(result).toEqual({ added: 2, total: 2 });
      const series = await store.getSeries("100003");
      expect(series?.points).toEqual([
        { date: "2024-01-01", nav: 10 },
        { date: "2024-01-02", nav: 10.5 },
      ]);
    });

    it("appendPoints merges into an existing series and is idempotent", async () => {
      const store = await createStore();

      await store.appendPoints("100004", [{ date: "2024-01-01", nav: 10 }]);
      const second = await store.appendPoints("100004", [
        { date: "2024-01-01", nav: 10 },
        { date: "2024-01-02", nav: 10.5 },
      ]);
      const third = await store.appendPoints("100004", [
        { date: "2024-01-02", nav: 10.5 },
      ]);

      expect(second).toEqual({ added: 1, total: 2 });
      expect(third).toEqual({ added: 0, total: 2 });
      const series = await store.getSeries("100004");
      expect(series?.points).toEqual([
        { date: "2024-01-01", nav: 10 },
        { date: "2024-01-02", nav: 10.5 },
      ]);
    });

    it("getHead returns the most recent point after writes", async () => {
      const store = await createStore();

      await store.putSeries("100005", [
        { date: "2024-01-01", nav: 10 },
        { date: "2024-03-01", nav: 15 },
        { date: "2024-02-01", nav: 12 },
      ]);

      await expect(store.getHead("100005")).resolves.toEqual({
        date: "2024-03-01",
        nav: 15,
      });
    });

    it("listCodes lists every scheme that has been written", async () => {
      const store = await createStore();

      await store.putSeries("100006", [{ date: "2024-01-01", nav: 10 }]);
      await store.putSeries("100007", [{ date: "2024-01-01", nav: 10 }]);

      const codes = await store.listCodes();

      expect(new Set(codes)).toEqual(new Set(["100006", "100007"]));
    });

    it("keeps series for different scheme codes independent", async () => {
      const store = await createStore();

      await store.putSeries("100008", [{ date: "2024-01-01", nav: 10 }]);
      await store.putSeries("100009", [{ date: "2024-01-01", nav: 20 }]);

      const a = await store.getSeries("100008");
      const b = await store.getSeries("100009");

      expect(a?.points[0].nav).toBe(10);
      expect(b?.points[0].nav).toBe(20);
    });

    it("rejects a scheme code that cannot map to a safe storage key", async () => {
      const store = await createStore();

      await expect(store.getSeries("../escape")).rejects.toThrow(
        NavStoreError
      );
    });
  });
}
