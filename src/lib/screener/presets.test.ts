import { describe, expect, it } from "vitest";

import { filterRows } from "./filter";
import { activePresetId, applyPreset, PRESETS } from "./presets";
import { defaultState, parseScreenerState, stateToQueryString } from "./state";
import { makeRow } from "./test-fixtures";

describe("presets", () => {
  it("every preset survives the URL round trip", () => {
    for (const preset of PRESETS) {
      const state = applyPreset(preset, defaultState());
      expect(parseScreenerState(stateToQueryString(state).slice(1))).toEqual(state);
    }
  });

  it("applying a preset replaces earlier filters but keeps plan and option", () => {
    const start = { ...defaultState(), q: "kestrel", amcs: ["Kestrel Mutual Fund"], plans: ["regular" as const], options: ["idcw" as const] };
    const state = applyPreset(PRESETS[0], start);
    expect(state.q).toBe("");
    expect(state.amcs).toEqual([]);
    expect(state.plans).toEqual(["regular"]);
    expect(state.options).toEqual(["idcw"]);
  });

  it("detects the active preset, and none once the screen is edited", () => {
    const preset = PRESETS[1];
    const applied = applyPreset(preset, defaultState());
    expect(activePresetId(applied)).toBe(preset.id);
    expect(activePresetId({ ...applied, q: "x" })).toBeNull();
    expect(activePresetId(defaultState())).toBeNull();
  });

  it("detects a preset regardless of the plan/option the user picked", () => {
    const applied = applyPreset(PRESETS[1], { ...defaultState(), plans: ["regular"] });
    expect(activePresetId(applied)).toBe(PRESETS[1].id);
  });

  it("'Low-cost index funds' keeps cheap index funds and drops expensive ones and other categories", () => {
    const rows = [
      makeRow({ code: 1, subCategory: "Index Funds", group: "Other", terPct: 0.12 }),
      makeRow({ code: 2, subCategory: "Index Funds", group: "Other", terPct: 0.55 }),
      makeRow({ code: 3, subCategory: "Flexi Cap Fund", terPct: 0.1 }),
    ];
    const preset = PRESETS.find((p) => p.id === "low-cost-index-funds")!;
    expect(filterRows(rows, applyPreset(preset, defaultState())).map((r) => r.code)).toEqual([1]);
  });
});
