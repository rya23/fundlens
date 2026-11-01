import Link from "next/link";

export default function FundNotFound() {
  return <div className="mx-auto max-w-2xl px-4 py-20 text-center"><p className="text-sm text-muted-foreground">404</p><h1 className="mt-2 text-2xl font-semibold">Fund not found</h1><p className="mt-2 text-sm text-muted-foreground">That scheme code is not in the current fund database.</p><Link href="/" className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">Return to screener</Link></div>;
}
