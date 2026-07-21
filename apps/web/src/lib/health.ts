type HealthEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  LAW_OC: string;
};

export type Health = {
  ok: boolean;
  checks: { env: boolean; supabase: boolean; lawOc: boolean };
};

export async function computeHealth(
  env: HealthEnv,
  fetchFn: typeof fetch = fetch,
): Promise<Health> {
  const envOk = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const lawOc = Boolean(env.LAW_OC);
  let supabase = false;
  try {
    // REST 루트(/rest/v1/)는 service_role 전용이라 anon 키로 접근 가능한 auth 헬스를 사용
    const res = await fetchFn(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    });
    supabase = res.ok;
  } catch {
    supabase = false;
  }
  const checks = { env: envOk, supabase, lawOc };
  return { ok: Object.values(checks).every(Boolean), checks };
}
