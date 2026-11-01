import { describe, expect, it, vi } from "vitest";
import { fetchJson, fetchText, RetryableHttpError } from "./http";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchJson", () => {
  it("returns the parsed JSON body on a successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hello: "world" }));

    const result = await fetchJson<{ hello: string }>("https://example.test/data", {
      fetchImpl,
      retries: 0,
      throttleMs: 0,
    });

    expect(result).toEqual({ hello: "world" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable HTTP status with backoff, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await fetchJson<{ ok: boolean }>("https://example.test/flaky", {
      fetchImpl,
      retries: 3,
      backoffMs: 1,
      throttleMs: 0,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up and throws after exhausting retries on a persistent 500", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 }));

    await expect(
      fetchJson("https://example.test/down", { fetchImpl, retries: 2, backoffMs: 1, throttleMs: 0 })
    ).rejects.toBeInstanceOf(RetryableHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 404 }));

    await expect(
      fetchJson("https://example.test/missing", { fetchImpl, retries: 3, backoffMs: 1, throttleMs: 0 })
    ).rejects.toBeInstanceOf(RetryableHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts the request once it exceeds timeoutMs", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    await expect(
      fetchJson("https://example.test/slow", {
        fetchImpl,
        retries: 0,
        timeoutMs: 5,
        throttleMs: 0,
      })
    ).rejects.toThrow();
  });

  it("waits at least throttleMs before issuing the request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const start = Date.now();

    await fetchJson("https://example.test/throttled", {
      fetchImpl,
      retries: 0,
      throttleMs: 30,
    });

    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
});

describe("fetchText", () => {
  it("returns the raw response body as text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("plain text body", { status: 200 }));

    const result = await fetchText("https://example.test/text", { fetchImpl, retries: 0, throttleMs: 0 });

    expect(result).toBe("plain text body");
  });
});
