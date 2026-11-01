# 10-precompute

`src/ingest/precompute.ts` exports runPrecompute with DB/NavStore dependencies. Reads NAV per scheme, stores nullable fraction metrics, refreshes full-category cuts including metadata. Missing NAV clears stale metrics. SIP requires full window history.

No new tests added, as requested by the owner.
