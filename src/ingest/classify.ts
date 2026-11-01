/**
 * Classification of raw scheme names and SEBI categories into the shape the
 * screener needs: plan (Direct/Regular), option (Growth/IDCW), a normalised
 * category, and a benchmark TRI mapping (see `docs/PLAN.md` "Benchmarks").
 *
 * All of this exists because the upstream sources are messy in specific,
 * recurring ways:
 * - mfapi.in scheme names embed plan/option as free text at the end of the
 *   name (e.g. "... - Direct Plan - Growth"), with no consistent separator.
 * - AMFI's NAVAll.txt gives Plan/Option as their own fields, but the same
 *   SEBI category text appears under two different section-header wordings
 *   ("Equity Scheme -" vs "Equity Schemes -"), and several sub-categories
 *   have their own internal wording drift (see `normalizeCategory`).
 */

export type Plan = "direct" | "regular" | "unknown";
export type Option = "growth" | "idcw" | "unknown";

/**
 * Classifies the plan (Direct vs Regular) from either a full scheme name
 * (mfapi-style, e.g. "Fund - Direct Plan - Growth") or just a raw AMFI Plan
 * fragment (e.g. "Direct Plan"). Returns "unknown" for schemes that predate
 * the 2013 Direct/Regular split, or for AMFI's blank legacy Plan field.
 */
export function classifyPlan(text: string): Plan {
  const DIRECT_OR_REGULAR = /\b(direct|regular)\b/gi;
  let lastMatch: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = DIRECT_OR_REGULAR.exec(text)) !== null) {
    lastMatch = match[1].toLowerCase();
  }
  if (lastMatch === "direct") return "direct";
  if (lastMatch === "regular") return "regular";
  return "unknown";
}

/**
 * Classifies the option (Growth vs IDCW) the same way: the *rightmost*
 * matching keyword wins, because a fund's category can itself contain a
 * misleading keyword earlier in the name (e.g. "ABN AMRO Dividend Yield
 * Fund-Growth Option" is a Growth-option scheme whose category happens to
 * be "Dividend Yield Fund"). Bonus, Payout, and Reinvestment variants are
 * all non-Growth distributions and are bucketed as "idcw", matching the
 * ticket's two-way Growth/IDCW split.
 */
export function classifyOption(text: string): Option {
  const OPTION_TOKEN = /\b(idcw|bonus|dividend|div|growth)\b/gi;
  let lastMatch: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = OPTION_TOKEN.exec(text)) !== null) {
    lastMatch = match[1].toLowerCase();
  }
  if (lastMatch === "growth") return "growth";
  if (lastMatch === "idcw" || lastMatch === "bonus" || lastMatch === "dividend" || lastMatch === "div") {
    return "idcw";
  }
  return "unknown";
}

export type CategoryGroup = "Equity" | "Debt" | "Hybrid" | "Solution Oriented" | "Other" | "Unclassified";

export interface NormalizedCategory {
  /** The original, un-normalised category text, exactly as the source gave it. */
  raw: string;
  group: CategoryGroup;
  /** Canonical sub-category label within the group, e.g. "Large Cap Fund". */
  subCategory: string;
}

const GROUP_PREFIXES: Array<{ group: CategoryGroup; pattern: RegExp }> = [
  { group: "Equity", pattern: /^equity\s+schemes?\s*-\s*/i },
  { group: "Debt", pattern: /^debt\s+schemes?\s*-\s*/i },
  { group: "Hybrid", pattern: /^hybrid\s+schemes?\s*-\s*/i },
  { group: "Solution Oriented", pattern: /^solution\s+oriented\s+schemes?\s*\*{0,2}\s*-\s*/i },
  { group: "Other", pattern: /^other\s+schemes?\s*-\s*/i },
];

/**
 * Known wording variants for the same sub-category, observed directly in
 * AMFI's NAVAll.txt (both the "Equity Scheme -" and "Equity Schemes -"
 * header families; see `src/ingest/__fixtures__/amfi-navall.txt`). Keyed by
 * the lowercased, whitespace-collapsed sub-category text.
 */
const SUB_CATEGORY_SYNONYMS: Record<string, string> = {
  "elss": "ELSS",
  "elss- tax saver fund": "ELSS",
  "elss - tax saver fund": "ELSS",
  "sectoral/ thematic": "Sectoral/Thematic Fund",
  "sectoral fund": "Sectoral/Thematic Fund",
  "thematic fund": "Sectoral/Thematic Fund",
  "dynamic asset allocation or balanced advantage": "Dynamic Asset Allocation / Balanced Advantage Fund",
  "balanced advantage fund/ dynamic asset allocation": "Dynamic Asset Allocation / Balanced Advantage Fund",
  "equity savings": "Equity Savings Fund",
  "equity savings fund": "Equity Savings Fund",
  "multi asset allocation": "Multi Asset Allocation Fund",
  "multi asset allocation fund": "Multi Asset Allocation Fund",
  "fof domestic": "FoF Domestic",
  "fof overseas": "FoF Overseas",
  "other  etfs": "Other ETFs",
  "other etfs": "Other ETFs",
};

function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Normalises a raw SEBI category string (from an AMFI section header or a
 * metadata source) into a `{ group, subCategory }` pair. Unrecognised text
 * (pre-2018 legacy categories like "Income" or "ELSS" with no group prefix)
 * is returned as `group: "Unclassified"` with the original text kept as the
 * sub-category, rather than thrown away or guessed at.
 */
export function normalizeCategory(raw: string): NormalizedCategory {
  const trimmed = collapseWhitespace(raw);

  for (const { group, pattern } of GROUP_PREFIXES) {
    const match = pattern.exec(trimmed);
    if (!match) continue;

    const rest = collapseWhitespace(trimmed.slice(match[0].length));
    const canonical = SUB_CATEGORY_SYNONYMS[rest.toLowerCase()] ?? rest;
    return { raw, group, subCategory: canonical };
  }

  return { raw, group: "Unclassified", subCategory: trimmed };
}

export interface BenchmarkMapping {
  /** Official TRI index name to fetch from niftyindices.com (ticket 08), or null when n/a. */
  triName: string | null;
  /** A low-cost index fund's mfapi scheme code, used by ticket 08 as a NAV-based proxy when the TRI fetch fails. */
  fallbackSchemeCode: number | null;
  /** Short, documented reason for this choice (including every n/a). */
  rationale: string;
}

/**
 * Equity sub-category -> TRI, per `docs/PLAN.md` "Benchmarks":
 * "Large Cap -> Nifty 100 TRI, Mid Cap -> Nifty Midcap 150 TRI, Small Cap ->
 * Nifty Smallcap 250 TRI, Flexi/Multi/ELSS/Focused -> Nifty 500 TRI, Large &
 * Mid -> Nifty LargeMidcap 250 TRI". Value Fund, Contra Fund, and Dividend
 * Yield Fund aren't named in the plan; they're broadly-diversified
 * large/multi-cap-leaning categories like Flexi Cap, so they get the same
 * Nifty 500 TRI treatment by the same reasoning, rather than being left n/a.
 * Sectoral/Thematic funds track dozens of unrelated underlying indices (IT,
 * Pharma, PSU, Infra, ...), so no single TRI fits; use the fund's own
 * declared benchmark from metadata instead.
 *
 * Fallback scheme codes are Direct-Growth, low-cost, large-AMC index funds
 * tracking the matching index (verified on mfapi.in on 2026-11-01); ticket
 * 08 uses these as a NAV-based proxy when the TRI fetch itself fails.
 */
const EQUITY_BENCHMARKS: Record<string, BenchmarkMapping> = {
  "Large Cap Fund": {
    triName: "NIFTY 100 TRI",
    fallbackSchemeCode: 149868, // HDFC NIFTY 100 Index Fund - Direct Plan - Growth
    rationale: "SEBI Large Cap mandate (top 100 by market cap) maps directly to the Nifty 100 index.",
  },
  "Large & Mid Cap Fund": {
    triName: "NIFTY LARGEMIDCAP 250 TRI",
    fallbackSchemeCode: 152482, // ICICI Prudential Nifty LargeMidcap 250 Index Fund - Direct Plan - Growth
    rationale: "SEBI Large & Mid Cap mandate (top 250 by market cap) maps directly to the Nifty LargeMidcap 250 index.",
  },
  "Mid Cap Fund": {
    triName: "NIFTY MIDCAP 150 TRI",
    fallbackSchemeCode: 153089, // UTI Nifty Midcap 150 Index Fund - Direct Plan - Growth
    rationale: "SEBI Mid Cap mandate (101st-250th by market cap) maps directly to the Nifty Midcap 150 index.",
  },
  "Small Cap Fund": {
    triName: "NIFTY SMALLCAP 250 TRI",
    fallbackSchemeCode: 151727, // HDFC NIFTY Smallcap 250 Index Fund - Direct Plan - Growth
    rationale: "SEBI Small Cap mandate (251st onward by market cap) maps directly to the Nifty Smallcap 250 index.",
  },
  "Flexi Cap Fund": {
    triName: "NIFTY 500 TRI",
    fallbackSchemeCode: 153161, // ICICI Prudential Nifty 500 Index Fund - Direct Plan - Growth
    rationale: "Per docs/PLAN.md: unconstrained-mandate categories (Flexi/Multi/ELSS/Focused) use the broad Nifty 500 TRI.",
  },
  "Multi Cap Fund": {
    triName: "NIFTY 500 TRI",
    fallbackSchemeCode: 153161,
    rationale: "Per docs/PLAN.md: unconstrained-mandate categories (Flexi/Multi/ELSS/Focused) use the broad Nifty 500 TRI.",
  },
  "ELSS": {
    triName: "NIFTY 500 TRI",
    fallbackSchemeCode: 153161,
    rationale: "Per docs/PLAN.md: unconstrained-mandate categories (Flexi/Multi/ELSS/Focused) use the broad Nifty 500 TRI.",
  },
  "Focused Fund": {
    triName: "NIFTY 500 TRI",
    fallbackSchemeCode: 153161,
    rationale: "Per docs/PLAN.md: unconstrained-mandate categories (Flexi/Multi/ELSS/Focused) use the broad Nifty 500 TRI.",
  },
  "Value Fund": {
    triName: "NIFTY 500 TRI",
    fallbackSchemeCode: 153161,
    rationale: "Not named in docs/PLAN.md; Value Fund is an unconstrained-mandate equity category like Flexi Cap, so it gets the same broad Nifty 500 TRI treatment rather than being left n/a.",
  },
  "Contra Fund": {
    triName: "NIFTY 500 TRI",
    fallbackSchemeCode: 153161,
    rationale: "Not named in docs/PLAN.md; Contra Fund is an unconstrained-mandate equity category like Flexi Cap, so it gets the same broad Nifty 500 TRI treatment rather than being left n/a.",
  },
  "Dividend Yield Fund": {
    triName: "NIFTY 500 TRI",
    fallbackSchemeCode: 153161,
    rationale: "Not named in docs/PLAN.md; no index fund tracks a dedicated dividend-yield TRI at scale, so the broad Nifty 500 TRI is used as the closest sensible proxy.",
  },
  "Sectoral/Thematic Fund": {
    triName: null,
    fallbackSchemeCode: null,
    rationale: "Sectoral/Thematic funds span dozens of unrelated underlying indices (IT, Pharma, PSU Bank, Infra, ...); no single TRI applies. The fund's own declared benchmark from metadata is shown instead.",
  },
};

const DEBT_RATIONALE =
  "Debt sub-categories differ by duration and credit risk with no single broad TRI appropriate across all of them; benchmark-relative metrics (alpha/beta/R2/tracking error/info ratio) are n/a for Debt funds in v1. The fund's own declared benchmark from metadata is still shown.";

const HYBRID_RATIONALE =
  "Hybrid categories blend equity and debt in fund-specific ratios with no single clean TRI proxy; benchmark-relative metrics are n/a for Hybrid funds in v1. The fund's own declared benchmark from metadata is still shown.";

const OTHER_RATIONALE =
  "Solution Oriented, Other (Index/ETF/FoF), and unclassified legacy categories either already track their own named index/fund directly or have no standard market benchmark; benchmark-relative metrics are n/a. The fund's own declared benchmark from metadata is still shown.";

/**
 * Returns the benchmark TRI mapping for a normalised category. Every branch
 * (including every n/a) carries a short rationale so the choice is
 * documented in code, not just in a design doc. See `docs/PLAN.md`
 * "Benchmarks" for the product-level decision this implements.
 */
export function getBenchmarkMapping(category: NormalizedCategory): BenchmarkMapping {
  if (category.group === "Equity") {
    return (
      EQUITY_BENCHMARKS[category.subCategory] ?? {
        triName: null,
        fallbackSchemeCode: null,
        rationale: `No documented TRI mapping yet for equity sub-category "${category.subCategory}"; falls back to n/a until docs/PLAN.md is updated.`,
      }
    );
  }
  if (category.group === "Debt") {
    return { triName: null, fallbackSchemeCode: null, rationale: DEBT_RATIONALE };
  }
  if (category.group === "Hybrid") {
    return { triName: null, fallbackSchemeCode: null, rationale: HYBRID_RATIONALE };
  }
  return { triName: null, fallbackSchemeCode: null, rationale: OTHER_RATIONALE };
}

export interface SubCategoryBenchmark extends BenchmarkMapping {
  subCategory: string;
}

/**
 * Every equity sub-category that has a benchmark index, in map order.
 * Lets jobs enumerate the indices to ingest without re-deriving the map.
 */
export function listBenchmarkMappings(): SubCategoryBenchmark[] {
  return Object.entries(EQUITY_BENCHMARKS)
    .filter(([, mapping]) => mapping.triName !== null)
    .map(([subCategory, mapping]) => ({ subCategory, ...mapping }));
}
