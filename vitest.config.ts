import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Pure logic (metrics, env, parsers) runs fastest under node; files that
    // touch the DOM opt in to jsdom with a `// @vitest-environment jsdom`
    // docblock at the top of the file.
    environment: "node",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
