import { describe, expect, it } from "vitest";
import { parseEnv, EnvValidationError } from "./env";

const validFsEnv = {
  DATABASE_URL: "pglite:memory",
  NAV_STORE: "fs:.data/nav",
};

const validR2Env = {
  DATABASE_URL: "postgres://user:pass@host:5432/db",
  NAV_STORE: "r2",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "key-id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "nav-bucket",
};

describe("parseEnv", () => {
  it("parses a valid fs-store config and defaults RISK_FREE_RATE to 0.065", () => {
    const env = parseEnv(validFsEnv);

    expect(env.DATABASE_URL).toBe("pglite:memory");
    expect(env.NAV_STORE).toBe("fs:.data/nav");
    expect(env.RISK_FREE_RATE).toBe(0.065);
  });

  it("parses a valid r2-store config with all R2_* vars present", () => {
    const env = parseEnv(validR2Env);

    expect(env.NAV_STORE).toBe("r2");
    expect(env.R2_BUCKET).toBe("nav-bucket");
  });

  it("coerces a provided RISK_FREE_RATE to a number", () => {
    const env = parseEnv({ ...validFsEnv, RISK_FREE_RATE: "0.07" });

    expect(env.RISK_FREE_RATE).toBe(0.07);
  });

  it("rejects a missing DATABASE_URL", () => {
    const withoutDatabaseUrl = { NAV_STORE: validFsEnv.NAV_STORE };
    expect(() => parseEnv(withoutDatabaseUrl)).toThrow(EnvValidationError);
  });

  it("rejects a DATABASE_URL with an unrecognised scheme", () => {
    expect(() =>
      parseEnv({ ...validFsEnv, DATABASE_URL: "mysql://host/db" })
    ).toThrow(EnvValidationError);
  });

  it("rejects a NAV_STORE that is neither r2 nor fs:<dir>", () => {
    expect(() =>
      parseEnv({ ...validFsEnv, NAV_STORE: "s3:bucket" })
    ).toThrow(EnvValidationError);
  });

  it("rejects NAV_STORE=r2 when R2_* vars are missing", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: validR2Env.DATABASE_URL, NAV_STORE: "r2" })
    ).toThrow(/R2_ACCOUNT_ID/);
  });

  it("rejects a non-numeric RISK_FREE_RATE", () => {
    expect(() =>
      parseEnv({ ...validFsEnv, RISK_FREE_RATE: "not-a-number" })
    ).toThrow(EnvValidationError);
  });
});
