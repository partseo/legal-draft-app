import { z } from "zod";

const EnvSchema = z.object({
  LAW_OC: z.string().min(1),
  MCP_SHARED_SECRET: z.string().min(16),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // P2에서 필수화: ANTHROPIC_API_KEY
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** 서버 전용. 첫 호출 시 process.env를 검증하고 캐시한다. */
export function getEnv(): Env {
  if (!cached) cached = EnvSchema.parse(process.env);
  return cached;
}

/** 테스트 전용 — env 캐시 초기화 */
export function resetEnvCache(): void {
  cached = null;
}
