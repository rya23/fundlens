"use client";

import { useState } from "react";
import { NavChart, RollingChart, RollingDistributionChart, type ChartSeries } from "@/components/fund/chart";
import type { FundData, FundMetric, FundWindow } from "@/lib/fund/data";
import { Button } from "@/components/ui/button";

const windows = [1, 3, 5, 10] as const;
const rollingWindows = [1, 3, 5] as const;
const metricLabels: Record<FundMetric, string> = {
  cagr: "CAGR", sharpe: "Sharpe ratio", sortino: "Sortino ratio", alpha: "Alpha", beta: "Beta", rSquared: "R²", stdDev: "Volatility", maxDrawdown: "Max drawdown", trackingError: "Tracking error", infoRatio: "Information ratio", upCapture: "Up capture", downCapture: "Down capture",
};
const percentMetrics = new Set<FundMetric>(["cagr", "alpha", "stdDev", "maxDrawdown", "trackingError"]);

function format(value: number | null | undefined, metric: FundMetric) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const number = percentMetrics.has(metric) ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
  return number;
}

function MetricRows({ data, years }: { data: FundData; years: FundWindow }) {
  const selected = data.risk[years];
  const metrics = Object.keys(metricLabels) as FundMetric[];
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Metric</th><th className="py-2 text-right font-medium">Value</th><th className="py-2 text-right font-medium">Category rank</th></tr></thead>
        <tbody>{metrics.map((metric) => {
          const result = selected[metric];
          const rank = data.peers[metric];
          const value = result.ok ? result.value : null;
          return <tr key={metric} className="border-b last:border-0">
            <th scope="row" className="py-2 text-left font-normal">{metricLabels[metric]}</th>
            <td className="py-2 text-right tabular-nums">{format(value, metric)}</td>
            <td className="py-2 text-right text-muted-foreground">{rank && rank.window === years ? `Q${rank.quartile} · ${Math.round(rank.percentile)}th pct in ${data.scheme.subCategory}` : "n/a"}</td>
          </tr>;
        })}</tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">Category ranks use the stored peer snapshot (3Y risk metrics; 5Y max drawdown). Selected-window rankings are not available for every window.</p>
    </div>
  );
}

export function FundDetailView({ data }: { data: FundData }) {
  const [years, setYears] = useState<FundWindow>(3);
  const [rollingYears, setRollingYears] = useState<1 | 3 | 5>(3);
  const chartSeries: ChartSeries[] = [
    { name: data.scheme.name, points: data.nav.map(({ date, nav }) => ({ date, value: nav })) },
    ...(data.benchmark ? [{ name: `${data.benchmark.name} (${data.benchmark.kind === "tri" ? "TRI" : "index fund proxy"})`, points: data.benchmarkNav.map(({ date, nav }) => ({ date, value: nav })) }] : []),
  ];
  const rollingData = data.rolling[rollingYears];
  const rollingSeries: ChartSeries[] = [
    { name: data.scheme.name, points: rollingData.points.map(({ date, cagr }) => ({ date, value: cagr })) },
    ...(data.benchmark ? [{ name: `${data.benchmark.name} proxy`, points: rollingData.benchmarkPoints.map(({ date, cagr }) => ({ date, value: cagr })) }] : []),
  ];
  const trailing = windows.map((window) => data.trailing[window]);
  return <div className="min-w-0 space-y-8">
    <section aria-labelledby="nav-heading" className="min-w-0 border-t border-border pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="nav-heading" className="text-lg font-semibold">NAV growth</h2><p className="text-sm text-muted-foreground">Fund and category benchmark, rebased to 100 at the start of the selected period.</p></div>
        <div className="flex gap-1" aria-label="Chart period">{windows.map((window) => <Button key={window} size="sm" variant={years === window ? "secondary" : "ghost"} aria-pressed={years === window} onClick={() => setYears(window)}>{window}Y</Button>)}</div>
      </div>
      <div className="mt-4"><NavChart funds={chartSeries} years={years} /></div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{windows.map((window, index) => <div key={window} className="border-l-2 border-chart-1 pl-3"><p className="text-xs text-muted-foreground">{window}Y CAGR</p><p className="mt-1 text-lg font-semibold tabular-nums">{format(trailing[index].ok ? trailing[index].value : null, "cagr")}</p></div>)}</div>
    </section>

    <section aria-labelledby="rolling-heading" className="min-w-0 border-t border-border pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="rolling-heading" className="text-lg font-semibold">Rolling returns</h2><p className="text-sm text-muted-foreground">Daily rolling CAGR windows show the range of outcomes over time.</p></div><div className="flex gap-1" aria-label="Rolling return period">{rollingWindows.map((window) => <Button key={window} size="sm" variant={rollingYears === window ? "secondary" : "ghost"} aria-pressed={rollingYears === window} onClick={() => setRollingYears(window)}>{window}Y</Button>)}</div></div>
      <div className="mt-4"><RollingChart funds={rollingSeries} windowYears={rollingYears} /></div>
      <h3 className="mt-5 text-sm font-semibold">Return distribution</h3><p className="mt-1 text-xs text-muted-foreground">Count of daily rolling windows in each annualized return range.</p><div className="mt-2"><RollingDistributionChart series={rollingSeries} /></div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Minimum</p><p className="mt-1 font-semibold tabular-nums">{format(rollingData.min, "cagr")}</p></div><div><p className="text-xs text-muted-foreground">Median</p><p className="mt-1 font-semibold tabular-nums">{format(rollingData.median, "cagr")}</p></div><div><p className="text-xs text-muted-foreground">Maximum</p><p className="mt-1 font-semibold tabular-nums">{format(rollingData.max, "cagr")}</p></div><div><p className="text-xs text-muted-foreground">Windows beating benchmark</p><p className="mt-1 font-semibold tabular-nums">{format(rollingData.pctBeatBenchmark, "cagr")}</p></div></div>
    </section>

    <section aria-labelledby="risk-heading" className="min-w-0 border-t border-border pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="risk-heading" className="text-lg font-semibold">Risk and benchmark metrics</h2><p className="text-sm text-muted-foreground">Selected window: {years} years. n/a means the available history cannot support the calculation.</p></div><div className="flex gap-1" aria-label="Risk metric period">{windows.map((window) => <Button key={window} size="sm" variant={years === window ? "secondary" : "ghost"} aria-pressed={years === window} onClick={() => setYears(window)}>{window}Y</Button>)}</div></div>
      <div className="mt-4"><MetricRows data={data} years={years} /></div>
    </section>

    <section aria-labelledby="details-heading" className="min-w-0 border-t border-border pt-5"><h2 id="details-heading" className="text-lg font-semibold">Fund details</h2><dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
      ["AMC", data.scheme.amc], ["Category", data.scheme.subCategory], ["Plan", `${data.scheme.plan} · ${data.scheme.option}`], ["Inception", data.scheme.inceptionDate ?? "n/a"], ["TER", data.scheme.terPct == null ? "n/a" : `${data.scheme.terPct.toFixed(3)}%`], ["AUM", data.scheme.aumCr == null ? "n/a" : `₹${new Intl.NumberFormat("en-IN").format(data.scheme.aumCr)} crore`], ["Riskometer", data.scheme.riskometer ?? "n/a"], ["Exit load", data.scheme.exitLoad ?? "n/a"], ["Fund managers", data.scheme.managers ?? "n/a"], ["Official benchmark", data.scheme.officialBenchmarkName ?? "n/a"], ["Benchmark used", data.benchmark ? `${data.benchmark.name} (${data.benchmark.kind === "tri" ? "official TRI" : "index fund proxy"})` : "n/a"],
    ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words font-medium">{value}</dd></div>)}</dl></section>
  </div>;
}
