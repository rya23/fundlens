# MF Screener - v2 Backlog

As of 2026-11-01. These items were deliberately cut from v1 so it ships on free tiers only.

## v1 scope (for reference)

- Screener over Direct-Growth plans (toggle for Regular/IDCW), filters, sortable columns
- Fund detail: NAV chart, trailing + rolling returns, alpha, beta, Sharpe, Sortino, std dev, max drawdown, capture ratios vs category TRI
- Compare 2–5 funds
- SIP/XIRR calculator
- Stack: Next.js on Vercel Hobby · Supabase Postgres (metadata + precomputed metrics) · Cloudflare R2 (NAV history, gzipped JSON per scheme) · GitHub Actions nightly job (no Oracle account, so no fallback runner)

## Deferred features

- [ ] **Portfolio XIRR**: enter or import transactions and compute XIRR across holdings. Needs transaction storage (and auth if more than one user).
- [ ] **CAS import**: parse CAMS/KFintech Consolidated Account Statement PDFs into transactions.
- [ ] **Holdings and portfolio overlap**: show fund holdings and overlap between funds. Needs a monthly portfolio-disclosure source.

## Data-source upgrades

- [ ] **Replace the TigZig mirror** (unofficial; supplies TER, AUM, benchmark, riskometer, managers) with AMFI's official monthly TER and AUM disclosures.
- [ ] **Historical risk-free rate**: switch from the fixed configurable 6.5% to a 91-day T-bill series.
- [ ] **mfapi.in fallback**: mfapi has no auth and no keyed tier (checked 2026-11-01, https://www.mfapi.in/). If it throttles or goes down, add AMFI's historical NAV report as a second source: `portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=DD-Mon-YYYY&todt=DD-Mon-YYYY`. 3-month ranges worked, a 6-month range was rejected, so fetch in roughly 90-day chunks.

## Infra / scale triggers

| Trigger | Action |
| --- | --- |
| Supabase DB nears 500 MB | Prune or move tables to R2; or upgrade |
| Going public or commercial | Leave Vercel Hobby (non-commercial only); add auth; move rate-limited fetches behind a cache |
| Nightly job exceeds GitHub Actions budget (private repo, ~2,000 min/mo) | Make the repo public or optimize the incremental job |
| Regular/IDCW history needed in full | Already in R2; just extend the screener precompute |
