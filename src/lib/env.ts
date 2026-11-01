import { z } from "zod";

/**
 * Validated application configuration.
 *
 * `parseEnv` is the pure, testable seam: it takes a raw key/value record
 * (normally `process.env`) and returns a typed, validated config or throws
 * an `EnvValidationError` describing every problem found.
 *
 * `getEnv` is the runtime entry point: it validates `process.env` lazily
 * and caches the result, so importing this module never crashes on its own
 * - only calling `getEnv()` without the right variables set does.
 */

const R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .regex(
      /^(postgres(ql)?:\/\/|pglite:)/,
      'DATABASE_URL must start with "postgres://", "postgresql://", or "pglite:"'
    ),
  NAV_STORE: z
    .string()
    .min(1, "NAV_STORE is required")
    .regex(/^(r2|fs:.+)$/, 'NAV_STORE must be "r2" or "fs:<dir>"'),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  RISK_FREE_RATE: z.coerce
    .number({ error: "RISK_FREE_RATE must be a number" })
    .default(0.065),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvValidationError(formatIssues(result.error.issues));
  }

  const env = result.data;
  if (env.NAV_STORE === "r2") {
    const missing = R2_KEYS.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new EnvValidationError(
        `NAV_STORE=r2 requires ${missing.join(", ")} to be set`
      );
    }
  }

  return env;
}

let cached: Env | undefined;

/** Validates and returns `process.env`, caching the result after the first call. */
export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
