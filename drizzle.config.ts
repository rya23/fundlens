import { defineConfig } from "drizzle-kit";

// `dbCredentials` is only read by drizzle-kit commands that open a live
// connection (`push`, `introspect`, `studio`). This project only uses
// `drizzle-kit generate` (produces SQL files from `src/db/schema.ts`) and
// applies them with our own runner in `src/db/migrate.ts`, which picks the
// right driver (postgres-js or PGlite) from `DATABASE_URL` at apply time -
// see that file. The placeholder below exists only to satisfy drizzle-kit's
// config type for the postgresql dialect; it is never connected to.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "postgres://unused:unused@localhost:5432/unused",
  },
});
