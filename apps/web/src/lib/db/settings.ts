import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/db/database.types";

export type AppSettings = Tables<"app_settings">;
/** 테스트에서 fake 주입을 위해 구조적 타입으로 받는다 */
export type SettingsDb = Pick<SupabaseClient<Database>, "from">;

export async function getAppSettings(db: SettingsDb): Promise<AppSettings> {
  const { data, error } = await db.from("app_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error(`app_settings 조회 실패: ${error?.message ?? "row 없음"}`);
  return data;
}

export async function saveProvision(
  db: SettingsDb,
  p: { environmentId: string; agentId: string; configHash: string },
): Promise<void> {
  const { error } = await db
    .from("app_settings")
    .update({
      anthropic_environment_id: p.environmentId,
      anthropic_agent_id: p.agentId,
      agent_config_hash: p.configHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(`app_settings 갱신 실패: ${error.message}`);
}
