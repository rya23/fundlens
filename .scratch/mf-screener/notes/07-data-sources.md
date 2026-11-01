# Notes for later agents - 07-data-sources

Branch: `worktree-agent-ade367165fadd82a8` (based on `mf-screener` at commit
`52262ad`, same base as ticket 01's branch - `mf-screener`'s tip has not
moved yet). Worktree:
`<repo>/.claude/worktrees/agent-ade367165fadd82a8`.
Commit: `66829dc`.

## Files

- `src/ingest/http.ts` - shared fetch helper used by every source client:
  `fetchWithRetry`/`fetchJson`/`fetchText`/`fetchArrayBuffer`. Options:
  `fetchImpl` (inject for tests), `retries`, `timeoutMs`, `backoffMs`
  (exponential with jitter), `throttleMs` (politeness delay before the
  request). Retries on network errors and `408/429/500/502/503/504`; not on
  other 4xx. Reuse this for the niftyindices.com TRI client in ticket 08
  instead of rolling another retry loop.
- `src/ingest/csv.ts` - minimal hand-rolled RFC4180 CSV parser (quoted
  fields, embedded commas/newlines, doubled-quote escaping, CRLF/LF/CR
  row separators). Needed because the TigZig export has multi-line quoted
  text columns; `String.split(",")` / `.split("\n")` will not work on it.
- `src/ingest/sources/mfapi.ts` - `MfApiClient` class: `listSchemes({limit,
  offset})`, `getSchemeHistory(code, {startDate, endDate})`,
  `getLatestNavs()`. Throttled (250ms default) and retried by default.
  `getSchemeHistory` throws if mfapi answers with its "unknown code" shape
  (`scheme_code: 0`, empty `data`) rather than an HTTP error - mfapi doesn't
  error on bad codes, it just returns an empty/zeroed payload.
- `src/ingest/sources/amfi-navall.ts` - `parseAmfiNavAll(text): AmfiNavRecord[]`.
  Parses the raw `;`-delimited sections/AMC-headers/rows. Deliberately does
  **not** normalise plan/option/category text - that's `classify.ts`'s job,
  kept separate because AMFI's own file is inconsistent (see below).
  `nav` is `number | null` (null for "N.A."); `plan`/`option` are `null` for
  pre-2013 legacy rows with blank Plan/Option fields; `date` is converted to
  ISO `yyyy-mm-dd`.
- `src/ingest/sources/metadata.ts` - `MetadataSource` interface (`fetchAll():
  Promise<SchemeMetadata[]>`) + `TigZigMetadataSource` implementation.
  **Never throws** - `fetchAll` resolves to `[]` on any failure (network,
  bad gzip, unexpected CSV shape with missing required columns), per the
  ticket's "screener still works with blank TER/AUM" requirement. Also
  exports `parseTigZigCsv` directly if you need the parsing logic without
  the network fetch. Manager names have their "(since YYYY-MM-DD)" tenure
  suffix stripped (tenure itself isn't surfaced yet - `stonk.py`'s
  `mgr_tenure_longest/shortest_yrs` logic was not ported; add it to
  `SchemeMetadata` if a later ticket needs it, it's a one-line addition to
  `parseManagers`'s regex plus a new field).
- `src/ingest/classify.ts` - the piece other tickets will import most:
  - `classifyPlan(text): "direct" | "regular" | "unknown"` and
    `classifyOption(text): "growth" | "idcw" | "unknown"`. Both work on
    **either** a full mfapi-style scheme name (e.g. "Fund - Direct Plan -
    Growth") or a bare AMFI Plan/Option fragment (e.g. "Direct Plan"); same
    function, same rightmost-keyword-wins logic. Important gotcha: some
    SEBI category names contain option-like words (e.g. "Dividend Yield
    Fund" contains "Dividend"), so a naive "contains dividend -> idcw" check
    is wrong - `classifyOption` picks the *rightmost* keyword match in the
    string, which is reliably the actual option since it's always the last
    thing named.
  - `normalizeCategory(raw): { raw, group, subCategory }`. `group` is
    `"Equity" | "Debt" | "Hybrid" | "Solution Oriented" | "Other" |
    "Unclassified"`. AMFI's NAVAll.txt genuinely has two different header
    wordings for the same category ("Equity Scheme - X" vs "Equity Schemes
    - X", "Sectoral/ Thematic" vs "Sectoral Fund"/"Thematic Fund", "Hybrid
    Scheme" vs "Hybrid Schemes", "ELSS" vs "ELSS- Tax Saver Fund", etc.) -
    this function collapses all of them to one canonical `subCategory`
    string per `SUB_CATEGORY_SYNONYMS`. Legacy pre-2018 category headers
    with no group prefix (e.g. "Income", standalone "ELSS", "Growth",
    "Gilt", "Children's Fund - Childrens' Fund" at the top of the file) fall
    through to `group: "Unclassified"` with the raw text kept as
    `subCategory` - these are old closed/legacy schemes, not part of the
    current SEBI taxonomy, and are intentionally not special-cased further.
  - `getBenchmarkMapping(normalizedCategory): { triName, fallbackSchemeCode,
    rationale }`. **This is what ticket 08 should iterate over** to know
    which TRIs to fetch. Equity sub-categories map per `docs/PLAN.md`
    ("Benchmarks"): Large Cap -> NIFTY 100 TRI, Large & Mid Cap -> NIFTY
    LARGEMIDCAP 250 TRI, Mid Cap -> NIFTY MIDCAP 150 TRI, Small Cap -> NIFTY
    SMALLCAP 250 TRI, Flexi/Multi/ELSS/Focused -> NIFTY 500 TRI. Value Fund,
    Contra Fund, and Dividend Yield Fund aren't named in the plan; they got
    the same NIFTY 500 TRI treatment as Flexi Cap (documented inline, same
    reasoning: unconstrained/broad equity mandate) rather than being left
    n/a. Sectoral/Thematic is n/a (too many unrelated underlying indices).
    **All of Debt and Hybrid are n/a** for v1 (documented rationale inline
    in `classify.ts`) - this was a judgment call made in this ticket, not
    explicitly spelled out in `docs/PLAN.md` beyond "pick a sensible index
    or mark as n/a; document the choice"; revisit if the product wants
    debt/hybrid benchmark-relative metrics later. `fallbackSchemeCode` is a
    real Direct-Growth low-cost index fund's mfapi scheme code for each
    mapped equity sub-category (verified live on 2026-11-01), meant for
    ticket 08's "NAV of a low-cost index fund" fallback.

## Fixtures (`src/ingest/__fixtures__/`)

All captured live on 2026-11-01 and truncated, except one hand-added "N.A."
NAV row which is an inline string literal inside `amfi-navall.test.ts`
(not in the fixture file) since AMFI's live file that day had no actual
"N.A." row to truncate down to - flagged with a comment in the test.

- `mfapi-schemes.json`, `mfapi-scheme-history.json` (scheme 122639, Parag
  Parikh Flexi Cap Direct Growth), `mfapi-latest.json`.
- `amfi-navall.txt` - curated (not a single contiguous byte range) but every
  included line is copied verbatim from the real file, including its CRLF
  line endings; sections were hand-picked to cover both category-wording
  variants, a legacy blank-Plan/Option block, and AMC-header continuity.
- `tigzig-scheme-details.csv.gz` - 6 real rows including a multi-line quoted
  exit-load field, a 3-manager row, and a row with several blank columns.

## Gotchas for later tickets

- `tsx` was added as a devDependency (`package.json`/`package-lock.json`
  touched) solely to run `scripts/smoke-sources.ts` by hand
  (`npm run smoke:sources`); it is not wired into `npm test` or the build.
  Expect a trivial `package-lock.json` merge conflict with other tickets -
  take theirs and re-run `npm install --registry=https://registry.npmjs.org/`
  per the implementer brief.
- `src/ingest/sources/mfapi.ts`'s `getSchemeHistory` call signature takes
  `startDate`/`endDate` as opaque strings and passes them straight through
  as query params - it does not validate or reformat them. `docs/PLAN.md`
  says ISO params work against the live API; this was not independently
  re-verified against the real endpoint in this ticket (the smoke script
  only exercises the no-params path).
- Ran `scripts/smoke-sources.ts` once against all three live endpoints
  during implementation (mfapi.in, AMFI NAVAll.txt, TigZig CSV) - all three
  worked. That's the full extent of live verification; everything else is
  fixture-based.
