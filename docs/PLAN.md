# MF Screener - v1 Plan (source of truth)

Settled with the owner on 2026-11-01. Implementation agents: read this whole file first. Deferred work lives in `docs/V2_BACKLOG.md`; add to it rather than building deferred items.

## Product

- Indian mutual funds only (AMFI-registered schemes). Tickertape-style screener with **every feature free**. No billing, no tiers.
- Personal tool: **no login**, no multi-tenant concerns.
- Default universe: **Direct + Growth** plans; a toggle shows Regular / IDCW.

## v1 surfaces

1. **Screener** (`/`): TanStack Table over all funds.
   - Default columns: Fund, Category, AUM, TER, 1Y/3Y/5Y CAGR, 3Y Rolling (median), Sharpe, Alpha, Beta, Max DD.
   - Column picker for: Sortino, Std Dev, R², Tracking Error, Info Ratio, Up/Down capture, % rolling windows beating benchmark, 3Y/5Y SIP XIRR, Riskometer, Exit Load, Fund Age.
   - Filters: category/sub-category, AMC, riskometer, plan (multi-select); range (slider + min/max inputs) on any numeric column; name search.
   - Preset screens (e.g. "Consistent large caps", "Low-cost index funds", "High alpha mid/small").
   - Screen state lives **in the URL query string** (shareable, no DB table).
   - Cells colour-coded by category quartile.
2. **Fund detail** (`/fund/[schemeCode]`): NAV chart vs benchmark, trailing returns (1/3/5/10Y), rolling returns (1/3/5Y windows: distribution + min/median/max + % beating benchmark), alpha, beta, R², Sharpe, Sortino, std dev, max drawdown, tracking error, info ratio, up/down capture. Window switcher 1/3/5/10Y. Each metric shows category quartile + percentile ("Q1 · 87th pct in Flexi Cap"). Metadata: AMC, TER, AUM, benchmark, riskometer, exit load, managers, inception.
3. **Compare** (`/compare?codes=...`): 2-5 funds side by side, overlaid NAV (rebased to 100) and rolling-return charts, metric table.
4. **SIP / XIRR calculator** (`/tools/sip`): fund, monthly amount, start/end dates; outputs invested, current value, XIRR, cashflow chart. Computed live.

## Metric defaults and math (correctness first; `stonk.py` is only a loose reference, its math is NOT authoritative)

- Trailing CAGR 1/3/5/10Y: `(NAV_end / NAV_asof(end - N years))^(1/N) - 1`, using the last available NAV on or before the start date.
- Rolling CAGR 1/3/5Y on daily windows.
- Risk ratios default window 3Y; max drawdown 5Y.
- Risk-free rate: **single configurable constant, default 6.5%**.
- Annualise volatility from daily log or simple returns consistently (sqrt(252)); Sharpe and Sortino use **annualised arithmetic mean excess return over the same daily series** (not CAGR / daily vol).
- Beta / alpha / R² / tracking error / info ratio: weekly (Friday) returns, excess of rf, regression vs benchmark TRI; annualise with 52.
- Up/down capture: monthly returns, **full months only**, **geometric** means.
- XIRR: Newton-Raphson with bisection fallback; when it fails to converge, return a typed "n/a" with a reason (never silent NaN).
- Peer quartiles/percentiles computed **within the full SEBI category**, not a subset.
- Tests: Vitest with hand-computed fixtures plus a few public cross-checks (e.g. a fund's 3Y CAGR on a given date vs AMFI NAVs).

## Benchmarks

- Map each SEBI category to its proper **TRI** (Large Cap -> Nifty 100 TRI, Mid Cap -> Nifty Midcap 150 TRI, Small Cap -> Nifty Smallcap 250 TRI, Flexi/Multi/ELSS/Focused -> Nifty 500 TRI, Large & Mid -> Nifty LargeMidcap 250 TRI, etc.). History from niftyindices.com.
- Fallback when TRI fetch fails: NAV of a low-cost index fund tracking that index.
- Debt/hybrid categories: pick a sensible index or mark benchmark-relative metrics as n/a; document the choice.
- Also display the fund's own official benchmark from metadata.

## Data sources (verified 2026-11-01)

- **mfapi.in**: no auth, no keyed tier, no documented rate limit. `GET /mf` (supports `limit`/`offset`), `GET /mf/{code}` (full history; `startDate`/`endDate` ISO params work), `GET /mf/latest` (all latest NAVs, ~11 MB JSON). Use for **backfill**; throttle politely and retry with backoff.
- **AMFI NAVAll.txt** (`https://portal.amfiindia.com/spages/NAVAll.txt`, `;`-separated) for the **nightly** increment. Fallback: mfapi `/mf/latest`.
- **Fund metadata** (TER, AUM, benchmark, riskometer, exit load, managers, inception): unofficial TigZig mirror of AMFI data, used by `stonk.py` (see its `details` loader near line 310). Wrap behind a `MetadataSource` adapter; if it fails, screener still works with blank TER/AUM.

## Architecture (free tiers only)

| Piece | Choice | Limit to respect |
| --- | --- | --- |
| Web app | Next.js (latest stable, App Router) + TypeScript on **Vercel Hobby** | non-commercial; functions max 300 s |
| DB | **Supabase Postgres** (scheme metadata, precomputed screener metrics, category stats, benchmark history) | **500 MB**; pauses after 7 days idle (nightly job keeps it awake) |
| NAV history | **Cloudflare R2**: one gzipped JSON per scheme (`nav/{schemeCode}.json.gz`) | 10 GB, 1M class A / 10M class B ops per month |
| Jobs | **GitHub Actions** scheduled workflow (nightly) + manual backfill workflow | 6 h max per job |
| Oracle | not available; no fallback runner | |

- Nightly job: fetch NAVAll -> append to R2 files of changed schemes -> recompute screener metrics -> upsert into Supabase -> recompute category quartiles.
- Backfill: one-off, **idempotent and resumable per scheme** (skips schemes already in R2 and up to date).
- Fund detail pages compute heavy series (full rolling-return distributions) server-side on demand from R2 and cache ~24h (Next.js caching). SIP calculator computes live.
- ORM: Drizzle with Postgres. Migrations additive-first.

## Stack

Next.js + TypeScript + Tailwind + shadcn/ui, TanStack Table, Recharts, Vitest. Design: follow the design skills in `.claude/skills/` (data-dense, dark/light toggle, desktop-first, responsive).

## Build phases (each phase: one subagent, then a review gate)

1. Scaffold + DB schema (Drizzle) + env config (`.env.example`; never read `.env`).
2. Metrics library (pure TS, `src/lib/metrics/`) + Vitest. Parallel with 3.
3. Ingestion: backfill, nightly job, metadata adapter, benchmark TRIs, GitHub Actions workflows. Parallel with 2.
4. Screener page + API.
5. Fund detail + compare.
6. SIP calculator + polish + E2E check of the UI.

## House rules

- Never use the em dash character; use "-".
- Commits happen only on ticket branches and the `mf-screener` integration branch (implement-spec workflow); never push; never add an AI co-author trailer.
- Never `lint --fix` / `prettier --write` over the whole tree.
- Fix lint errors, failing tests and flakiness you see, even if unrelated.
