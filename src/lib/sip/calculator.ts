import { simulateSip, type SipResult } from "@/lib/metrics/sip";
import { asOf, type NavSeries } from "@/lib/metrics/series";

export type SipInput = { code: number; monthlyAmount: number; start: string; end: string };
export type SipQuery = Record<string, string | string[] | undefined>;
export type SipValidation = { ok: true; value: SipInput } | { ok: false; errors: Record<string, string> };

export function queryValue(query: SipQuery, name: string, fallback = ""): string {
  const value = query[name];
  return typeof value === "string" ? value.trim() : fallback;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateSipInput(query: SipQuery): SipValidation {
  const codeText = queryValue(query, "code");
  const amountText = queryValue(query, "amount");
  const code = Number(codeText);
  const monthlyAmount = Number(amountText);
  const start = queryValue(query, "start");
  const end = queryValue(query, "end");
  const errors: Record<string, string> = {};
  if (!/^\d+$/.test(codeText) || !Number.isSafeInteger(code) || code <= 0 || code > 2147483647) errors.code = "Choose a fund from the search results.";
  if (!/^\d+(\.\d{1,2})?$/.test(amountText) || monthlyAmount <= 0 || monthlyAmount > 1_000_000_000) errors.amount = "Enter an amount from ₹0.01 to ₹1,00,00,00,000 with at most two decimals.";
  if (!validDate(start)) errors.start = "Enter a valid start date.";
  if (!validDate(end)) errors.end = "Enter a valid end date.";
  if (!errors.start && !errors.end) {
    if (start > end) errors.end = "End date must be on or after the start date.";
    else {
      const limit = new Date(`${start}T00:00:00Z`);
      limit.setUTCFullYear(limit.getUTCFullYear() + 60);
      if (start.slice(5) === "02-29" && limit.getUTCMonth() === 2) limit.setUTCDate(0);
      if (new Date(`${end}T00:00:00Z`) > limit) errors.end = "Choose a period of 60 years or less.";
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { code, monthlyAmount, start, end } };
}

export function calculateSip(points: NavSeries, input: SipInput): SipResult {
  return simulateSip(points, { monthlyAmount: input.monthlyAmount, startDate: new Date(input.start), endDate: new Date(input.end) });
}

/** Value at each purchase date, with the terminal valuation included. */
export function sipChartPoints(points: NavSeries, result: SipResult): { date: string; invested: number; value: number }[] {
  if (!result.ok) return [];
  let units = 0;
  let invested = 0;
  const chart = result.value.instalments.map((item) => {
    units += item.units;
    invested += item.amount;
    const date = item.navDate.toISOString().slice(0, 10);
    return { date, invested, value: units * asOf(points, date)!.nav };
  });
  const terminal = { date: result.value.valuationDate.toISOString().slice(0, 10), invested, value: result.value.currentValue };
  if (chart.at(-1)?.date === terminal.date) chart[chart.length - 1] = terminal;
  else chart.push(terminal);
  return chart;
}
