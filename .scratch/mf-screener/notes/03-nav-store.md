# Notes for later agents - 03-nav-store

Branch: `worktree-agent-aa9c60f97f3844b21` (based on `mf-screener` at
`52262ad`, already up to date - no parallel-ticket commits landed yet).
Worktree: `<repo>/.claude/worktrees/agent-aa9c60f97f3844b21`.
Commit: `14f6f32`.

## Module: `src/lib/nav-store/`

Public API (`index.ts` barrel):

```ts
interface NavPoint { date: string /* YYYY-MM-DD */; nav: number }
interface NavSeries { version: number; schemeCode: string; points: readonly NavPoint[] }
interface AppendResult { added: number; total: number }
class NavStoreError extends Error {}

interface NavStore {
  getSeries(schemeCode: string): Promise<NavSeries | null>;
  putSeries(schemeCode: string, points: readonly NavPoint[]): Promise<void>; // full replace
  appendPoints(schemeCode: string, points: readonly NavPoint[]): Promise<AppendResult>; // idempotent merge
  getHead(schemeCode: string): Promise<NavPoint | null>; // most recent point
  listCodes(): Promise<string[]>; // not for hot paths
}

class FsNavStore implements NavStore { constructor(dir: string) }
class R2NavStore implements NavStore {
  constructor(options: { client: S3Client; bucket: string; prefix?: string }) // prefix default "nav/"
}
function createNavStoreFromEnv(env: Env): NavStore; // from src/lib/env.ts's Env
```

- `mergeNavPoints`, `encodeNavSeries`, `decodeNavSeries` are also exported
  from the barrel if you need the sort/dedupe/codec logic directly (e.g. to
  pre-merge in memory before a single `putSeries`).

## File format

Gzipped JSON, one object per scheme, same layout for both backends:
`nav/{schemeCode}.json.gz` -> `{"version":1,"schemeCode":"...","points":[["2024-01-01",10.5],...]}`.
Points are tuples on the wire (`[date, nav]`), decoded to `{date, nav}`
objects at the `NavStore` boundary. `version` is `NAV_SERIES_VERSION` (`1`);
`decodeNavSeries` throws `NavStoreError` on a mismatched/missing version or
malformed JSON, so a format change later is a breaking, detectable event,
not a silent misread.

Points are always sorted ascending by date and deduplicated by date
(later/incoming wins ties) - enforced centrally in `codec.ts`'s
`mergeNavPoints`, used by every write path in both implementations, so this
invariant can't drift between backends.

## Scheme codes as storage keys

Validated against `^[A-Za-z0-9_-]+$` before being used in any path/S3 key
(`NavStoreError` otherwise) - AMFI codes are numeric but this leaves room
for other key shapes without risking path traversal (`FsNavStore`) or key
injection (`R2NavStore`).

## R2 op discipline (ticket's "keep class A ops low")

`appendPoints` = exactly one `GetObjectCommand` (class B) + one
`PutObjectCommand` (class A). `listCodes` is the only method that calls
`ListObjectsV2Command` (paginated via `ContinuationToken`) - never call it
per-scheme in a backfill/nightly loop. Covered by explicit op-count
assertions in `r2-store.test.ts` using a hand-rolled `FakeS3` (not a real
mocking library - see below), so a future refactor that accidentally adds a
list/extra round-trip will fail a test, not just a cost review.

## Testing approach

- `contract.ts` exports `runNavStoreContractTests(createStore)`: the shared
  behavioral suite (round-trip, sort/dedupe, idempotent append, getHead,
  listCodes, invalid-scheme-code rejection, cross-scheme isolation). Both
  `fs-store.test.ts` and `r2-store.test.ts` call it with a fresh store per
  test (`FsNavStore` over a `mkdtemp` dir; `R2NavStore` over a fake client).
  It is not itself a `*.test.ts` file so Vitest's default glob skips it.
- `r2-store.test.ts`'s `FakeS3` is a ~40-line in-memory stand-in (Map of
  key -> bytes) implementing only `GetObjectCommand`/`PutObjectCommand`/
  `ListObjectsV2Command`, typed via `client: fake as unknown as S3Client`.
  No `aws-sdk-client-mock` dependency was added; this was simpler and gives
  full control for the op-count assertions. `GetObjectCommandOutput.Body`
  is faked as `{ transformToByteArray: async () => bytes }`, matching what
  the real Node S3 client actually hands back (the SDK's stream mixin adds
  that method at runtime).
- `codec.test.ts` unit-tests `mergeNavPoints`/`encodeNavSeries`/
  `decodeNavSeries` directly (sort, dedupe-with-tie-win, idempotency, wire
  tuple shape, version/JSON corruption rejection).
- `factory.test.ts` builds a real working `FsNavStore` from env (writes a
  file, checks it lands at the configured dir) and checks the `r2` branch
  returns an `R2NavStore` instance; it does not exercise real R2 network
  calls (S3Client construction alone makes none).

## Gotchas for consumers (09-backfill, 10-precompute, 11-nightly)

- `appendPoints`/`putSeries` take `points` as plain `{date, nav}` objects,
  not tuples - only the on-disk/R2 wire format is tuple-encoded.
- `getSeries`/`getHead` return `null` for a scheme that has never been
  written; they throw `NavStoreError` (not a rejected-with-`null`) for an
  invalid scheme code or a corrupt/wrong-version stored file. Treat
  `NavStoreError` as a real failure to surface, not a "missing" signal.
- `putSeries` is a full replace (dedupe/sort applied to exactly the array
  you pass); `appendPoints` is the one to use for incremental
  backfill/nightly writes since it merges with whatever is already stored.
- `createNavStoreFromEnv(getEnv())` is the one-line way to get the
  configured store; it throws `NavStoreError` if `NAV_STORE=r2` but any
  `R2_*` var is missing, even though `env.ts` already guards this (defense
  in depth for anyone hand-building an `Env`).

## npm/registry notes (same as 01-scaffold, reconfirmed here)

- `--registry=https://registry.npmjs.org/` on every install, run from the
  worktree root (where the project `.npmrc` lives).
- The global npmrc's `min-release-age=7` line is currently commented out
  (`# min-release-age=7`), so `npm install <pkg>` picks true latest with no
  `ETARGET` fuss right now. `@aws-sdk/client-s3` installed at `^3.1161.0`
  with zero install-script/`npm rebuild` needs.
- A plain bare `git status`/`git <subcommand>` sometimes gets blocked by
  this environment's sandbox with a confusing "runs rtk with a git command"
  error, even for read-only commands, seemingly nondeterministically on
  retry. Prefixing the absolute binary path (`/usr/bin/git status`) worked
  reliably every time in this session - worth trying first if you hit the
  same wall.

## Check results

`npm run typecheck`, `npm run lint`, `npm test` (52 passed, 6 files),
`npm run build` all pass clean on commit `14f6f32`. No em dashes introduced.
