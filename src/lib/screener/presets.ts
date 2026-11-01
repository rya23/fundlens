import { normalizeColumns, type OptionalColumnId } from "./columns";
import { clearFilters, defaultState, serializeScreenerState, type ScreenerState } from "./state";

export interface Preset {
  id: string;
  label: string;
  /** Plain-language explanation of the screen, shown as a tooltip title. */
  description: string;
  /** Applied on top of a cleared screen; plan/option are left as the user set them. */
  apply: (base: ScreenerState) => ScreenerState;
}

function withColumns(state: ScreenerState, extra: readonly OptionalColumnId[]): OptionalColumnId[] {
  return normalizeColumns([...state.columns, ...extra]);
}

export const PRESETS: readonly Preset[] = [
  {
    id: "consistent-large-caps",
    label: "Consistent large caps",
    description: "Large Cap funds that beat their benchmark in at least 60% of 3Y rolling windows and have a median 3Y return of 12% or more.",
    apply: (base) => ({
      ...base,
      categories: ["Large Cap Fund"],
      ranges: {
        pctRolling3yBeatBenchmark: { min: 60 },
        rolling3yCagrMedian: { min: 12 },
      },
      columns: withColumns(base, ["pctRolling3yBeatBenchmark"]),
      sort: { id: "pctRolling3yBeatBenchmark", desc: true },
    }),
  },
  {
    id: "low-cost-index-funds",
    label: "Low-cost index funds",
    description: "Index funds charging 0.30% or less a year, cheapest first.",
    apply: (base) => ({
      ...base,
      categories: ["Index Funds"],
      ranges: { terPct: { max: 0.3 } },
      sort: { id: "terPct", desc: false },
    }),
  },
  {
    id: "high-alpha-mid-small",
    label: "High alpha mid/small",
    description: "Mid Cap and Small Cap funds with 3Y alpha of at least 3%.",
    apply: (base) => ({
      ...base,
      categories: ["Mid Cap Fund", "Small Cap Fund"],
      ranges: { alpha3y: { min: 3 } },
      columns: withColumns(base, ["infoRatio3y"]),
      sort: { id: "alpha3y", desc: true },
    }),
  },
  {
    id: "defensive-compounders",
    label: "Defensive compounders",
    description: "Equity funds with 5Y CAGR of at least 14% that fell no more than 25% from peak and captured under 95% of downside.",
    apply: (base) => ({
      ...base,
      groups: ["Equity"],
      ranges: {
        cagr5y: { min: 14 },
        maxDrawdown5y: { min: -25 },
        downCapture3y: { max: 95 },
      },
      columns: withColumns(base, ["downCapture3y", "upCapture3y"]),
      sort: { id: "cagr5y", desc: true },
    }),
  },
];

/** The preset applied to `current`: a cleared screen with the preset's filters, sort and columns. */
export function applyPreset(preset: Preset, current: ScreenerState): ScreenerState {
  const cleared = clearFilters({ ...current, columns: defaultState().columns });
  return preset.apply(cleared);
}

/** Which preset (if any) the screen currently is exactly, ignoring plan/option. */
export function activePresetId(current: ScreenerState): string | null {
  const key = (s: ScreenerState) => {
    const params = serializeScreenerState({ ...s, plans: current.plans, options: current.options });
    return params.toString();
  };
  const here = key(current);
  return PRESETS.find((p) => key(applyPreset(p, current)) === here)?.id ?? null;
}
