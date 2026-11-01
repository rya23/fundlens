import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseTigZigCsv, TigZigMetadataSource, TIGZIG_METADATA_URL } from "./metadata";

const fixturePath = fileURLToPath(new URL("../__fixtures__/tigzig-scheme-details.csv.gz", import.meta.url));
const fixtureCsv = gunzipSync(readFileSync(fixturePath)).toString("utf-8");
const fixtureGzBytes = readFileSync(fixturePath);

describe("parseTigZigCsv", () => {
  it("parses a row into typed metadata, keyed by scheme code", () => {
    const rows = parseTigZigCsv(fixtureCsv);
    const ppfasDirect = rows.find((r) => r.schemeCode === 122639);

    expect(ppfasDirect).toMatchObject({
      schemeCode: 122639,
      schemePlan: "Direct",
      aumCr: 146349.2,
      terDirect: 0.69,
      terRegular: 1.3,
      terDate: "2026-10-29",
      benchmark: "Nifty 500 TRI",
      riskometer: "Very High",
      allotmentDate: "2013-05-24",
      sebiCategory: "Flexi Cap Fund",
    });
  });

  it("keeps an embedded comma and newline inside the exit-load column intact", () => {
    const rows = parseTigZigCsv(fixtureCsv);
    const row = rows.find((r) => r.schemeCode === 100033);

    expect(row?.exitLoad).toContain("1.00% of applicable NAV");
    expect(row?.exitLoad).toContain("\n");
  });

  it("parses a 'Name (since YYYY-MM-DD)' manager list into plain names, dropping the tenure suffix", () => {
    const rows = parseTigZigCsv(fixtureCsv);
    const multiManager = rows.find((r) => r.schemeCode === 100046);

    expect(multiManager?.managers).toEqual(["Kaustubh Gupta", "Sunaina da Cunha", "Sanjay Pawar"]);
  });

  it("returns null (not NaN or empty string) for blank numeric and text columns", () => {
    const rows = parseTigZigCsv(fixtureCsv);
    const sparse = rows.find((r) => r.schemeCode === 116811);

    expect(sparse?.aumCr).toBeNull();
    expect(sparse?.terDirect).toBeNull();
    expect(sparse?.terDate).toBeNull();
    expect(sparse?.benchmark).toBeNull();
  });

  it("returns an empty array for a header-only CSV", () => {
    const header = fixtureCsv.split("\n")[0];
    expect(parseTigZigCsv(header)).toEqual([]);
  });

  it("throws when a required column is missing from the header", () => {
    expect(() => parseTigZigCsv("scheme_code,scheme_name\n1,Foo")).toThrow(/missing/i);
  });
});

describe("TigZigMetadataSource", () => {
  it("fetches, gunzips, and parses the CSV", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(fixtureGzBytes, { status: 200, headers: { "content-type": "application/gzip" } })
    );
    const source = new TigZigMetadataSource({ fetchImpl, retries: 0, throttleMs: 0 });

    const rows = await source.fetchAll();

    expect(rows.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledWith(TIGZIG_METADATA_URL, expect.anything());
  });

  it("resolves to an empty array instead of throwing when the fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const source = new TigZigMetadataSource({ fetchImpl, retries: 0, throttleMs: 0 });

    await expect(source.fetchAll()).resolves.toEqual([]);
  });

  it("resolves to an empty array instead of throwing when the body is not valid gzip", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not actually gzip", { status: 200 }));
    const source = new TigZigMetadataSource({ fetchImpl, retries: 0, throttleMs: 0 });

    await expect(source.fetchAll()).resolves.toEqual([]);
  });
});
