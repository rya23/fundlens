import { CompareView } from "@/components/fund/compare-view";
import { getFundData, getFundOptions, parseCompareCodes } from "@/lib/fund/data";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compare funds | MF Screener" };

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const params = await searchParams;
  const codes = parseCompareCodes(params.codes);
  const [options, ...loaded] = await Promise.all([getFundOptions(), ...codes.map(getFundData)]);
  const funds = loaded.filter((fund) => fund !== null);
  return <div className="mx-auto min-w-0 max-w-[1440px] px-4 py-8 sm:px-6 lg:py-10">
    <div className="mb-7"><p className="text-sm text-muted-foreground">Research</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Compare funds</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Compare NAV growth, rolling returns and risk metrics across two to five mutual funds.</p></div>
    <CompareView codes={codes} funds={funds} options={options} />
  </div>;
}
