/**
 * XIRR (extended internal rate of return) for a set of dated cashflows.
 *
 * Solves for the annualised rate `r` such that
 *   sum(amount_i / (1 + r)^(days_i / 365)) == 0
 * using Newton-Raphson, falling back to bisection over a wide,
 * exponentially-expanding bracket when Newton fails to converge.
 *
 * Never returns `NaN`: a result that cannot be computed is a typed
 * `{ ok: false, reason }` instead.
 *
 * Note: this module intentionally has no dependency on `series.ts` (owned by
 * a parallel ticket); `Cashflow` is a minimal local type.
 */

export interface Cashflow {
  date: Date;
  amount: number;
}

export type XirrFailureReason =
  | "single-cashflow"
  | "no-sign-change"
  | "no-convergence";

export type XirrResult =
  | { ok: true; value: number }
  | { ok: false; reason: XirrFailureReason };

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

const NEWTON_MAX_ITERATIONS = 100;
const NEWTON_TOLERANCE = 1e-9;
const BISECTION_MAX_ITERATIONS = 200;
const BISECTION_TOLERANCE = 1e-9;

// Rate domain is (-1, Infinity); keep the floor just shy of -1 so (1+r)
// never hits zero. The grid below is sampled to find a bracket (a pair of
// rates where the NPV function changes sign) without assuming the root is
// anywhere near 0.
const BRACKET_GRID = [
  -0.999999999, -0.99, -0.9, -0.5, 0, 0.5, 1, 2, 5, 10, 100, 1_000, 10_000,
  100_000, 1_000_000, 10_000_000,
];

function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY / DAYS_PER_YEAR;
}

function npv(rate: number, cashflows: Cashflow[], t0: Date): number {
  let sum = 0;
  for (const cf of cashflows) {
    const t = yearsBetween(t0, cf.date);
    sum += cf.amount / Math.pow(1 + rate, t);
  }
  return sum;
}

function dnpv(rate: number, cashflows: Cashflow[], t0: Date): number {
  let sum = 0;
  for (const cf of cashflows) {
    const t = yearsBetween(t0, cf.date);
    if (t === 0) continue;
    sum -= (t * cf.amount) / Math.pow(1 + rate, t + 1);
  }
  return sum;
}

function hasSignChange(cashflows: readonly Cashflow[]): boolean {
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashflows) {
    if (cf.amount > 0) hasPositive = true;
    if (cf.amount < 0) hasNegative = true;
  }
  return hasPositive && hasNegative;
}

function newtonRaphson(
  cashflows: Cashflow[],
  t0: Date,
  guess: number
): number | undefined {
  let rate = guess;
  for (let i = 0; i < NEWTON_MAX_ITERATIONS; i++) {
    const value = npv(rate, cashflows, t0);
    if (Math.abs(value) < NEWTON_TOLERANCE) {
      return rate;
    }
    const derivative = dnpv(rate, cashflows, t0);
    if (!Number.isFinite(derivative) || derivative === 0) {
      return undefined;
    }
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -1) {
      return undefined;
    }
    if (Math.abs(next - rate) < NEWTON_TOLERANCE) {
      return next;
    }
    rate = next;
  }
  return undefined;
}

function findBracket(
  cashflows: Cashflow[],
  t0: Date
): [number, number] | undefined {
  let prevRate = BRACKET_GRID[0];
  let prevValue = npv(prevRate, cashflows, t0);

  for (let i = 1; i < BRACKET_GRID.length; i++) {
    const rate = BRACKET_GRID[i];
    const value = npv(rate, cashflows, t0);
    if (
      Number.isFinite(prevValue) &&
      Number.isFinite(value) &&
      Math.sign(prevValue) !== Math.sign(value)
    ) {
      return [prevRate, rate];
    }
    prevRate = rate;
    prevValue = value;
  }
  return undefined;
}

function bisection(
  cashflows: Cashflow[],
  t0: Date,
  bracket: [number, number]
): number | undefined {
  let [lo, hi] = bracket;
  let flo = npv(lo, cashflows, t0);

  for (let i = 0; i < BISECTION_MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid, cashflows, t0);

    if (Math.abs(fmid) < BISECTION_TOLERANCE || hi - lo < BISECTION_TOLERANCE) {
      return mid;
    }

    if (Math.sign(fmid) === Math.sign(flo)) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

export interface XirrOptions {
  /** Initial Newton-Raphson guess for the annual rate. Default 0.1 (10%). */
  guess?: number;
}

export function xirr(
  cashflows: readonly Cashflow[],
  options: XirrOptions = {}
): XirrResult {
  if (cashflows.length < 2) {
    return { ok: false, reason: "single-cashflow" };
  }

  if (!hasSignChange(cashflows)) {
    return { ok: false, reason: "no-sign-change" };
  }

  const sorted = [...cashflows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const t0 = sorted[0].date;

  // If every cashflow falls on the same calendar date, elapsed time is zero
  // for all of them: the NPV function is a rate-independent constant, so
  // the rate is either unsatisfiable (constant != 0) or indeterminate
  // (constant == 0, any rate "solves" it). Neither is a meaningful answer.
  const allSameDate = sorted.every(
    (cf) => cf.date.getTime() === t0.getTime()
  );
  if (allSameDate) {
    return { ok: false, reason: "no-convergence" };
  }

  const newtonResult = newtonRaphson(sorted, t0, options.guess ?? 0.1);
  if (newtonResult !== undefined) {
    return { ok: true, value: newtonResult };
  }

  const bracket = findBracket(sorted, t0);
  if (!bracket) {
    return { ok: false, reason: "no-convergence" };
  }

  const bisectionResult = bisection(sorted, t0, bracket);
  if (bisectionResult === undefined) {
    return { ok: false, reason: "no-convergence" };
  }

  return { ok: true, value: bisectionResult };
}
