import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-0">
        <Link
          href="/"
          className="shrink-0 text-sm font-semibold tracking-tight"
        >
          MF Screener
        </Link>
        <div className="order-last flex basis-full justify-center sm:order-none sm:basis-auto"><SiteNav /></div>
        <ThemeToggle />
      </div>
    </header>
  );
}
