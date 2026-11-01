import { and, eq, inArray, max } from "drizzle-orm";

import type { Database } from "@/db/client";
import { categoryStats, schemeMetrics, schemes } from "@/db/schema";
import { NUMERIC_COLUMNS } from "./columns";
import { buildCuts, buildRow, type StoredMetrics } from "./rows";
import type { OptionValue, PlanValue, ScreenerData } from "./types";

export interface LoadScreenerOptions {
  plans: readonly PlanValue[];
  options: readonly OptionValue[];
  /** Reference date for fund age; defaults to the metrics snapshot date, else today. */
  today?: string;
}

/**
 * Server-side only (it takes a `Database`, which pulls in the DB drivers).
 * Loads the screener universe for the chosen plan/option combination.
 *
 * Why server-loaded but client-filtered: one Direct-Growth universe is ~2-3k
 * rows x ~25 numbers (a few hundred KB of JSON, ~60 KB gzipped), which the
 * browser filters and sorts in a few milliseconds, so typing in the search
 * box or dragging a slider never waits on a network round trip. Plan/option
 * is the only filter applied here, because toggling Regular and IDCW
 * multiplies the universe 4-6x; everything else (category, AMC, ranges, sort)
 * is client-side over whatever this returns.
 */
export async function loadScreenerData(db: Database, options: LoadScreenerOptions): Promise<ScreenerData> {
  const [{ latest }] = await db.select({ latest: max(schemeMetrics.asOf) }).from(schemeMetrics);
  const asOf = latest ?? null;
  const ageReference = options.today ?? asOf ?? new Date().toISOString().slice(0, 10);

  const joined = await db
    .select({ scheme: schemes, metrics: schemeMetrics })
    .from(schemes)
    .leftJoin(schemeMetrics, eq(schemeMetrics.schemeCode, schemes.schemeCode))
    .where(and(inArray(schemes.plan, [...options.plans]), inArray(schemes.option, [...options.options])));

  const rows = joined.map(({ scheme, metrics }) => {
    const stored: StoredMetrics | undefined = metrics
      ? Object.fromEntries(NUMERIC_COLUMNS.map((c) => [c.id, (metrics as Record<string, unknown>)[c.id] ?? null]))
      : undefined;
    return buildRow(scheme, stored, ageReference);
  });

  const stats = await db.select().from(categoryStats);

  return { rows, cuts: buildCuts(stats), asOf };
}
