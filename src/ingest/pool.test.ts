import { describe, expect, it } from "vitest";

import { deadlineFromMinutes, forEachConcurrent } from "./pool";

describe("forEachConcurrent", () => {
  it("runs every item with at most `concurrency` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    const result = await forEachConcurrent([1, 2, 3, 4, 5, 6, 7], async (item) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      seen.push(item);
      inFlight--;
    }, { concurrency: 3 });
    expect(result).toEqual({ started: 7, stoppedEarly: false });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stops starting new items once the deadline passes, finishing in-flight ones", async () => {
    let clock = 0;
    const seen: number[] = [];
    const result = await forEachConcurrent([1, 2, 3, 4], async (item) => {
      seen.push(item);
      clock += 10;
    }, { concurrency: 1, deadline: 20, now: () => clock });
    expect(seen).toEqual([1, 2]);
    expect(result).toEqual({ started: 2, stoppedEarly: true });
  });

  it("stops on abort", async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    const result = await forEachConcurrent([1, 2, 3], async (item) => {
      seen.push(item);
      controller.abort();
    }, { concurrency: 1, signal: controller.signal });
    expect(seen).toEqual([1]);
    expect(result.stoppedEarly).toBe(true);
  });

  it("does not report an early stop when the work finished first", async () => {
    const result = await forEachConcurrent([], async () => {}, { concurrency: 4, deadline: 0, now: () => 1 });
    expect(result).toEqual({ started: 0, stoppedEarly: false });
  });
});

describe("deadlineFromMinutes", () => {
  it("converts a budget to an absolute deadline", () => {
    expect(deadlineFromMinutes(undefined)).toBeUndefined();
    expect(deadlineFromMinutes(2, () => 1_000)).toBe(121_000);
  });
});
