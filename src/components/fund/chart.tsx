"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { subtractYears } from "@/lib/metrics/series";

export type ChartPoint = { date: string; value: number | null };
export type ChartSeries = { name: string; points: ChartPoint[] };

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Chart({ series, percent = false, emptyLabel, description }: { series: ChartSeries[]; percent?: boolean; emptyLabel: string; description: string }) {
  const { data, keys } = useMemo(() => {
    const dates = new Set<string>();
    series.forEach(({ points }) => points.forEach((point) => dates.add(point.date)));
    const keys = series.map((item, index) => `series${index}`);
    const values = series.map(({ points }) => new Map(points.map((point) => [point.date, point.value])));
    const data = [...dates].sort().map((date) => {
      const row: Record<string, string | number | null> = { date };
      series.forEach((_, index) => { row[keys[index]] = values[index].get(date) ?? null; });
      return row;
    });
    return { data, keys };
  }, [series]);

  if (data.length === 0) return <div className="grid h-72 place-items-center text-sm text-muted-foreground">{emptyLabel}</div>;

  return (
    <div className="h-72 w-full" role="img" aria-label={`${description} chart for ${series.map((item) => item.name).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={36} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(date: string) => date.slice(0, 7)} />
          <YAxis width={58} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value: number) => percent ? `${(value * 100).toFixed(0)}%` : value.toFixed(0)} />
          <Tooltip contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)", borderRadius: "var(--radius)" }} labelStyle={{ color: "var(--popover-foreground)" }} labelFormatter={(date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))} formatter={(value, name) => [percent ? `${(Number(value) * 100).toFixed(2)}%` : Number(value).toFixed(2), String(name)]} />
          <Legend />
          {series.map((item, index) => <Line key={item.name} type="monotone" dataKey={keys[index]} name={item.name} stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />)}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NavChart({ funds, years, rebaseTo100 = true }: { funds: ChartSeries[]; years?: 1 | 3 | 5 | 10; rebaseTo100?: boolean }) {
  const series = useMemo(() => funds.map((fund) => {
    const points = fund.points.filter((point) => point.value !== null && point.value > 0).sort((a, b) => a.date.localeCompare(b.date));
    return { ...fund, points };
  }), [funds]);
  const commonStart = series.length ? series.reduce((latest, fund) => {
    const first = fund.points[0]?.date;
    return first && first > latest ? first : latest;
  }, "0000-00-00") : "0000-00-00";
  const commonEnd = series.length ? series.reduce((earliest, fund) => {
    const last = fund.points.at(-1)?.date;
    return last && last < earliest ? last : earliest;
  }, "9999-99-99") : "9999-99-99";
  const visible = useMemo(() => series.map((fund) => {
    const endDate = commonEnd;
    const startDate = years ? subtractYears(endDate, years) : commonStart;
    const from = startDate > commonStart ? startDate : commonStart;
    const points = from <= commonEnd ? fund.points.filter((point) => point.date >= from && point.date <= commonEnd) : [];
    const first = points.find((point) => point.value !== null && point.value > 0)?.value;
    return { ...fund, points: rebaseTo100 && first ? points.map((point) => ({ ...point, value: point.value === null ? null : (point.value / first) * 100 })) : points };
  }), [commonEnd, commonStart, rebaseTo100, series, years]);
  return <Chart series={visible} description={rebaseTo100 ? "Rebased NAV" : "Value"} emptyLabel="NAV history does not overlap for this period." />;
}

export function RollingChart({ funds, windowYears }: { funds: ChartSeries[]; windowYears: 1 | 3 | 5 }) {
  return <Chart key={windowYears} series={funds} percent description="Rolling return" emptyLabel={`Not enough history for ${windowYears}Y rolling returns.`} />;
}

export function RollingDistributionChart({ series }: { series: ChartSeries[] }) {
  const data = useMemo(() => {
    const values = series.flatMap((item) => item.points.flatMap((point) => point.value === null ? [] : [point.value]));
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = (max - min) / 20 || 0.01;
    return Array.from({ length: 20 }, (_, index) => {
      const low = min + width * index;
      const row: Record<string, string | number> = { range: `${(low * 100).toFixed(0)}% to ${((low + width) * 100).toFixed(0)}%` };
      series.forEach((item, seriesIndex) => {
        row[`series${seriesIndex}`] = item.points.filter((point) => point.value !== null && Math.min(19, Math.floor((point.value - min) / width)) === index).length;
      });
      return row;
    });
  }, [series]);
  if (!data.length) return <div className="grid h-56 place-items-center text-sm text-muted-foreground">Rolling return distribution is not available.</div>;
  return <div className="h-56 w-full" role="img" aria-label={`Rolling return distribution for ${series.map((item) => item.name).join(", ")}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="range" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} /><YAxis width={38} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} /><Tooltip contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)", borderRadius: "var(--radius)" }} labelStyle={{ color: "var(--popover-foreground)" }} formatter={(value) => [Number(value).toLocaleString("en-IN"), "windows"]} /><Legend />{series.map((item, index) => <Bar key={item.name} dataKey={`series${index}`} name={item.name} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />)}</BarChart></ResponsiveContainer></div>;
}
