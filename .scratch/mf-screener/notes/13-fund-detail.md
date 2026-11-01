# 13-fund-detail

`src/lib/fund/data.ts` provides cached getFundData, pure assembleFundData and fund options. Detail includes rebased shared-period NAV, rolling lines/histogram, metadata, trailing and risk windows. Default-window peer ranks use full subcategory; other windows show n/a peers. Next externalizes PGlite to preserve native URL/WASM loading.

No new tests added, as requested by the owner.
