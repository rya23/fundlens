"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-start justify-center px-6">
      <h1 className="text-xl font-semibold">Fund data could not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">The data service did not respond. Try again in a moment.</p>
      <Button className="mt-5" onClick={() => retry()}>Try again</Button>
    </div>
  );
}
