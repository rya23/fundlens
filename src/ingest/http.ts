/**
 * Shared HTTP plumbing for the data-source clients in `src/ingest/sources/`.
 *
 * Every live source (mfapi.in, AMFI's NAVAll.txt, the TigZig metadata mirror)
 * gets the same treatment: an optional polite throttle before each request,
 * a hard timeout per attempt, and exponential backoff with jitter on
 * transient failures. None of this is source-specific, so it lives here
 * instead of being duplicated in each client.
 */

/** HTTP statuses worth retrying: request timeouts, rate limiting, and server-side failures. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class RetryableHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "RetryableHttpError";
  }
}

export interface FetchRetryOptions {
  /** Injectable fetch implementation, mainly for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Number of attempts *after* the first one. Default 3 (4 attempts total). */
  retries?: number;
  /** Per-attempt timeout in milliseconds, after which the request is aborted. Default 15000. */
  timeoutMs?: number;
  /** Base delay for exponential backoff between retries, in milliseconds. Default 500. */
  backoffMs?: number;
  /** Minimum delay to wait before issuing the request at all (politeness throttle). Default 0. */
  throttleMs?: number;
  headers?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter: base * 2^attempt, plus up to one more base's worth of jitter. */
function backoffDelay(base: number, attempt: number): number {
  return base * 2 ** attempt + Math.random() * base;
}

/**
 * Issues an HTTP request with a politeness throttle, a per-attempt timeout,
 * and retry-with-backoff on network errors or retryable status codes.
 * Resolves with the final successful `Response`; throws `RetryableHttpError`
 * (for a non-ok status) or the underlying error (for network/timeout
 * failures) once retries are exhausted.
 */
export async function fetchWithRetry(url: string, options: FetchRetryOptions = {}): Promise<Response> {
  const {
    fetchImpl = fetch,
    retries = 3,
    timeoutMs = 15_000,
    backoffMs = 500,
    throttleMs = 0,
    headers,
  } = options;

  if (throttleMs > 0) {
    await sleep(throttleMs);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers, signal: controller.signal });
      clearTimeout(timeoutHandle);

      if (response.ok) {
        return response;
      }

      const error = new RetryableHttpError(`HTTP ${response.status} for ${url}`, response.status);
      if (RETRYABLE_STATUSES.has(response.status) && attempt < retries) {
        lastError = error;
        await sleep(backoffDelay(backoffMs, attempt));
        continue;
      }
      throw error;
    } catch (error) {
      clearTimeout(timeoutHandle);
      if (error instanceof RetryableHttpError) {
        throw error;
      }
      lastError = error;
      if (attempt < retries) {
        await sleep(backoffDelay(backoffMs, attempt));
        continue;
      }
      throw error;
    }
  }

  // Unreachable in practice: the loop above always returns or throws.
  throw lastError;
}

export async function fetchJson<T>(url: string, options: FetchRetryOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, options);
  return (await response.json()) as T;
}

export async function fetchText(url: string, options: FetchRetryOptions = {}): Promise<string> {
  const response = await fetchWithRetry(url, options);
  return response.text();
}

export async function fetchArrayBuffer(url: string, options: FetchRetryOptions = {}): Promise<ArrayBuffer> {
  const response = await fetchWithRetry(url, options);
  return response.arrayBuffer();
}
