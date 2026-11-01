/**
 * Live-network smoke check for the three data sources in `src/ingest/`.
 * Not part of `npm test` (per `.scratch/mf-screener/spec.md`: "A live-network
 * smoke script is fine but must not run in npm test"). Run by hand:
 *
 *   npm run smoke:sources
 */
import { MfApiClient } from "../src/ingest/sources/mfapi";
import { parseAmfiNavAll } from "../src/ingest/sources/amfi-navall";
import { TigZigMetadataSource } from "../src/ingest/sources/metadata";
import { fetchText } from "../src/ingest/http";

const AMFI_NAVALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

async function smokeMfApi(): Promise<void> {
  console.log("\n-- mfapi.in --");
  const client = new MfApiClient();
  const schemes = await client.listSchemes({ limit: 5 });
  console.log(`listSchemes: ${schemes.length} schemes (first: ${schemes[0]?.schemeName})`);

  const code = schemes[0]?.schemeCode;
  if (code !== undefined) {
    const history = await client.getSchemeHistory(code);
    console.log(`getSchemeHistory(${code}): ${history.data.length} NAV points for "${history.meta.scheme_name}"`);
  }
}

async function smokeAmfiNavAll(): Promise<void> {
  console.log("\n-- AMFI NAVAll.txt --");
  const text = await fetchText(AMFI_NAVALL_URL, { timeoutMs: 30_000 });
  const records = parseAmfiNavAll(text);
  console.log(`parsed ${records.length} records, e.g.`, records[0]);
}

async function smokeMetadata(): Promise<void> {
  console.log("\n-- TigZig metadata --");
  const source = new TigZigMetadataSource();
  const rows = await source.fetchAll();
  console.log(`fetchAll: ${rows.length} rows (empty means the source failed; that's a tolerated outcome, not a crash)`);
}

async function main(): Promise<void> {
  await smokeMfApi();
  await smokeAmfiNavAll();
  await smokeMetadata();
}

main().catch((error: unknown) => {
  console.error("Smoke check failed:", error);
  process.exitCode = 1;
});
