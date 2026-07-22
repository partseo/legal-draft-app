import { z } from "zod";

const EnvSchema = z.object({
  LAW_OC: z.string().min(1),
  MCP_SHARED_SECRET: z.string().min(16),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // P2: Managed Agents 실행 코어
  ANTHROPIC_API_KEY: z.string().min(1),
  /** 에이전트·Anthropic 클라우드가 접근할 이 앱의 공개 URL (MCP 엔드포인트 도달용). 로컬 dev에서도 배포 URL을 넣는다. */
  APP_PUBLIC_URL: z
    .string()
    .url()
    .transform((u) => u.replace(/\/+$/, "")),
  ANTHROPIC_AGENT_MODEL: z.string().min(1).default("claude-sonnet-5"),
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
