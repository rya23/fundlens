import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-7 sm:px-6" aria-label="Loading fund screener" aria-busy="true">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Skeleton className="h-[38rem] rounded-lg" />
        <Skeleton className="h-[38rem] rounded-lg" />
      </div>
    </div>
  );
}
