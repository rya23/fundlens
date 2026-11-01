/**
 * Shared result type for metrics across src/lib/metrics/.
 *
 * Every metric that can fail to compute (insufficient history, a window
 * that doesn't make sense, a calculation that produced a non-finite
 * number) returns a `MetricResult<T>` instead of `NaN`/`undefined`/throwing.
 * Callers must check `ok` before reading `value`.
 */
export type MetricResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export function ok<T>(value: T): MetricResult<T> {
  return { ok: true, value };
}

/**
 * Builds a failed MetricResult. Typed as `MetricResult<never>` (not a
 * generic `<T>`) so it is assignable to any `MetricResult<T>` at the call
 * site without needing an explicit type argument.
 */
export function na(reason: string): MetricResult<never> {
  return { ok: false, reason };
}

/**
 * Reason codes used by series.ts / returns.ts. `MetricResult.reason` is a
 * plain string on purpose, not a shared literal union - other metric
 * modules (risk.ts, xirr.ts, sip.ts, peers.ts) define their own reason
 * strings rather than extending a union here, so parallel tickets never
 * need to touch this file.
 */
export const METRIC_REASONS = {
  EMPTY_SERIES: "empty_series",
  INVALID_WINDOW: "invalid_window",
  NO_DATA_AT_DATE: "no_data_at_date",
  INSUFFICIENT_HISTORY: "insufficient_history",
  INVALID_NAV: "invalid_nav",
  WINDOW_MISMATCH: "window_mismatch",
  NO_OVERLAPPING_WINDOWS: "no_overlapping_windows",
} as const;
