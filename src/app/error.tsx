"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-start justify-center px-6">
      <h1 className="text-xl font-semibold">The fund screener could not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">Check that the local database is available, then try again.</p>
      <Button className="mt-5" onClick={() => retry()}>Try again</Button>
    </div>
  );
}
