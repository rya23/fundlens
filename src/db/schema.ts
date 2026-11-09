import { date, index, integer, numeric, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the MF screener.
 *
 * Kept well under Supabase's 500 MB free-tier limit by design: the only
 * per-day history stored in Postgres is `benchmarkNav` (a handful of
 * benchmarks, not thousands of schemes). Per-scheme NAV history lives in
 * the NavStore (R2 or local filesystem, see ticket 03), not here.
 */

export const planEnum = pgEnum("plan_type", ["direct", "regular"]);
export const optionEnum = pgEnum("option_type", ["growth", "idcw"]);

/**
 * One row per AMFI scheme code (a specific plan/option combination, e.g.
 * "XYZ Flexi Cap Fund - Direct Growth" and "- Direct IDCW" are separate
 * rows with their own scheme codes). Relatively static metadata, refreshed
 * by the metadata adapter (ticket 07); `metadataUpdatedAt` tracks that.
 */
export const schemes = pgTable(
  "schemes",
  {
    /** AMFI scheme code - the natural key, not a surrogate id. */
    schemeCode: integer("scheme_code").primaryKey(),
    /**
     * AMFI's NAVAll.txt carries two ISIN columns per row ("ISIN Div
     * Payout/ISIN Growth" and "ISIN Div Reinvestment"); both can be absent
     * for very old or discontinued schemes.
     */
    isinGrowthOrPayout: text("isin_growth_or_payout"),
    isinReinvestment: text("isin_reinvestment"),
    name: text("name").notNull(),
    amc: text("amc").notNull(),
    /** Broad SEBI category, e.g. "Equity", "Debt", "Hybrid". */
    category: text("category").notNull(),
    /**
     * Specific SEBI scheme type, e.g. "Flexi Cap Fund", "Large Cap Fund".
     * Peer quartiles (categoryStats) and the category -> benchmark mapping
     * (ticket 07's classify.ts) key off this finer value, not `category`.
     */
    subCategory: text("sub_category"),
    plan: planEnum("plan").notNull(),
    option: optionEnum("option").notNull(),
    /**
     * `mode: "string"` everywhere a column is a pure calendar date (no time
     * component): a JS `Date` implies a timezone and a time-of-day that
     * doesn't exist for "the NAV date was 2026-03-14", so an ISO
     * `YYYY-MM-DD` string round-trips exactly with no off-by-one-day risk.
     */
    inceptionDate: date("inception_date", { mode: "string" }),
    /** The fund's own declared benchmark, for display only (free text). */
    officialBenchmarkName: text("official_benchmark_name"),
    /** Total expense ratio, percent per annum (e.g. 0.450 = 0.45%). */
    terPct: numeric("ter_pct", { mode: "number", precision: 6, scale: 3 }),
    /** Assets under management, INR crore. */
    aumCr: numeric("aum_cr", { mode: "number", precision: 14, scale: 2 }),
    riskometer: text("riskometer"),
    /** Free-form description; exit load terms are rarely a single number. */
    exitLoad: text("exit_load"),
    /** "; "-joined manager names. */
    managers: text("managers"),
    metadataUpdatedAt: timestamp("metadata_updated_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("schemes_category_idx").on(table.category),
    index("schemes_sub_category_idx").on(table.subCategory),
    index("schemes_amc_idx").on(table.amc),
    index("schemes_plan_option_idx").on(table.plan, table.option),
  ]
);

export const benchmarkKindEnum = pgEnum("benchmark_kind", ["tri", "index_fund_proxy"]);

/**
 * Each SEBI sub-category maps to one of these (classify.ts, ticket 07):
 * the proper TRI where available, or an index fund tracking that index as
 * a fallback when TRI history can't be fetched. `id` is a stable slug
 * (e.g. "nifty500-tri"), not a surrogate id, so seed data and fixtures can
 * reference it directly.
 */
export const benchmarks = pgTable("benchmarks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: benchmarkKindEnum("kind").notNull(),
  /** Where the series comes from, e.g. "niftyindices.com" or a scheme code. */
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/**
 * Daily benchmark levels. The only per-day history kept in Postgres - a
 * few dozen benchmarks over many years is trivial next to the 500 MB
 * budget, unlike per-scheme NAV history (thousands of schemes, which lives
 * in the NavStore instead).
 */
export const benchmarkNav = pgTable(
  "benchmark_nav",
  {
    benchmarkId: text("benchmark_id")
      .notNull()
      .references(() => benchmarks.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    value: numeric("value", { mode: "number", precision: 18, scale: 6 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.benchmarkId, table.date] })]
);

/** Shorthand for a nullable ratio/percentage column, consistent precision. */
function ratio(name: string) {
  return numeric(name, { mode: "number", precision: 10, scale: 4 });
}

/**
 * One row per scheme: every *computed* screener metric from PLAN.md,
 * default columns and column-picker ones alike (Fund/Category/AUM/TER/
 * Riskometer/Exit Load/Fund Age are metadata, not computed metrics - they
 * stay on `schemes` and are joined in, not duplicated here). Overwritten
 * in place each precompute run (ticket 10), not a history table - `asOf` /
 * `navLastDate` just say how fresh the snapshot is.
 *
 * Per PLAN.md's defaults: risk ratios use a 3Y window, max drawdown 5Y.
 * Nullable throughout: a metric is "n/a" (e.g. too little history, no sign
 * change for XIRR) by being null, never by a sentinel or NaN.
 */
export const schemeMetrics = pgTable(
  "scheme_metrics",
  {
    schemeCode: integer("scheme_code")
      .primaryKey()
      .references(() => schemes.schemeCode, { onDelete: "cascade" }),
    asOf: date("as_of", { mode: "string" }).notNull(),
    navLastDate: date("nav_last_date", { mode: "string" }),

    // Trailing CAGR.
    cagr1y: ratio("cagr_1y"),
    cagr3y: ratio("cagr_3y"),
    cagr5y: ratio("cagr_5y"),
    cagr10y: ratio("cagr_10y"),

    // Rolling CAGR, 3Y daily windows (default screener column is the
    // median; "% of windows beating the benchmark" is a column-picker one).
    rolling3yCagrMedian: ratio("rolling_3y_cagr_median"),
    pctRolling3yBeatBenchmark: ratio("pct_rolling_3y_beat_benchmark"),

    // Risk ratios, 3Y window.
    sharpe3y: ratio("sharpe_3y"),
    sortino3y: ratio("sortino_3y"),
    alpha3y: ratio("alpha_3y"),
    beta3y: ratio("beta_3y"),
    rSquared3y: ratio("r_squared_3y"),
    stdDev3y: ratio("std_dev_3y"),
    trackingError3y: ratio("tracking_error_3y"),
    infoRatio3y: ratio("info_ratio_3y"),

    // Max drawdown, 5Y window; stored as a negative percentage.
    maxDrawdown5y: ratio("max_drawdown_5y"),

    // Up/down capture, monthly full-month returns, 3Y window.
    upCapture3y: ratio("up_capture_3y"),
    downCapture3y: ratio("down_capture_3y"),

    // SIP XIRR.
    sipXirr3y: ratio("sip_xirr_3y"),
    sipXirr5y: ratio("sip_xirr_5y"),

    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("scheme_metrics_as_of_idx").on(table.asOf),
    // Indexed: the default screener columns (sorted/range-filtered most
    // often). Column-picker-only metrics are left unindexed - the whole
    // universe of Indian MF schemes is a few thousand rows, well within
    // Postgres full-scan territory, so this is a deliberate "index the
    // common case" choice, not an oversight.
    index("scheme_metrics_cagr_1y_idx").on(table.cagr1y),
    index("scheme_metrics_cagr_3y_idx").on(table.cagr3y),
    index("scheme_metrics_cagr_5y_idx").on(table.cagr5y),
    index("scheme_metrics_rolling_3y_cagr_median_idx").on(table.rolling3yCagrMedian),
    index("scheme_metrics_sharpe_3y_idx").on(table.sharpe3y),
    index("scheme_metrics_alpha_3y_idx").on(table.alpha3y),
    index("scheme_metrics_beta_3y_idx").on(table.beta3y),
    index("scheme_metrics_max_drawdown_5y_idx").on(table.maxDrawdown5y),
  ]
);

/**
 * Quartile cut points for one (category, metric) pair, recomputed each
 * precompute run (ticket 10) over the *full* SEBI category, never a
 * filtered subset (per PLAN.md). `category` holds the same string as
 * `schemes.subCategory` - the fine-grained SEBI type peers are actually
 * compared within. `metric` is a scheme_metrics column key, e.g.
 * "cagr3y" (kept as free text rather than an enum so ticket 06's peers.ts
 * can add a metric without a migration). A current snapshot, not a
 * history table - only `asOf` records freshness.
 */
export const categoryStats = pgTable(
  "category_stats",
  {
    category: text("category").notNull(),
    metric: text("metric").notNull(),
    /** Funds with a non-null value for this metric in this category. */
    count: integer("count").notNull(),
    cutQ1: ratio("cut_q1"),
    cutQ2: ratio("cut_q2"),
    cutQ3: ratio("cut_q3"),
    asOf: date("as_of", { mode: "string" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.category, table.metric] })]
);

/**
 * Per-scheme ingestion bookkeeping, so the backfill (ticket 09) and nightly
 * job (ticket 11) can resume/retry without re-scanning everything: "what's
 * the newest NAV date we already have in the NavStore for this scheme,
 * when did we last try, and did that attempt fail".
 */
export const ingestState = pgTable("ingest_state", {
  schemeCode: integer("scheme_code")
    .primaryKey()
    .references(() => schemes.schemeCode, { onDelete: "cascade" }),
  lastNavDate: date("last_nav_date", { mode: "string" }),
  /** NAV stored for `lastNavDate`, so the nightly job can spot same-day corrections without reading the series. */
  lastNav: numeric("last_nav", { mode: "number" }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
