"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { NavChart, RollingChart, type ChartSeries } from "@/components/fund/chart";
import type { FundData, FundMetric } from "@/lib/fund/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Option = { code: number; name: string; amc: string; subCategory: string | null };
const metricLabels: Record<FundMetric, string> = { cagr: "3Y CAGR", sharpe: "Sharpe ratio", sortino: "Sortino ratio", alpha: "Alpha", beta: "Beta", rSquared: "R²", stdDev: "Volatility", maxDrawdown: "Max drawdown", trackingError: "Tracking error", infoRatio: "Information ratio", upCapture: "Up capture", downCapture: "Down capture" };
const percentMetrics = new Set<FundMetric>(["cagr", "alpha", "stdDev", "maxDrawdown", "trackingError", "upCapture", "downCapture"]);
const lowerIsBetter = new Set<FundMetric>(["stdDev", "trackingError", "downCapture"]);
const rankable = new Set<FundMetric>(["cagr", "sharpe", "sortino", "alpha", "stdDev", "maxDrawdown", "trackingError", "infoRatio", "upCapture", "downCapture"]);

function format(value: number | null, metric: FundMetric) {
  return value === null || !Number.isFinite(value) ? "n/a" : percentMetrics.has(metric) ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
}

export function CompareView({ codes, funds, options }: { codes: string[]; funds: FundData[]; options: Option[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const yearsValue = Number(searchParams.get("years"));
  const years = ([1, 3, 5, 10] as number[]).includes(yearsValue) ? yearsValue as 1 | 3 | 5 | 10 : 3;
  const rollingValue = Number(searchParams.get("rolling"));
  const rollingYears = ([1, 3, 5] as number[]).includes(rollingValue) ? rollingValue as 1 | 3 | 5 : 3;
  const available = useMemo(() => options.filter((option) => !codes.includes(String(option.code)) && `${option.name} ${option.amc} ${option.subCategory ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [codes, options, query]);
  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => params.set(key, value));
    router.push(`/compare?${params.toString()}`);
  };
  const updateCodes = (next: string[]) => updateParams({ codes: next.join(",") });
  const navSeries: ChartSeries[] = funds.map((fund) => ({ name: fund.scheme.name, points: fund.nav.map(({ date, nav }) => ({ date, value: nav })) }));
  const rollingSeries: ChartSeries[] = funds.map((fund) => ({ name: fund.scheme.name, points: fund.rolling[rollingYears].points.map(({ date, cagr }) => ({ date, value: cagr })) }));
  const metrics = Object.keys(metricLabels) as FundMetric[];

  return <div className="min-w-0 space-y-8">
    <section className="grid min-w-0 grid-cols-1 gap-5 border-b border-border pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
      <div className="min-w-0"><h2 className="text-lg font-semibold">Selected funds</h2><ul className="mt-3 min-w-0 space-y-2">{codes.map((code) => {
        const fund = funds.find((item) => String(item.scheme.code) === code);
        return <li key={code} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border px-3 py-2"><div className="min-w-0 flex-1">{fund ? <><Link href={`/fund/${code}`} className="block truncate font-medium underline-offset-4 hover:underline">{fund.scheme.name}</Link><p className="truncate text-xs text-muted-foreground">{fund.scheme.amc} · {fund.scheme.subCategory}</p></> : <span className="text-sm text-muted-foreground">Fund {code} is unavailable</span>}</div><Button className="shrink-0" variant="ghost" size="sm" aria-label={`Remove ${fund?.scheme.name ?? code}`} onClick={() => updateCodes(codes.filter((item) => item !== code))}>Remove</Button></li>;
      })}</ul>{codes.length < 2 && <p className="mt-3 text-sm text-muted-foreground">Add at least two funds to compare them.</p>}{codes.length >= 5 && <p className="mt-3 text-sm text-muted-foreground">Compare up to five funds at a time.</p>}</div>
      <div className="min-w-0"><label htmlFor="fund-search" className="text-sm font-medium">Add a fund</label><Input id="fund-search" type="search" name="fund-search" autoComplete="off" placeholder="Search by name, AMC or category…" className="mt-2 h-10" value={query} onChange={(event) => setQuery(event.target.value)} disabled={codes.length >= 5} />
        {query && codes.length < 5 && <ul className="mt-2 max-h-64 min-w-0 overflow-y-auto rounded-md border border-border" aria-label="Search results">{available.length ? available.map((option) => <li key={option.code} className="border-b last:border-0"><button type="button" className="w-full min-w-0 px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onClick={() => { updateCodes([...codes, String(option.code)]); setQuery(""); }}><span className="block break-words text-sm font-medium">{option.name}</span><span className="block break-words text-xs text-muted-foreground">{option.amc} · {option.subCategory}</span></button></li>) : <li className="px-3 py-3 text-sm text-muted-foreground">No funds match that search.</li>}</ul>}
      </div>
    </section>

    {funds.length >= 2 && <>
      <section className="border-t border-border pt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">NAV growth</h2><p className="text-sm text-muted-foreground">Funds share a common overlap period and are rebased to 100.</p></div><div className="flex gap-1" aria-label="Chart period">{([1, 3, 5, 10] as const).map((window) => <Button key={window} size="sm" variant={years === window ? "secondary" : "ghost"} aria-pressed={years === window} onClick={() => updateParams({ years: String(window) })}>{window}Y</Button>)}</div></div><div className="mt-4"><NavChart funds={navSeries} years={years} /></div></section>
      <section className="border-t border-border pt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Rolling return overlay</h2><p className="text-sm text-muted-foreground">Daily trailing CAGR, one line per fund.</p></div><div className="flex gap-1" aria-label="Rolling return period">{([1, 3, 5] as const).map((window) => <Button key={window} size="sm" variant={rollingYears === window ? "secondary" : "ghost"} aria-pressed={rollingYears === window} onClick={() => updateParams({ rolling: String(window) })}>{window}Y</Button>)}</div></div><div className="mt-4"><RollingChart funds={rollingSeries} windowYears={rollingYears} /></div></section>
      <section className="border-t border-border pt-5"><h2 className="text-lg font-semibold">Metric comparison</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Metric</th>{funds.map((fund) => <th key={fund.scheme.code} className="max-w-56 px-3 py-2 text-right font-medium"><Link href={`/fund/${fund.scheme.code}`} className="line-clamp-2 underline-offset-4 hover:underline">{fund.scheme.name}</Link></th>)}</tr></thead><tbody>{metrics.map((metric) => {
        const values = funds.map((fund) => { const result = fund.risk[years][metric]; return result.ok ? result.value : null; });
        const known = values.filter((value): value is number => value !== null);
        const best = rankable.has(metric) && known.length ? (lowerIsBetter.has(metric) ? Math.min(...known) : Math.max(...known)) : null;
        return <tr key={metric} className="border-b last:border-0"><th scope="row" className="py-2 text-left font-medium">{metric === "cagr" ? `${years}Y CAGR` : metricLabels[metric]}</th>{funds.map((fund, index) => <td key={fund.scheme.code} className={`px-3 py-2 text-right tabular-nums ${values[index] !== null && values[index] === best ? "bg-quartile-1/15 font-semibold text-quartile-1-foreground" : ""}`}>{format(values[index], metric)}{values[index] !== null && values[index] === best ? <span className="sr-only"> best in row</span> : null}</td>)}</tr>;
      })}</tbody></table></div><p className="mt-2 text-xs text-muted-foreground">Best values are highlighted and labeled for assistive technology. Risk and benchmark metrics use the selected {years}Y window.</p></section>
    </>}
  </div>;
}
