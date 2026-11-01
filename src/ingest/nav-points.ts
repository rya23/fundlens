import type { NavPoint } from "@/lib/nav-store";
import { mfapiDateToIso } from "./schemes";
import type { MfApiNavPoint } from "./sources/mfapi";

/**
 * Converts mfapi's `{date: "DD-MM-YYYY", nav: "12.3400"}` rows into NavPoints.
 * Rows with a malformed date or a non-positive/non-numeric NAV are dropped
 * (mfapi occasionally serves "0.00000" placeholders); ordering and dedupe are
 * the NavStore's job.
 */
export function toNavPoints(rows: readonly MfApiNavPoint[]): NavPoint[] {
  const out: NavPoint[] = [];
  for (const row of rows) {
    const date = mfapiDateToIso(row.date);
    const nav = Number(row.nav);
    if (date === null || !Number.isFinite(nav) || nav <= 0) continue;
    out.push({ date, nav });
  }
  return out;
}
