# Benchmarks

Alpha, beta, R-squared, tracking error, information ratio, capture ratios and
"% of rolling windows beating the benchmark" are all measured against a
benchmark series per SEBI category.

## Current state: index-fund proxies (TRI pending)

**A total-return-index (TRI) history source is pending the owner's decision.**
Until then no TRI is fetched and the app does not contact niftyindices.com at
all. Each benchmark's history is instead the **NAV of a low-cost index fund**
tracking that index, fetched through the existing mfapi.in client
(`src/ingest/sources/mfapi.ts`) and stored with kind `index_fund_proxy`
(`benchmarks.kind`; the "index-fund-proxy" kind of the ticket).

Consequences to keep in mind when reading the numbers:

- **A proxy understates the index by roughly the fund's TER** (plus a little
  tracking error). Direct-plan Nifty index funds charge about 0.1% to 0.4% a
  year, so funds look slightly better against a proxy than against the true TRI
  (alpha is biased up by about that much, "% windows beating" likewise).
- **History only goes back to the proxy fund's launch**, which for the newer
  index funds is short. Measured on 2026-11-01: Nifty 100 about 1150 daily
  points (4.5 years), Smallcap 250 about 870, LargeMidcap 250 about 650,
  Midcap 150 about 470 and Nifty 500 about 460 (under 2 years), so 3Y/5Y
  benchmark-relative metrics are n/a for categories on the younger proxies
  until they accumulate history.
  Rolling and risk metrics then cover only the overlap with the fund's own NAV
  history; a 5Y window can be n/a for a long-lived fund against a young proxy.
- The stored `benchmarks.source` is `mfapi:<scheme code>`, so the UI can say
  which fund was used.

## Mapping

The category -> index -> proxy-fund mapping lives in
`src/ingest/classify.ts` (`getBenchmarkMapping`, `listBenchmarkMappings`);
`src/ingest/benchmarks.ts` derives one benchmark per distinct index
(`listBenchmarkDefinitions`, id = kebab-case index name, e.g.
`nifty-500-tri`, via `benchmarkId`).

| Index (benchmark id) | Categories | Proxy fund (mfapi code) |
| --- | --- | --- |
| NIFTY 100 TRI (`nifty-100-tri`) | Large Cap | HDFC NIFTY 100 Index Fund, Direct Growth (149868) |
| NIFTY LARGEMIDCAP 250 TRI (`nifty-largemidcap-250-tri`) | Large & Mid Cap | ICICI Pru Nifty LargeMidcap 250 Index Fund, Direct Growth (152482) |
| NIFTY MIDCAP 150 TRI (`nifty-midcap-150-tri`) | Mid Cap | UTI Nifty Midcap 150 Index Fund, Direct Growth (153089) |
| NIFTY SMALLCAP 250 TRI (`nifty-smallcap-250-tri`) | Small Cap | HDFC NIFTY Smallcap 250 Index Fund, Direct Growth (151727) |
| NIFTY 500 TRI (`nifty-500-tri`) | Flexi, Multi, ELSS, Focused, Value, Contra, Dividend Yield | ICICI Pru Nifty 500 Index Fund, Direct Growth (153161) |

### Debt, hybrid, sectoral/thematic and other

These have **no benchmark** (`getBenchmarkMapping` returns null): debt categories
differ by duration and credit risk with no single broad index, hybrids blend
equity and debt in fund-specific ratios, sectoral/thematic funds span dozens of
unrelated indices, and solution-oriented/index/ETF/FoF categories either track
their own index or have no market benchmark. Benchmark-relative metrics are
n/a for them in v1; the fund's own declared benchmark (from metadata) is still
displayed. Full rationale strings are in `classify.ts`.

## Ingestion

`npm run benchmarks` (also run by the nightly job) calls `ingestBenchmarks`:

- Sources are an ordered list of `BenchmarkSource` (`fetchHistory(definition)`
  returns the history or throws). The first one that yields data wins; a
  failing source falls through to the next.
- Incremental: if the stored kind and source match, only dates newer than the
  latest stored date are inserted.
- Replacement: when the kind or source changes (new proxy fund code, or a TRI
  source arriving), the whole history is swapped in one transaction, since
  levels from different series are not comparable.
- Never downgrades: stored `tri` history is not replaced by a proxy, and if
  every acceptable source fails the stored data is kept and the run reports
  that benchmark as failed (non-zero exit from the script).

## Adding a TRI source later

Implement `BenchmarkSource` with `kind = "tri"` (it receives the definition's
index `name`, e.g. "NIFTY 500 TRI"), and put it ahead of
`IndexFundProxySource` in the `sources` list in `scripts/benchmarks.ts` (and
the nightly job). No schema change is needed: the enum already has `tri`, and
the next run replaces the proxy history with the TRI history. Until the owner
decides, no TRI client code exists in this repository.
