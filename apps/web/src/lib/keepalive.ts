/**
 * Supabase 무료 플랜 자동 일시정지 방지.
 *
 * 무활동이 이어지면 프로젝트가 pause 되고 서브도메인이 DNS에서 회수된다(NXDOMAIN).
 * 그러면 로그인은 물론 앱 전체가 잠긴다. Postgres 를 실제로 건드려 "활동 중"을 유지한다 —
 * auth 헬스 핑(`/auth/v1/health`)은 DB 를 건드리지 않으므로 부족하다.
 *
 * **읽기가 아니라 쓰기다.** 2026-08 에 keepalive 가 있는데도 일시정지 경고를 받았는데,
 * 당시 구현이 읽기 전용이라 흔적을 남기지 않아 "안 돌았는지 / 돌았는데 부족했는지"를
 * 사후에 구분할 수 없었다. 이제 `keepalive_ping()` 이 하트비트 행을 갱신하므로
 * 응답의 lastPingAt·pingCount 만 보면 마지막 실행 시각을 바로 알 수 있다.
 */

type KeepaliveEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type KeepaliveResult = {
  ok: boolean;
  /** Postgres 에 실제로 닿았는지 */
  db: boolean;
  /** write=하트비트 기록 · read=폴백 조회 · none=DB 에 못 닿음 */
  mode: "write" | "read" | "none";
  /** DB 에는 닿았지만 하트비트를 남기지 못한 상태 (마이그레이션 미적용 등) */
  degraded: boolean;
  lastPingAt?: string;
  pingCount?: number;
  /** 실패·강등 시 진단 정보 */
  detail?: string;
};

/**
 * Vercel Cron / 외부 스케줄러 요청 검증.
 * Vercel 은 CRON_SECRET 이 설정돼 있으면 `Authorization: Bearer <CRON_SECRET>` 를 붙인다.
 *
 * 시크릿이 없으면 막지 않는다. 쓰기 엔드포인트가 됐지만 하는 일이 하트비트 한 줄 갱신이라
 * 남이 호출해도 해가 없고, 환경변수 누락으로 keepalive 가 조용히 죽는 쪽이 훨씬 위험하다.
 */
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** PostgREST 는 함수 반환을 객체로도 배열로도 준다 */
function firstRow(payload: unknown): { last_ping_at?: string; ping_count?: number } | null {
  if (Array.isArray(payload)) return (payload[0] as Record<string, never>) ?? null;
  if (payload && typeof payload === "object") return payload as Record<string, never>;
  return null;
}

/**
 * 하트비트 기록을 시도하고, 실패하면 읽기로 내려간다.
 *
 * 폴백이 있는 이유: 마이그레이션이 원격에 안 올라갔거나 함수가 없어도 **DB 활동 자체는
 * 일어나야** 한다. 일시정지를 막는 게 목적이므로, 기록에 실패했다고 아무것도 안 하고
 * 돌아오면 목적을 놓친다. 대신 degraded=true 로 올려 스케줄러가 경고할 수 있게 한다.
 */
export async function touchSupabase(
  env: KeepaliveEnv,
  fetchFn: typeof fetch = fetch,
): Promise<KeepaliveResult> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let writeFailure: string;

  try {
    const res = await fetchFn(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/keepalive_ping`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (res.ok) {
      const row = firstRow(await res.json().catch(() => null));
      return {
        ok: true,
        db: true,
        mode: "write",
        degraded: false,
        lastPingAt: row?.last_ping_at,
        pingCount: row?.ping_count,
      };
    }
    writeFailure = `rpc status ${res.status}`;
  } catch (e) {
    writeFailure = `rpc ${describe(e)}`;
  }

  const hint = `${writeFailure} — keepalive_ping 마이그레이션이 원격에 적용됐는지 확인 (npx supabase db push)`;
  try {
    const res = await fetchFn(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=id&limit=1`,
      { headers, cache: "no-store" },
    );
    if (res.ok) return { ok: true, db: true, mode: "read", degraded: true, detail: hint };
    return { ok: false, db: false, mode: "none", degraded: true, detail: `${hint} · read status ${res.status}` };
  } catch (e) {
    return { ok: false, db: false, mode: "none", degraded: true, detail: `${hint} · read ${describe(e)}` };
  }
}
