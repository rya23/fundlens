# 03 NavStore (R2 + filesystem)

Status: ready-for-agent
Blocked by: 01

Spec: `../spec.md` (NavStore), `docs/PLAN.md` (Architecture: R2 layout).

## Scope
- `src/lib/nav-store/`: `NavStore` interface (get series, put series, append points idempotently, list codes, head/last-date). File format: gzipped JSON `{ schemeCode, points: [[ISO date, nav], ...] }` sorted, deduped by date, versioned field for future changes.
- `FsNavStore` (atomic writes: temp file + rename) and `R2NavStore` (S3 client, R2 endpoint). Factory from env.
- Keep class A ops low: append = read + single put; no listing in hot paths.

## Acceptance
- Contract test suite run against FsNavStore (tmp dir) and R2NavStore against a mocked S3 client.
