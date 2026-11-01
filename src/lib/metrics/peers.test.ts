import { describe, expect, it } from "vitest";
import {
  computeQuartileCutPoints,
  formatPeerRankLabel,
  quartileFromCutPoints,
  rankPeer,
} from "./peers";

describe("computeQuartileCutPoints", () => {
  it("computes q1/median/q3 with linear interpolation (Excel PERCENTILE.INC / numpy default)", () => {
    // n=5, idx25 = 0.25*4 = 1 (exact) -> 20; idx50 = 2 (exact) -> 30;
    // idx75 = 3 (exact) -> 40. Chosen so every cut point lands exactly on
    // an array element (no interpolation needed to hand-verify).
    const cuts = computeQuartileCutPoints([10, 20, 30, 40, 50]);

    expect(cuts).toEqual({ q1: 20, q2: 30, q3: 40 });
  });

  it("filters out null and undefined values before computing cut points", () => {
    const cuts = computeQuartileCutPoints([10, null, 20, undefined, 30]);

    // n=3 after filtering: idx25=0.5 -> interpolate(10,20)=15;
    // idx50=1 -> 20; idx75=1.5 -> interpolate(20,30)=25.
    expect(cuts).toEqual({ q1: 15, q2: 20, q3: 25 });
  });

  it("returns a degenerate cut-point triple equal to the single value for n=1", () => {
    expect(computeQuartileCutPoints([42])).toEqual({ q1: 42, q2: 42, q3: 42 });
  });

  it("returns undefined for an empty (or all-null) peer set", () => {
    expect(computeQuartileCutPoints([])).toBeUndefined();
    expect(computeQuartileCutPoints([null, undefined])).toBeUndefined();
  });
});

describe("rankPeer", () => {
  it("ranks a higher-is-better metric (e.g. CAGR) using numeric-quartile inversion", () => {
    // peers [10,20,30,40,50], value=40: 3 strictly worse (10,20,30) + 0.5
    // for itself, over 5 -> (3.5/5)*100 = 70th percentile. Numeric quartile
    // of 40 against cuts {20,30,40} is 3 (value <= q3); higher-is-better
    // inverts rank quartile to 5-3=2.
    const rank = rankPeer(40, [10, 20, 30, 40, 50], "higher-is-better");

    expect(rank).toEqual({ percentile: 70, quartile: 2, peerCount: 5 });
  });

  it("ranks a lower-is-better metric (e.g. TER) without inversion", () => {
    // Same peer set, value=20: 3 peers are worse (higher: 30,40,50) + 0.5
    // for itself, over 5 -> 70th percentile. Numeric quartile of 20 against
    // cuts {20,30,40} is 1 (value <= q1); lower-is-better keeps it as-is.
    const rank = rankPeer(20, [10, 20, 30, 40, 50], "lower-is-better");

    expect(rank).toEqual({ percentile: 70, quartile: 1, peerCount: 5 });
  });

  it("splits credit for ties using the average-rank convention", () => {
    // peers [10,10,10,20,20], value=10 (higher-is-better): 0 strictly
    // worse + 0.5*3 (three peers equal to 10, including itself) over 5 ->
    // 30th percentile. Cuts for this sorted set are {q1:10,q2:10,q3:20};
    // numeric quartile of 10 is 1, inverted (higher-is-better) to 5-1=4 -
    // correctly the worst quartile, since 10 is the lowest value present.
    const rank = rankPeer(10, [10, 10, 10, 20, 20], "higher-is-better");

    expect(rank).toEqual({ percentile: 30, quartile: 4, peerCount: 5 });
  });

  it("excludes null and undefined peer values before ranking", () => {
    // Filtered peers: [10,20,30], value=20. Worse-by-direction count = 1
    // (10) + 0.5 for itself, over 3 -> 50th percentile. Cuts for [10,20,30]
    // are {q1:15,q2:20,q3:25}; numeric quartile of 20 is 2, inverted
    // (higher-is-better) to 5-2=3.
    const rank = rankPeer(20, [10, null, 20, undefined, 30], "higher-is-better");

    expect(rank).toEqual({ percentile: 50, quartile: 3, peerCount: 3 });
  });

  it("treats a single-fund category as top of its own (trivial) peer set", () => {
    expect(rankPeer(42, [42], "higher-is-better")).toEqual({
      percentile: 100,
      quartile: 1,
      peerCount: 1,
    });
    expect(rankPeer(42, [42], "lower-is-better")).toEqual({
      percentile: 100,
      quartile: 1,
      peerCount: 1,
    });
  });

  it("returns undefined when there are no peers to rank against", () => {
    expect(rankPeer(42, [], "higher-is-better")).toBeUndefined();
    expect(rankPeer(42, [null, undefined], "higher-is-better")).toBeUndefined();
  });
});

describe("formatPeerRankLabel", () => {
  it('formats the canonical example as "Q1 · 87th pct in Flexi Cap"', () => {
    const label = formatPeerRankLabel(
      { percentile: 87.4, quartile: 1, peerCount: 120 },
      "Flexi Cap"
    );

    expect(label).toBe("Q1 · 87th pct in Flexi Cap");
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [100, "100th"],
  ])("formats percentile %i with the correct ordinal suffix", (percentile, ordinal) => {
    const label = formatPeerRankLabel(
      { percentile, quartile: 2, peerCount: 10 },
      "Large Cap"
    );

    expect(label).toBe(`Q2 · ${ordinal} pct in Large Cap`);
  });
});

describe("quartileFromCutPoints", () => {
  const cuts = { q1: 20, q2: 30, q3: 40 };

  it("inverts for higher-is-better so the top values are quartile 1", () => {
    expect(quartileFromCutPoints(45, cuts, "higher-is-better")).toBe(1);
    expect(quartileFromCutPoints(40, cuts, "higher-is-better")).toBe(2);
    expect(quartileFromCutPoints(25, cuts, "higher-is-better")).toBe(3);
    expect(quartileFromCutPoints(20, cuts, "higher-is-better")).toBe(4);
  });

  it("keeps numeric order for lower-is-better", () => {
    expect(quartileFromCutPoints(10, cuts, "lower-is-better")).toBe(1);
    expect(quartileFromCutPoints(45, cuts, "lower-is-better")).toBe(4);
  });

  it("agrees with rankPeer on the same peer set", () => {
    const peers = [10, 20, 30, 40, 50];
    const peerCuts = computeQuartileCutPoints(peers)!;
    for (const value of peers) {
      expect(quartileFromCutPoints(value, peerCuts, "higher-is-better")).toBe(rankPeer(value, peers, "higher-is-better")!.quartile);
    }
  });
});
