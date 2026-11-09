/**
 * Bounded-concurrency worker pool shared by the data jobs (backfill,
 * nightly, precompute). Every per-scheme step talks to remote services
 * (mfapi, object storage, Postgres) and is latency-bound, so running them
 * one at a time turns ~8k schemes into hours. Workers pull the next item
 * from a shared cursor; `fn` must handle its own per-item errors.
 *
 * Stopping early: once `signal` aborts or `deadline` passes, no new items
 * are started; in-flight ones finish. The result says how many items ran so
 * a caller can report "stopped early, re-run to resume".
 */
export interface PoolOptions {
  concurrency: number;
  signal?: AbortSignal;
  /** Epoch ms after which no new items are picked up. */
  deadline?: number;
  now?: () => number;
}

export interface PoolResult {
  started: number;
  stoppedEarly: boolean;
}

export async function forEachConcurrent<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<void>,
  options: PoolOptions
): Promise<PoolResult> {
  const now = options.now ?? Date.now;
  const shouldStop = () => options.signal?.aborted === true || (options.deadline !== undefined && now() >= options.deadline);
  let next = 0;
  let stoppedEarly = false;

  async function worker(): Promise<void> {
    while (next < items.length) {
      if (shouldStop()) {
        stoppedEarly = true;
        return;
      }
      const index = next++;
      await fn(items[index], index);
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return { started: next, stoppedEarly };
}

/** `--max-minutes` style budget to an absolute deadline; undefined means no budget. */
export function deadlineFromMinutes(minutes: number | undefined, now: () => number = Date.now): number | undefined {
  return minutes === undefined ? undefined : now() + minutes * 60_000;
}
