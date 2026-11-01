type FundPageProps = {
  params: Promise<{ schemeCode: string }>;
};

export default async function FundDetailPage({ params }: FundPageProps) {
  const { schemeCode } = await params;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Fund <span className="tabular-nums">{schemeCode}</span>
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        NAV chart, trailing and rolling returns, and risk metrics for this
        scheme land in a later ticket.
      </p>
    </div>
  );
}
