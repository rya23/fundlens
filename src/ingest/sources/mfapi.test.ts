import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { MfApiClient, MFAPI_BASE_URL } from "./mfapi";

const fixturesDir = fileURLToPath(new URL("../__fixtures__", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDir}/${name}`, "utf-8"));
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("MfApiClient.listSchemes", () => {
  it("fetches the scheme list from /mf and parses it", async () => {
    const schemes = loadFixture("mfapi-schemes.json");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(schemes));
    const client = new MfApiClient({ fetchImpl, throttleMs: 0, retries: 0 });

    const result = await client.listSchemes();

    expect(result).toEqual(schemes);
    expect(fetchImpl).toHaveBeenCalledWith(MFAPI_BASE_URL, expect.anything());
  });

  it("passes limit and offset as query params", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = new MfApiClient({ fetchImpl, throttleMs: 0, retries: 0 });

    await client.listSchemes({ limit: 50, offset: 100 });

    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("limit")).toBe("50");
    expect(calledUrl.searchParams.get("offset")).toBe("100");
  });
});

describe("MfApiClient.getSchemeHistory", () => {
  it("fetches and returns a scheme's full NAV history", async () => {
    const history = loadFixture("mfapi-scheme-history.json") as {
      meta: { scheme_code: number; scheme_name: string };
      data: { date: string; nav: string }[];
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(history));
    const client = new MfApiClient({ fetchImpl, throttleMs: 0, retries: 0 });

    const result = await client.getSchemeHistory(122639);

    expect(result.meta.scheme_code).toBe(122639);
    expect(result.meta.scheme_name).toContain("Parag Parikh Flexi Cap Fund");
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]).toEqual({ date: "30-10-2026", nav: "89.23320" });
    expect(fetchImpl).toHaveBeenCalledWith(`${MFAPI_BASE_URL}/122639`, expect.anything());
  });

  it("passes startDate and endDate as query params when given", async () => {
    const history = loadFixture("mfapi-scheme-history.json");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(history));
    const client = new MfApiClient({ fetchImpl, throttleMs: 0, retries: 0 });

    await client.getSchemeHistory(122639, { startDate: "01-01-2020", endDate: "31-12-2020" });

    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/mf/122639");
    expect(calledUrl.searchParams.get("startDate")).toBe("01-01-2020");
    expect(calledUrl.searchParams.get("endDate")).toBe("31-12-2020");
  });

  it("throws when mfapi reports an unknown scheme code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        meta: { fund_house: "", scheme_type: "", scheme_category: "", scheme_code: 0, scheme_name: "" },
        data: [],
        status: "SUCCESS",
      })
    );
    const client = new MfApiClient({ fetchImpl, throttleMs: 0, retries: 0 });

    await expect(client.getSchemeHistory(999999999)).rejects.toThrow(/unknown scheme/i);
  });
});

describe("MfApiClient.getLatestNavs", () => {
  it("fetches the latest NAV for every scheme", async () => {
    const latest = loadFixture("mfapi-latest.json");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(latest));
    const client = new MfApiClient({ fetchImpl, throttleMs: 0, retries: 0 });

    const result = await client.getLatestNavs();

    expect(result).toEqual(latest);
    expect(fetchImpl).toHaveBeenCalledWith(`${MFAPI_BASE_URL}/latest`, expect.anything());
  });
});
