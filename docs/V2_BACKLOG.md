# MF Screener - v2 Backlog

As of 2026-11-01, updated 2026-11-10. These items were deliberately cut from v1 so it ships on free tiers only.

## v1 scope (for reference)

- Screener over Direct-Growth plans (toggle for Regular/IDCW), filters, sortable columns
- Fund detail: NAV chart, trailing + rolling returns, alpha, beta, Sharpe, Sortino, std dev, max drawdown, capture ratios vs category TRI
- Compare 2–5 funds
- SIP/XIRR calculator
- Stack: Next.js on Vercel Hobby · Supabase Postgres (metadata + precomputed metrics) · Supabase Storage (NAV history, gzipped JSON per scheme; R2 adapter kept) · GitHub Actions nightly job (no Oracle account, so no fallback runner)

## Deferred features

- [ ] **Portfolio XIRR**: enter or import transactions and compute XIRR across holdings. Needs transaction storage (and auth if more than one user).
- [ ] **CAS import**: parse CAMS/KFintech Consolidated Account Statement PDFs into transactions.
- [ ] **Holdings and portfolio overlap**: show fund holdings and overlap between funds. Needs a monthly portfolio-disclosure source.

## Data-source upgrades

- [ ] **Replace the TigZig mirror** (unofficial; supplies TER, AUM, benchmark, riskometer, managers) with AMFI's official monthly TER and AUM disclosures.
- [ ] **Historical risk-free rate**: switch from the fixed configurable 6.5% to a 91-day T-bill series.
- [ ] **mfapi.in fallback**: mfapi has no auth and no keyed tier (checked 2026-11-01, https://www.mfapi.in/). If it throttles or goes down, add AMFI's historical NAV report as a second source: `portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=DD-Mon-YYYY&todt=DD-Mon-YYYY`. 3-month ranges worked, a 6-month range was rejected, so fetch in roughly 90-day chunks.

- [ ] **Benchmark TRI history**: v1 uses NAV of a low-cost index fund per index as the benchmark (understates the index by roughly the fund's TER). Add a real TRI source (niftyindices.com needs browser-like requests; decide whether that is acceptable, or find an official/licensed feed) behind the existing `BenchmarkSource` interface. Note: some proxies are young (Nifty 500 proxy had ~458 daily points on 2026-11-01), so 3Y/5Y benchmark-relative metrics for Flexi/Multi/ELSS/Focused are n/a until TRI lands.

## Performance and operations (found 2026-11-10)

- [ ] **Smaller page payloads**: `/` sends ~1.7 MB of HTML and `/compare` ~1.3 MB, mostly the full ~8.4k-fund option list serialized into the page. Replace it with a server-side fund search (e.g. a route handler queried as the user types) and send only the screener rows the current filters need. The heavy compare page also made browser screenshots time out.
- [ ] **NAV storage egress**: each full read of every NAV file is ~170 MB, and nightly precompute reads all of them once a day, so roughly 4-5 GB/month against Supabase's 5 GB free egress. Options: switch `NAV_STORE` to Cloudflare R2 (adapter already exists, no egress fees), or fold precompute into the nightly update pass so each changed series is read only once.
- [ ] **Supabase free-tier pausing**: the project was paused for inactivity on 2026-11-09 and the site went down. Once the nightly job runs daily it should keep the project active; if it pauses again, add an uptime check or upgrade.
- [ ] **Surface precompute read failures in CI**: precompute now logs and skips a NAV series it cannot read (keeping the old metrics) instead of aborting, but the job still exits 0. Fail the step, or report it in the job summary, when failures pass a threshold.
- [ ] **Clearer error page**: the error boundary shows one generic message for every failure. Distinguish "data service unavailable" from "no data yet" (empty `scheme_metrics` before the first precompute) so a fresh deployment does not look broken.

## Infra / scale triggers

| Trigger | Action |
| --- | --- |
| Supabase DB nears 500 MB | Prune or move tables to R2; or upgrade |
| Going public or commercial | Leave Vercel Hobby (non-commercial only); add auth; move rate-limited fetches behind a cache |
| Nightly job exceeds GitHub Actions budget (private repo, ~2,000 min/mo) | Make the repo public or optimize the incremental job |
| Regular/IDCW history needed in full | Already in NAV storage; just extend the screener precompute |
