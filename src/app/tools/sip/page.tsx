import Link from "next/link";
import type { Metadata } from "next";
import { eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schemes } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { createNavStoreFromEnv } from "@/lib/nav-store";
import { calculateSip, queryValue, sipChartPoints, validateSipInput } from "@/lib/sip/calculator";
import { subtractYears } from "@/lib/metrics/series";
import { formatIsoDate } from "@/lib/screener/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SipResults } from "@/components/sip/results";

export const metadata: Metadata = { title: "SIP calculator | MF Screener" };
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 2 });

export default async function SipCalculatorPage({ searchParams }: PageProps<"/tools/sip">) {
  const query = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const q = queryValue(query, "q").slice(0, 150);
  const defaults = { ...query, amount: queryValue(query, "amount", "5000"), start: queryValue(query, "start", subtractYears(today, 3)), end: queryValue(query, "end", today) };
  const validation = validateSipInput(defaults);
  const submitted = query.run === "1";
  const db = getDb();
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const choices = await db.select({ code: schemes.schemeCode, name: schemes.name }).from(schemes)
    .where(q ? or(ilike(schemes.name, `%${escaped}%`), ilike(sql`${schemes.schemeCode}::text`, `%${escaped}%`)) : eq(schemes.plan, "direct"))
    .orderBy(schemes.name).limit(25);
  const code = validation.ok ? validation.value.code : Number(queryValue(query, "code"));
  const selected = Number.isInteger(code) && code > 0 && code <= 2147483647 ? (await db.select().from(schemes).where(eq(schemes.schemeCode, code)).limit(1))[0] : undefined;
  const errors: Record<string, string> = submitted && !validation.ok ? validation.errors : {};
  if (submitted && validation.ok && !selected) errors.code = "Choose a fund that is available in the fund list.";
  if (selected && !choices.some((item) => item.code === code)) choices.unshift({ code, name: selected.name });
  const stored = submitted && validation.ok && selected ? await createNavStoreFromEnv(getEnv()).getSeries(String(code)) : null;
  const result = submitted && validation.ok && selected ? calculateSip(stored?.points ?? [], validation.value) : null;
  const inputClass = "flex min-w-0 flex-col gap-2 text-sm";

  return <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-4 py-8 sm:px-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">SIP calculator</h1><p className="mt-2 text-sm text-muted-foreground">Simulate monthly purchases using historical fund NAVs. Purchases use the next available NAV; valuation uses the last available NAV by the end date.</p></div>
    <form action="/tools/sip" className="flex flex-wrap items-end gap-3" role="search">
      <label className={`${inputClass} flex-1`} htmlFor="fund-search">Find a fund<Input id="fund-search" type="search" name="q" defaultValue={q} placeholder="Fund name or scheme code…" /></label>
      {(["code", "amount", "start", "end"] as const).map((key) => <input key={key} type="hidden" name={key} value={queryValue(defaults, key)} />)}
      <Button type="submit" variant="outline">Search</Button>
    </form>
    <form action="/tools/sip" className="grid items-end gap-4 border-y py-5 sm:grid-cols-2 lg:grid-cols-5">
      <input type="hidden" name="q" value={q} /><input type="hidden" name="run" value="1" />
      <label className={`${inputClass} lg:col-span-2`} htmlFor="sip-fund">Fund<select id="sip-fund" name="code" defaultValue={selected?.schemeCode ?? ""} aria-invalid={!!errors.code} aria-describedby={errors.code ? "code-error" : undefined} className="h-10 min-w-0 rounded-md border bg-background px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <option value="">Choose a fund</option>{choices.map((fund) => <option key={fund.code} value={fund.code}>{fund.name}</option>)}
      </select>{errors.code && <span id="code-error" className="text-destructive">{errors.code}</span>}</label>
      <label className={inputClass} htmlFor="sip-amount">Monthly amount (₹)<Input id="sip-amount" name="amount" type="number" min="0.01" max="1000000000" step="0.01" defaultValue={defaults.amount} aria-invalid={!!errors.amount} aria-describedby={errors.amount ? "amount-error" : undefined} />{errors.amount && <span id="amount-error" className="text-destructive">{errors.amount}</span>}</label>
      <label className={inputClass} htmlFor="sip-start">Start date<Input id="sip-start" name="start" type="date" defaultValue={defaults.start} aria-invalid={!!errors.start} aria-describedby={errors.start ? "start-error" : undefined} />{errors.start && <span id="start-error" className="text-destructive">{errors.start}</span>}</label>
      <label className={inputClass} htmlFor="sip-end">End date<Input id="sip-end" name="end" type="date" defaultValue={defaults.end} aria-invalid={!!errors.end} aria-describedby={errors.end ? "end-error" : undefined} />{errors.end && <span id="end-error" className="text-destructive">{errors.end}</span>}</label>
      <Button type="submit">Calculate SIP</Button>
    </form>
    {submitted && (!validation.ok || !selected) && <p role="alert" className="text-sm text-destructive">Check the fund, amount, and dates above. Search for a fund if it is missing from the list.</p>}
    {result && !result.ok && <p role="status" className="rounded-md border p-4 text-sm">Calculation unavailable: {result.reason.replaceAll("-", " ")}. Choose dates with available NAV history or load this fund&apos;s history.</p>}
    {result?.ok && <>
      <div><h2 className="font-semibold"><Link href={`/fund/${code}`} className="underline underline-offset-4">{selected!.name}</Link></h2><p className="mt-1 text-sm text-muted-foreground">Valued on {formatIsoDate(result.value.valuationDate.toISOString().slice(0, 10))}. No exit load or tax deducted.</p><p className="mt-1 text-sm text-muted-foreground">{result.value.instalments.length} purchases, starting {formatIsoDate(result.value.instalments[0].navDate.toISOString().slice(0, 10))}. Dates without available NAV history are skipped.</p></div>
      <dl className="grid grid-cols-2 gap-5 border-b pb-6 lg:grid-cols-4">
        {[ ["Invested", money.format(result.value.invested)], ["Current value", money.format(result.value.currentValue)], ["Gain", money.format(result.value.currentValue - result.value.invested)], ["XIRR", result.value.xirr.ok ? percent.format(result.value.xirr.value) : `n/a (${result.value.xirr.reason})`] ].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <SipResults key={`${code}-${defaults.amount}-${defaults.start}-${defaults.end}`} chart={sipChartPoints(stored?.points ?? [], result)} cashflows={result.value.instalments.map((item) => ({ due: item.dueDate.toISOString().slice(0, 10), date: item.navDate.toISOString().slice(0, 10), nav: item.nav, amount: item.amount, units: item.units }))} />
    </>}
    {!submitted && <p className="text-sm text-muted-foreground">Search for a fund, choose dates, and calculate. The result URL saves your inputs.</p>}
  </div>;
}
