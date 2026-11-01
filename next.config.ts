import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Cache Components / PPR require every dynamic read (params, usePathname,
  // etc.) to sit behind a Suspense boundary. The screener, fund-detail, and
  // compare pages are inherently dynamic (URL-driven filters, scheme codes),
  // so this stays off rather than fighting the boundary requirement on every
  // route; revisit if a later ticket wants partial prerendering for a
  // specific page.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
