/**
 * Supabase 무료 플랜 자동 일시정지 방지.
 *
 * 무활동이 이어지면 프로젝트가 pause 되고 서브도메인이 DNS에서 회수된다(NXDOMAIN).
 * 그러면 로그인은 물론 앱 전체가 잠긴다. 하루 한 번 Postgres를 실제로 조회해
 * "활동 중" 상태를 유지한다 — auth 헬스 핑은 DB를 건드리지 않으므로 부족하다.
 */

type KeepaliveEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type KeepaliveResult = {
  ok: boolean;
  /** Postgres 조회 성공 여부 */
  db: boolean;
  /** 실패 시 진단 정보 */
  detail?: string;
};

/**
 * Vercel Cron 요청 검증. Vercel은 CRON_SECRET이 설정돼 있으면
 * `Authorization: Bearer <CRON_SECRET>` 헤더를 붙여 호출한다.
 * 시크릿이 없으면 막지 않는다 — 이 엔드포인트는 읽기 전용이고 비밀을 반환하지 않는다.
 */
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

/** RLS를 우회해 확실히 쿼리가 돌도록 service_role 키로 테이블을 한 건 읽는다. */
export async function touchSupabase(
  env: KeepaliveEnv,
  fetchFn: typeof fetch = fetch,
): Promise<KeepaliveResult> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const res = await fetchFn(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, db: false, detail: `status ${res.status}` };
    return { ok: true, db: true };
  } catch (e) {
    return { ok: false, db: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
