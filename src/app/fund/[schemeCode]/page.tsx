import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FundDetailView } from "@/components/fund/detail-view";
import { Button } from "@/components/ui/button";
import { getFundData } from "@/lib/fund/data";

export async function generateMetadata({ params }: PageProps<"/fund/[schemeCode]">): Promise<Metadata> {
  const { schemeCode } = await params;
  const data = await getFundData(schemeCode);
  return { title: data ? `${data.scheme.name} | MF Screener` : "Fund not found | MF Screener" };
}

export default async function FundPage({ params }: PageProps<"/fund/[schemeCode]">) {
  const { schemeCode } = await params;
  const data = await getFundData(schemeCode);
  if (!data) notFound();
  return <div className="mx-auto min-w-0 max-w-[1280px] px-4 py-8 sm:px-6 lg:py-10">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
      <div className="min-w-0"><Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Screener</Link><h1 className="mt-3 max-w-4xl break-words text-2xl font-semibold tracking-tight sm:text-3xl">{data.scheme.name}</h1><p className="mt-2 text-sm text-muted-foreground">{data.scheme.amc} · {data.scheme.subCategory} · {data.scheme.plan} · {data.scheme.option}</p></div>
      <Button nativeButton={false} render={<Link href={`/compare?codes=${schemeCode}`} />}>Add to compare</Button>
    </div>
    {data.nav.length === 0 && <p className="mt-5 rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">NAV history is not available yet. Fund details and stored metrics will appear as data becomes available.</p>}
    <div className="mt-7"><FundDetailView data={data} /></div>
  </div>;
}
