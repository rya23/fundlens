"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIsoDate } from "@/lib/screener/format";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

export function SipResults({ chart, cashflows }: {
  chart: { date: string; invested: number; value: number }[];
  cashflows: { due: string; date: string; nav: number; amount: number; units: number }[];
}) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(cashflows.length / 24);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  return <div className="flex min-w-0 flex-col gap-6">
    <section aria-labelledby="sip-chart-title" className="min-w-0">
      <h2 id="sip-chart-title" className="mb-4 text-lg font-semibold">Invested vs value</h2>
      <div className="h-80 w-full" role="img" aria-label="Line chart comparing cumulative SIP investment and fund value at each purchase date">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ left: 12, right: 16 }} accessibilityLayer>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={55} tickFormatter={(date: string) => formatIsoDate(date)} tick={{ fontSize: 11 }} />
            <YAxis width={75} tickFormatter={(value: number) => number.format(value)} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)" }} formatter={(value) => money.format(Number(value))} labelFormatter={(date) => formatIsoDate(String(date))} />
            <Legend />
            <Line dataKey="invested" name="Invested" stroke="var(--chart-2)" strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            <Line dataKey="value" name="Fund value" stroke="var(--chart-1)" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
    <section aria-labelledby="cashflows-title">
      <h2 id="cashflows-title" className="mb-3 text-lg font-semibold">Monthly purchases</h2>
      <Table>
        <TableHeader><TableRow><TableHead>Due date</TableHead><TableHead>NAV date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">NAV</TableHead><TableHead className="text-right">Units</TableHead></TableRow></TableHeader>
        <TableBody>{cashflows.slice(currentPage * 24, (currentPage + 1) * 24).map((row) => <TableRow key={row.due}>
          <TableCell>{formatIsoDate(row.due)}</TableCell><TableCell>{formatIsoDate(row.date)}</TableCell>
          <TableCell className="text-right tabular-nums">{money.format(row.amount)}</TableCell><TableCell className="text-right tabular-nums">{number.format(row.nav)}</TableCell><TableCell className="text-right tabular-nums">{number.format(row.units)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <div className="mt-3 flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">Page {currentPage + 1} of {pages}</span>
        <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button>
      </div>
    </section>
  </div>;
}
