import { ScreenerView } from "@/components/screener/screener-view";
import { getDb } from "@/db/client";
import { loadScreenerData } from "@/lib/screener/data";
import { parseScreenerState, serializeScreenerState } from "@/lib/screener/state";

export const metadata = { title: "Fund screener | MF Screener" };

export default async function ScreenerPage({ searchParams }: PageProps<"/">) {
  const state = parseScreenerState(await searchParams);
  const data = await loadScreenerData(getDb(), { plans: state.plans, options: state.options });
  return <ScreenerView key={serializeScreenerState(state).toString()} data={data} initialState={state} />;
}
