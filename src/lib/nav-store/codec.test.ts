import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeNavSeries, encodeNavSeries, mergeNavPoints } from "./codec";
import { NAV_SERIES_VERSION, NavStoreError, type NavPoint } from "./types";

describe("mergeNavPoints", () => {
  it("sorts unordered points ascending by date", () => {
    const points: NavPoint[] = [
      { date: "2024-01-03", nav: 12 },
      { date: "2024-01-01", nav: 10 },
      { date: "2024-01-02", nav: 11 },
    ];

    const result = mergeNavPoints([], points);

    expect(result.points.map((p) => p.date)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
    expect(result.added).toBe(3);
  });

  it("deduplicates by date, with incoming points winning ties", () => {
    const existing: NavPoint[] = [{ date: "2024-01-01", nav: 10 }];
    const incoming: NavPoint[] = [{ date: "2024-01-01", nav: 10.5 }];

    const result = mergeNavPoints(existing, incoming);

    expect(result.points).toEqual([{ date: "2024-01-01", nav: 10.5 }]);
    expect(result.added).toBe(0);
  });

  it("is idempotent: merging the same points twice adds nothing the second time", () => {
    const existing: NavPoint[] = [{ date: "2024-01-01", nav: 10 }];
    const incoming: NavPoint[] = [
      { date: "2024-01-01", nav: 10 },
      { date: "2024-01-02", nav: 10.2 },
    ];

    const first = mergeNavPoints(existing, incoming);
    const second = mergeNavPoints(first.points, incoming);

    expect(second.added).toBe(0);
    expect(second.points).toEqual(first.points);
  });

  it("reports added as only the count of genuinely new dates", () => {
    const existing: NavPoint[] = [{ date: "2024-01-01", nav: 10 }];
    const incoming: NavPoint[] = [
      { date: "2024-01-01", nav: 10 },
      { date: "2024-01-02", nav: 10.2 },
      { date: "2024-01-03", nav: 10.4 },
    ];

    const result = mergeNavPoints(existing, incoming);

    expect(result.added).toBe(2);
    expect(result.points).toHaveLength(3);
  });
});

describe("encodeNavSeries / decodeNavSeries", () => {
  it("round-trips a series through gzip", () => {
    const series = {
      version: NAV_SERIES_VERSION,
      schemeCode: "123456",
      points: [
        { date: "2024-01-01", nav: 10 },
        { date: "2024-01-02", nav: 10.5 },
      ],
    };

    const encoded = encodeNavSeries(series);
    const decoded = decodeNavSeries(encoded);

    expect(decoded).toEqual(series);
  });

  it("serializes points as [date, nav] tuples on the wire", () => {
    const series = {
      version: NAV_SERIES_VERSION,
      schemeCode: "123456",
      points: [{ date: "2024-01-01", nav: 10 }],
    };

    const encoded = encodeNavSeries(series);
    const json = JSON.parse(gunzipSync(encoded).toString("utf8"));

    expect(json).toEqual({
      version: NAV_SERIES_VERSION,
      schemeCode: "123456",
      points: [["2024-01-01", 10]],
    });
  });

  it("rejects an unsupported version on decode", () => {
    const bad = gzipSync(
      JSON.stringify({
        version: 999,
        schemeCode: "123456",
        points: [["2024-01-01", 10]],
      })
    );

    expect(() => decodeNavSeries(bad)).toThrow(NavStoreError);
  });

  it("rejects malformed JSON on decode", () => {
    const bad = gzipSync("not json");

    expect(() => decodeNavSeries(bad)).toThrow(NavStoreError);
  });
});
