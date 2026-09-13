import type { SupabaseClient } from "@supabase/supabase-js";

export interface UsageTotals {
  totalCost: number;
  runCount: number;
}

export async function fetchUsageTotals(
  supabase: SupabaseClient,
): Promise<UsageTotals> {
  const { data, error } = await supabase.rpc("get_usage_totals");
  if (error) throw new Error(`get_usage_totals failed: ${error.message}`);
  if (!data) throw new Error("get_usage_totals returned no data");
  const row = data as { total_cost: number | null; run_count: number };
  return {
    totalCost: Number(row.total_cost ?? 0),
    runCount: Number(row.run_count),
  };
}
