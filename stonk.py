#!/usr/bin/env python3
"""
One-off mutual fund screener. Run by hand, get a CSV.

Install:   pip install pandas numpy scipy requests
Examples:
  python mf_screener.py --query "flexi cap"
  python mf_screener.py --query "flexi cap" --query "large cap" --category "Equity Scheme - Flexi Cap Fund"
  python mf_screener.py --query "flexi cap" --min-aum 1000 --max-ter 1.0 --sort sortino_3y
  python mf_screener.py --query "mid cap" --bench-csv nifty_midcap150_tri.csv

What it does:
  1. Searches mfapi.in for schemes matching your queries (Direct + Growth plans only)
  2. Downloads full NAV history for each (cached in ./mf_cache, so re-runs are fast)
  3. Computes trailing CAGR, rolling returns, volatility, Sharpe, drawdown, up/down capture,
     beta/alpha vs a benchmark, and SIP XIRR
  4. Merges TER, AUM, benchmark, exit load and manager tenure (free TigZig mirror of AMFI data,
     unofficial: spot-check against AMC factsheets; use --no-details to skip)
  5. Writes mf_screen.csv (sorted) and prints the top rows

Benchmark: by default uses a Nifty 50 index fund's NAV as a proxy. For better
alpha/beta, download the matching TRI history from niftyindices.com as CSV
(first column = date, second = value) and pass it with --bench-csv.
"""
import argparse
import re
import sys
import time
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy.optimize import brentq

API = "https://api.mfapi.in/mf"
CACHE = Path("mf_cache")
CACHE.mkdir(exist_ok=True)


# ---------- data fetching ----------

def http_get(url, params=None, tries=4):
    for i in range(tries):
        try:
            r = requests.get(url, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def is_direct_growth(name):
    n = name.lower()
    return ("direct" in n and "growth" in n
            and not re.search(r"idcw|dividend|bonus|payout|reinvest", n))


def api_search(query):
    """mfapi's own search: fine for picking one benchmark, but it returns few results."""
    res = http_get(f"{API}/search", params={"q": query})
    return [s for s in res if is_direct_growth(s["schemeName"])]


def all_schemes(page=1000):
    """Full scheme list via /mf pagination, cached for a day."""
    f = CACHE / "_all_schemes.json"
    if f.exists() and (time.time() - f.stat().st_mtime) < 24 * 3600:
        return json.loads(f.read_text())
    out, seen, offset = [], set(), 0
    for _ in range(200):
        batch = http_get(API, params={"limit": page, "offset": offset})
        new = [s for s in batch if s["schemeCode"] not in seen]
        if not new:  # empty page, or API ignoring offset
            break
        seen.update(s["schemeCode"] for s in new)
        out.extend(new)
        offset += len(batch)
    if not out:
        sys.exit("Could not load the scheme list from mfapi.in/mf")
    f.write_text(json.dumps(out))
    print(f"Loaded {len(out)} schemes from mfapi.in")
    return out


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())  # 'Flexi Cap' and 'Flexicap' both -> 'flexicap'


def search(query):
    q = norm(query)
    return [s for s in all_schemes()
            if q in norm(s["schemeName"]) and is_direct_growth(s["schemeName"])]


def fetch_scheme(code, max_age_hours=20):
    f = CACHE / f"{code}.json"
    if f.exists() and (time.time() - f.stat().st_mtime) < max_age_hours * 3600:
        return json.loads(f.read_text())
    data = http_get(f"{API}/{code}")
    f.write_text(json.dumps(data))
    return data


def nav_series(payload):
    df = pd.DataFrame(payload["data"])
    df["date"] = pd.to_datetime(df["date"], format="%d-%m-%Y")
    df["nav"] = pd.to_numeric(df["nav"], errors="coerce")
    df = df.dropna()
    df = df[df["nav"] > 0].drop_duplicates("date").sort_values("date")
    return df.set_index("date")["nav"]


def load_benchmark(args):
    if args.bench_csv:
        df = pd.read_csv(args.bench_csv)
        df.columns = [str(c).strip() for c in df.columns]
        # niftyindices CSVs look like: Index Name, Date, TotalReturnsIndex
        dcol = next((c for c in df.columns if "date" in c.lower()), df.columns[0])
        vcol = (next((c for c in df.columns if re.search(r"total|tri", c, re.I)), None)
                or next((c for c in df.columns if re.search(r"close|value", c, re.I)), None)
                or [c for c in df.columns if c != dcol][-1])
        d = pd.to_datetime(df[dcol], dayfirst=True, errors="coerce")
        v = pd.to_numeric(df[vcol].astype(str).str.replace(",", ""), errors="coerce")
        s = pd.Series(v.values, index=d).dropna()
        s = s[~s.index.isna()].sort_index()
        s = s[~s.index.duplicated()]
        print(f"Using columns: date='{dcol}', value='{vcol}'")
        print(f"Benchmark: {args.bench_csv} ({len(s)} rows)")
        return s
    if args.bench_code:
        code = args.bench_code
    else:
        cands = api_search(args.bench_query)
        if not cands:
            sys.exit(f"No benchmark found for '{args.bench_query}'. Use --bench-code or --bench-csv.")
        print("Benchmark candidates:", *[f"\n  {c['schemeCode']}  {c['schemeName']}" for c in cands[:5]])
        code = cands[0]["schemeCode"]
    payload = fetch_scheme(code)
    print(f"Benchmark: {payload['meta']['scheme_name']} (code {code})")
    return nav_series(payload)


# ---------- metrics ----------

def cagr(nav, years):
    end = nav.index[-1]
    start = end - pd.DateOffset(years=years)
    if nav.index[0] > start:
        return np.nan
    return (nav.iloc[-1] / nav.asof(start)) ** (1 / years) - 1


def rolling_cagr(nav, years):
    idx = nav.index[nav.index >= nav.index[0] + pd.DateOffset(years=years)]
    if len(idx) == 0:
        return pd.Series(dtype=float)
    base = nav.asof(idx - pd.DateOffset(years=years)).values
    return pd.Series((nav.loc[idx].values / base) ** (1 / years) - 1, index=idx)


def xirr(flows):
    t0 = flows[0][0]

    def f(r):
        return sum(a / (1 + r) ** ((d - t0).days / 365.0) for d, a in flows)

    try:
        return brentq(f, -0.99, 10)
    except ValueError:
        return np.nan


def sip_xirr(nav, years, amount=10000):
    end = nav.index[-1]
    start = end - pd.DateOffset(years=years)
    if nav.index[0] > start:
        return np.nan
    flows, units = [], 0.0
    for d in pd.date_range(start, periods=years * 12, freq=pd.DateOffset(months=1)):
        pos = nav.index.searchsorted(d)  # first NAV on/after the SIP date
        if pos >= len(nav):
            break
        units += amount / nav.iloc[pos]
        flows.append((nav.index[pos], -amount))
    flows.append((end, units * nav.iloc[-1]))
    return xirr(flows)


def max_drawdown(nav):
    return (nav / nav.cummax() - 1).min()


def _weekly(nav, bench, years):
    """Weekly returns of fund (f) and benchmark (b) over the last `years`; None if too little data."""
    both = pd.concat([nav, bench], axis=1, join="inner").dropna()
    both.columns = ["f", "b"]
    if both.empty:
        return None
    both = both[both.index >= both.index[-1] - pd.DateOffset(years=years)]
    if len(both) < 200 or both.index[0] > both.index[-1] - pd.DateOffset(years=years, months=-3):
        return None
    w = both.resample("W-FRI").last().ffill().pct_change().dropna()
    return w if len(w) >= 100 else None


def beta_alpha(nav, bench, years, rf):
    w = _weekly(nav, bench, years)
    if w is None:
        return np.nan, np.nan, np.nan
    rfw = (1 + rf) ** (1 / 52) - 1
    y, x = w["f"] - rfw, w["b"] - rfw
    beta = np.cov(y, x, ddof=1)[0, 1] / np.var(x, ddof=1)
    alpha = (y.mean() - beta * x.mean()) * 52  # annualised Jensen's alpha
    r2 = np.corrcoef(y, x)[0, 1] ** 2
    return beta, alpha, r2


MONTH = "ME" if tuple(int(x) for x in pd.__version__.split(".")[:2]) >= (2, 2) else "M"


def _paired(nav, bench, years):
    both = pd.concat([nav, bench], axis=1, join="inner").dropna()
    both.columns = ["f", "b"]
    if both.empty:
        return None
    both = both[both.index >= both.index[-1] - pd.DateOffset(years=years)]
    return both if len(both) >= 200 else None


def capture_ratios(nav, bench, years=3):
    """Upside/downside capture from monthly returns (arithmetic means), in %."""
    both = _paired(nav, bench, years)
    if both is None or both.index[0] > both.index[-1] - pd.DateOffset(years=years, months=-3):
        return np.nan, np.nan
    m = both.resample(MONTH).last().pct_change().dropna()
    up, dn = m[m["b"] > 0], m[m["b"] < 0]
    if len(m) < 30 or len(up) < 8 or len(dn) < 8:
        return np.nan, np.nan
    return up["f"].mean() / up["b"].mean() * 100, dn["f"].mean() / dn["b"].mean() * 100


def excess_cagr(nav, bench, years):
    """Fund CAGR minus benchmark CAGR over the same dates (simple outperformance, not alpha)."""
    end = min(nav.index[-1], bench.index[-1])
    n, b = nav[nav.index <= end], bench[bench.index <= end]
    cf, cb = cagr(n, years), cagr(b, years)
    return cf - cb


def active_stats(nav, bench, years=3):
    """Tracking error (annualised) and information ratio from weekly active returns."""
    w = _weekly(nav, bench, years)
    if w is None:
        return np.nan, np.nan
    active = w["f"] - w["b"]
    te = active.std(ddof=1) * np.sqrt(52)
    return te, (active.mean() * 52 / te if te else np.nan)


def sortino(nav, rf, years=3):
    """(CAGR - rf) / downside deviation, where only daily returns below rf count as risk."""
    end = nav.index[-1]
    if nav.index[0] > end - pd.DateOffset(years=years):
        return np.nan
    r = nav[nav.index >= end - pd.DateOffset(years=years)].pct_change().dropna()
    mar = (1 + rf) ** (1 / 252) - 1
    downside = np.sqrt(np.mean(np.minimum(r - mar, 0) ** 2)) * np.sqrt(252)
    return (cagr(nav, years) - rf) / downside if downside else np.nan


def pct_beat_bench(nav, bench, years):
    """Share of rolling `years`-year windows in which the fund's CAGR beat the benchmark's."""
    j = pd.concat([rolling_cagr(nav, years), rolling_cagr(bench, years)], axis=1, join="inner").dropna()
    return (j.iloc[:, 0] > j.iloc[:, 1]).mean() if len(j) >= 100 else np.nan


def _xirr_arrays(t_years, amounts):
    try:
        return brentq(lambda r: np.sum(amounts * (1 + r) ** (-t_years)), -0.99, 10)
    except ValueError:
        return np.nan


def rolling_sip_xirr(nav, years, amount=10000):
    """XIRR of a monthly SIP started on every month-start that has `years` of history after it.
    Fixes the start-date bias of a single SIP window the same way rolling returns fix CAGR."""
    n = years * 12
    months = pd.date_range(nav.index[0], nav.index[-1], freq="MS")
    if len(months) <= n:
        return np.array([])
    pos = nav.index.searchsorted(months)  # first NAV on/after each month-start
    dates, px = nav.index[pos], nav.values[pos]
    days = np.asarray((dates - dates[0]).days, dtype=float)
    out = []
    for i in range(len(months) - n):
        units = (amount / px[i:i + n]).sum()
        t = (np.append(days[i:i + n], days[i + n]) - days[i]) / 365.0
        a = np.append(np.full(n, -float(amount)), units * px[i + n])
        out.append(_xirr_arrays(t, a))
    return np.array(out)


# ---------- TER / AUM / managers (third-party mirror of AMFI data) ----------

DETAILS_URL = "https://api.tigzig.com/mf/v1/download/scheme_details_latest.csv.gz"


def load_details(max_age_hours=20):
    f = CACHE / "scheme_details_latest.csv.gz"
    if not (f.exists() and (time.time() - f.stat().st_mtime) < max_age_hours * 3600):
        r = requests.get(DETAILS_URL, timeout=120)
        r.raise_for_status()
        f.write_bytes(r.content)
    return pd.read_csv(f, low_memory=False)


def parse_managers(text):
    """'Name (since 2019-05-01); Name2 (since 2023-01-02)' -> (names, longest tenure, shortest tenure) in years."""
    if not isinstance(text, str) or not text.strip():
        return None, np.nan, np.nan
    names, tenures = [], []
    for part in (p.strip() for p in text.split(";") if p.strip()):
        m = re.match(r"(.*?)\s*\(since (\d{4}-\d{2}-\d{2})\)", part)
        names.append(m.group(1).strip() if m else part)
        if m:
            d = pd.to_datetime(m.group(2), errors="coerce")
            if pd.notna(d):
                tenures.append((pd.Timestamp.today() - d).days / 365.25)
    return "; ".join(names), (max(tenures) if tenures else np.nan), (min(tenures) if tenures else np.nan)


def add_details(df):
    """Merge fund AUM, TER, benchmark, riskometer, exit load, fund age and manager tenure by scheme code."""
    try:
        d = load_details()
    except Exception as e:
        print(f"  (skipping TER/AUM/manager data: {e})")
        return df
    d["scheme_code"] = pd.to_numeric(d["scheme_code"], errors="coerce")
    d = d.dropna(subset=["scheme_code"]).drop_duplicates("scheme_code")
    d["scheme_code"] = d["scheme_code"].astype(int)
    d = d.set_index("scheme_code")

    def col(name):
        return d[name] if name in d.columns else pd.Series(np.nan, index=d.index)

    mg = col("ssd_fund_managers").apply(parse_managers)
    allot = pd.to_datetime(col("ssd_allotment_date"), errors="coerce")
    det = pd.DataFrame({
        "aum_cr": col("amfi_daily_fund_aum_cr_all_plans"),   # whole fund, all plans, Rs crore
        "ter_direct": col("ter_direct"),                      # % p.a.; includes brokerage/levies since Apr 2026
        "ter_base_direct": col("ter_ber_direct"),             # base expense ratio only
        "ter_date": col("ter_date"),
        "benchmark": col("amfi_daily_benchmark"),
        "riskometer": col("amfi_daily_riskometer"),
        "exit_load": col("ssd_exit_load"),
        "fund_age_yrs": ((pd.Timestamp.today() - allot).dt.days / 365.25).round(1),
        "managers": mg.map(lambda t: t[0]),
        "mgr_tenure_longest_yrs": mg.map(lambda t: t[1]).round(1),
        "mgr_tenure_shortest_yrs": mg.map(lambda t: t[2]).round(1),
    }, index=d.index)
    df = df.merge(det, left_on=df["code"].astype(int), right_index=True, how="left")
    df = df.drop(columns=["key_0"], errors="ignore")
    print(f"  TER found for {df['ter_direct'].notna().sum()}/{len(df)} funds, "
          f"AUM for {df['aum_cr'].notna().sum()}/{len(df)} (source has gaps; filters drop funds with no data)")
    return df


def add_category_columns(df):
    """Compare each fund with the average of the funds in this run that share its category.
    Only as complete as your --query: use a query that captures the whole category."""
    g = df.groupby("category")
    df["cat_n_funds"] = g["code"].transform("count")
    df["cat_avg_cagr_3y"] = g["cagr_3y"].transform("mean")
    # ratio is meaningless when the category average is zero or negative, so blank it out
    df["cagr_3y_vs_cat"] = np.where(df["cat_avg_cagr_3y"] > 0, df["cagr_3y"] / df["cat_avg_cagr_3y"], np.nan)
    df["cagr_3y_minus_cat"] = df["cagr_3y"] - df["cat_avg_cagr_3y"]  # percentage points
    df["cat_avg_vol_3y"] = g["vol_3y"].transform("mean")
    df["vol_3y_vs_cat"] = df["vol_3y"] / df["cat_avg_vol_3y"]  # below 1 = less volatile than peers
    df["roll3y_median_pctile"] = g["roll3y_median"].rank(pct=True) * 100
    return df


def compute_metrics(nav, bench, rf, hurdle):
    out = {"history_yrs": round((nav.index[-1] - nav.index[0]).days / 365.25, 1),
           "last_nav_date": nav.index[-1].date()}
    for y in (1, 3, 5):
        out[f"cagr_{y}y"] = cagr(nav, y)
    for y in (3, 5):
        r = rolling_cagr(nav, y)
        out[f"roll{y}y_median"] = r.median() if len(r) else np.nan
        out[f"roll{y}y_min"] = r.min() if len(r) else np.nan
        out[f"roll{y}y_pct_above_{int(hurdle * 100)}"] = (r > hurdle).mean() if len(r) else np.nan
    last3 = nav[nav.index >= nav.index[-1] - pd.DateOffset(years=3)]
    full3 = nav.index[0] <= nav.index[-1] - pd.DateOffset(years=3)
    vol = last3.pct_change().std() * np.sqrt(252) if full3 else np.nan
    out["vol_3y"] = vol
    out["sharpe_3y"] = (out["cagr_3y"] - rf) / vol if full3 and vol else np.nan
    last5 = nav[nav.index >= nav.index[-1] - pd.DateOffset(years=5)]
    out["max_dd_5y"] = max_drawdown(last5) if not np.isnan(out["cagr_5y"]) else np.nan
    out["beta_3y"], out["alpha_3y"], out["r2_3y"] = (
        beta_alpha(nav, bench, 3, rf) if bench is not None else (np.nan,) * 3)
    out["sortino_3y"] = sortino(nav, rf, 3)
    if bench is not None:
        out["tracking_error_3y"], out["info_ratio_3y"] = active_stats(nav, bench, 3)
        for y in (3, 5):
            out[f"roll{y}y_pct_beat_bench"] = pct_beat_bench(nav, bench, y)
        out["upside_capture_3y"], out["downside_capture_3y"] = capture_ratios(nav, bench, 3)
        out["excess_cagr_3y"] = excess_cagr(nav, bench, 3)
        out["excess_cagr_5y"] = excess_cagr(nav, bench, 5)
    out["sip_xirr_3y"] = sip_xirr(nav, 3)
    out["sip_xirr_5y"] = sip_xirr(nav, 5)
    for y in (3, 5):
        s_ = rolling_sip_xirr(nav, y)
        s_ = s_[~np.isnan(s_)]
        out[f"sip{y}y_roll_median"] = np.median(s_) if len(s_) else np.nan
        out[f"sip{y}y_roll_min"] = s_.min() if len(s_) else np.nan
        out[f"sip{y}y_roll_pct_beat_rf"] = (s_ > rf).mean() if len(s_) else np.nan  # SIP beat an FD-like return
    return out


def process(code, bench, rf, hurdle, category):
    payload = fetch_scheme(code)
    meta = payload["meta"]
    if category and category.lower() not in str(meta.get("scheme_category", "")).lower():
        return None
    nav = nav_series(payload)
    if len(nav) < 250:
        return None
    row = {"code": code, "name": meta["scheme_name"],
           "category": meta.get("scheme_category"), "fund_house": meta.get("fund_house")}
    row.update(compute_metrics(nav, bench, rf, hurdle))
    return row


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--query", action="append", required=True, help="name search, repeatable (e.g. 'flexi cap')")
    ap.add_argument("--category", help="keep only schemes whose SEBI category contains this text")
    ap.add_argument("--bench-code", help="mfapi scheme code to use as benchmark proxy")
    ap.add_argument("--bench-query", default="UTI Nifty 50 Index", help="search used to pick the default benchmark")
    ap.add_argument("--bench-csv", help="benchmark TRI CSV (date, value); best option for alpha/beta")
    ap.add_argument("--rf", type=float, default=0.065, help="risk-free rate, default 6.5%%")
    ap.add_argument("--hurdle", type=float, default=0.12, help="rolling-return hurdle, default 12%%")
    ap.add_argument("--sort", default="roll3y_median", help="column to sort by (descending)")
    ap.add_argument("--min-aum", type=float, help="drop funds with fund AUM below this (Rs crore); no-data funds are dropped too")
    ap.add_argument("--max-ter", type=float, help="drop funds with Direct-plan TER above this (percent); no-data funds are dropped too")
    ap.add_argument("--no-details", action="store_true", help="skip the TER/AUM/manager download")
    ap.add_argument("--limit", type=int, default=0, help="max schemes to process (0 = all)")
    ap.add_argument("--out", default="mf_screen.csv")
    args = ap.parse_args()

    bench = load_benchmark(args)

    schemes = {}
    for q in args.query:
        for s in search(q):
            schemes[s["schemeCode"]] = s["schemeName"]
    codes = list(schemes)[: args.limit or None]
    print(f"{len(codes)} Direct-Growth schemes matched. Fetching...")

    rows, done = [], 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(process, c, bench, args.rf, args.hurdle, args.category): c for c in codes}
        for fut in as_completed(futs):
            done += 1
            try:
                r = fut.result()
                if r:
                    rows.append(r)
            except Exception as e:
                print(f"  skip {futs[fut]}: {e}")
            if done % 25 == 0:
                print(f"  {done}/{len(codes)}")

    if not rows:
        sys.exit("No schemes produced results. Try a broader --query or drop --category.")
    df = pd.DataFrame(rows)
    pct_cols = [c for c in df.columns if re.search(r"cagr|roll|vol_|max_dd|alpha|xirr|tracking", c)]
    df[pct_cols] = (df[pct_cols] * 100).round(2)
    if not args.no_details:
        df = add_details(df)
    df = add_category_columns(df)
    if args.min_aum is not None and "aum_cr" in df:
        df = df[df["aum_cr"] >= args.min_aum]
    if args.max_ter is not None and "ter_direct" in df:
        df = df[df["ter_direct"] <= args.max_ter]
    if df.empty:
        sys.exit("No funds left after --min-aum / --max-ter filters.")
    df = df.round(3).sort_values(args.sort, ascending=False, na_position="last")
    df.to_csv(args.out, index=False)
    print(f"\nWrote {len(df)} rows to {args.out}\n")
    show = [c for c in ["name", "aum_cr", "ter_direct", "cagr_3y", "roll3y_median", "roll3y_pct_beat_bench",
                        "sharpe_3y", "alpha_3y", "downside_capture_3y", "sip3y_roll_median"] if c in df.columns]
    print(df[show].head(15).to_string(index=False, max_colwidth=32))
    print("\nReminder: past performance ranks history, it doesn't predict the future. "
          "Compare funds within the same category only.")


if __name__ == "__main__":
    main()