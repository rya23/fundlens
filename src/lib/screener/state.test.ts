import { describe, expect, it } from "vitest";

import { DEFAULT_COLUMNS } from "./columns";
import { activeFilterCount, clearFilters, defaultState, parseScreenerState, serializeScreenerState, stateToQueryString } from "./state";

describe("parseScreenerState", () => {
  it("returns the default screen for an empty query", () => {
    expect(parseScreenerState("")).toEqual(defaultState());
    expect(defaultState().plans).toEqual(["direct"]);
    expect(defaultState().options).toEqual(["growth"]);
    expect(defaultState().sort).toEqual({ id: "cagr3y", desc: true });
  });

  it("reads repeatable list params, trimming and dropping duplicates and blanks", () => {
    const state = parseScreenerState("cat=Large+Cap+Fund&cat=Mid+Cap+Fund&cat=Large+Cap+Fund&cat=&amc=%20Kestrel%20Mutual%20Fund");
    expect(state.categories).toEqual(["Large Cap Fund", "Mid Cap Fund"]);
    expect(state.amcs).toEqual(["Kestrel Mutual Fund"]);
  });

  it("accepts Next-style searchParams records, including arrays", () => {
    const state = parseScreenerState({ cat: ["Large Cap Fund", "Flexi Cap Fund"], q: "bluepeak", risk: "Very High", ignored: undefined });
    expect(state.categories).toEqual(["Large Cap Fund", "Flexi Cap Fund"]);
    expect(state.q).toBe("bluepeak");
    expect(state.riskometers).toEqual(["Very High"]);
  });

  it("parses plan and option, falling back to Direct Growth when nothing valid is given", () => {
    expect(parseScreenerState("plan=regular&plan=direct&option=idcw").plans).toEqual(["direct", "regular"]);
    expect(parseScreenerState("plan=regular&option=idcw")).toMatchObject({ plans: ["regular"], options: ["idcw"] });
    expect(parseScreenerState("plan=nonsense&option=")).toMatchObject({ plans: ["direct"], options: ["growth"] });
  });

  it("parses ranges in display units and swaps a reversed pair", () => {
    const state = parseScreenerState("min_cagr3y=12&max_cagr3y=30&max_terPct=0.5&min_sharpe3y=2&max_sharpe3y=1");
    expect(state.ranges.cagr3y).toEqual({ min: 12, max: 30 });
    expect(state.ranges.terPct).toEqual({ max: 0.5 });
    expect(state.ranges.sharpe3y).toEqual({ min: 1, max: 2 });
  });

  it("allows negative bounds (max drawdown) and ignores non-numeric or unknown ranges", () => {
    const state = parseScreenerState("min_maxDrawdown5y=-25&min_cagr1y=abc&min_bogus=3&max_cagr5y=");
    expect(state.ranges).toEqual({ maxDrawdown5y: { min: -25 } });
  });

  it("orders columns canonically and drops unknown ids, keeping defaults when none are valid", () => {
    expect(parseScreenerState("cols=sharpe3y,aumCr,nope,aumCr").columns).toEqual(["aumCr", "sharpe3y"]);
    expect(parseScreenerState("cols=nope").columns).toEqual([...DEFAULT_COLUMNS]);
  });

  it("parses sort direction from the minus prefix and rejects unknown columns", () => {
    expect(parseScreenerState("sort=terPct").sort).toEqual({ id: "terPct", desc: false });
    expect(parseScreenerState("sort=-sharpe3y").sort).toEqual({ id: "sharpe3y", desc: true });
    expect(parseScreenerState("sort=name").sort).toEqual({ id: "name", desc: false });
    expect(parseScreenerState("sort=-bogus").sort).toEqual({ id: "cagr3y", desc: true });
  });
});

describe("serializeScreenerState", () => {
  it("writes nothing for the default screen", () => {
    expect(stateToQueryString(defaultState())).toBe("");
  });

  it("round-trips a fully populated state", () => {
    const state = {
      ...defaultState(),
      q: "flexi cap",
      groups: ["Equity"],
      categories: ["Flexi Cap Fund", "Large Cap Fund"],
      amcs: ["Kestrel Mutual Fund"],
      riskometers: ["Very High"],
      plans: ["direct", "regular"] as const,
      options: ["idcw"] as const,
      ranges: { cagr3y: { min: 12.5 }, maxDrawdown5y: { min: -25, max: -5 }, terPct: { max: 0.75 } },
      columns: ["aumCr", "sharpe3y", "sortino3y"] as never,
      sort: { id: "terPct" as const, desc: false },
    };
    const query = serializeScreenerState({ ...state, plans: [...state.plans], options: [...state.options] }).toString();
    const parsed = parseScreenerState(query);
    expect(parsed).toEqual({ ...state, plans: ["direct", "regular"], options: ["idcw"] });
  });

  it("is canonical: selection order does not change the URL", () => {
    const a = { ...defaultState(), categories: ["B", "A"] };
    const b = { ...defaultState(), categories: ["A", "B"] };
    expect(stateToQueryString(a)).toBe(stateToQueryString(b));
  });

  it("encodes values that look like separators safely", () => {
    const state = { ...defaultState(), categories: ["Dynamic Asset Allocation / Balanced Advantage Fund"], amcs: ["A, B & C Mutual Fund"] };
    expect(parseScreenerState(stateToQueryString(state).slice(1))).toMatchObject({
      categories: state.categories,
      amcs: state.amcs,
    });
  });

  it("omits default columns and default sort but keeps explicit ones", () => {
    const withCols = { ...defaultState(), columns: ["aumCr" as const] };
    expect(stateToQueryString(withCols)).toBe("?cols=aumCr");
    expect(stateToQueryString({ ...defaultState(), sort: { id: "cagr3y", desc: false } })).toBe("?sort=cagr3y");
  });
});

describe("filter bookkeeping", () => {
  it("counts narrowing filters but not plan or option", () => {
    const state = { ...defaultState(), q: "x", categories: ["A"], ranges: { cagr3y: { min: 1 }, terPct: { max: 1 } }, plans: ["regular" as const] };
    expect(activeFilterCount(state)).toBe(4);
  });

  it("clearFilters keeps plan, option, columns and sort", () => {
    const state = { ...defaultState(), q: "x", categories: ["A"], plans: ["regular" as const], sort: { id: "terPct" as const, desc: false } };
    expect(clearFilters(state)).toEqual({ ...defaultState(), plans: ["regular"], sort: { id: "terPct", desc: false } });
  });
});
