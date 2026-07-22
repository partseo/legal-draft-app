import { createRouteClient, createServiceClient } from "@/lib/db/clients";
import { getEnv } from "@/lib/env";
import { createManagedRuntime } from "@/lib/agent/managed-runtime";
import { createSupabaseRunStore } from "@/lib/runs/store";
import type { RunDeps } from "@/lib/runs/sync";

/** 로그인 사용자 확인 (실패 시 null) */
export async function requireUser(): Promise<{ userId: string } | null> {
  const supabase = await createRouteClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { userId: data.user.id } : null;
}

/** run 서비스 의존성 조립 — Storage·정산은 service role, 실행부는 Managed Agents */
export function buildRunDeps(): RunDeps {
  const env = getEnv();
  const service = createServiceClient();
  return {
    store: createSupabaseRunStore(service),
    runtime: createManagedRuntime({ env, settingsDb: service }),
    model: env.ANTHROPIC_AGENT_MODEL,
  };
}
