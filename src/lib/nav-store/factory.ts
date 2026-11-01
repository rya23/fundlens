import { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../env";
import { FsNavStore } from "./fs-store";
import { R2NavStore } from "./r2-store";
import { NavStoreError, type NavStore } from "./types";

const FS_PREFIX = "fs:";

/**
 * Builds the `NavStore` configured by env: `NAV_STORE=fs:<dir>` for local
 * dev/tests, or `NAV_STORE=r2` for Cloudflare R2. `src/lib/env.ts` already
 * validates the shape of `NAV_STORE` and requires the `R2_*` vars when
 * `NAV_STORE=r2`; the checks here are a defensive second line so this
 * function is also safe to call with a hand-built `Env`.
 */
export function createNavStoreFromEnv(env: Env): NavStore {
  if (env.NAV_STORE.startsWith(FS_PREFIX)) {
    return new FsNavStore(env.NAV_STORE.slice(FS_PREFIX.length));
  }

  if (env.NAV_STORE === "r2") {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
      env;
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET
    ) {
      throw new NavStoreError(
        "NAV_STORE=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET to be set"
      );
    }

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    return new R2NavStore({ client, bucket: R2_BUCKET });
  }

  throw new NavStoreError(`unsupported NAV_STORE value: ${env.NAV_STORE}`);
}
