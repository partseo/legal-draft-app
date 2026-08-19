import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { isAuthorizedCron, touchSupabase } from "@/lib/keepalive";

export const runtime = "nodejs";
/** 매번 실제로 DB를 건드려야 하므로 캐시 금지 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let result;
  try {
    result = await touchSupabase(getEnv());
  } catch {
    result = { ok: false, db: false, mode: "none" as const, degraded: true, detail: "env 검증 실패" };
  }

  // degraded 는 200 으로 돌려준다 — DB 활동은 일어났으므로 일시정지는 막혔다.
  // 스케줄러가 본문의 degraded 를 보고 경고하도록 하고, 여기서 실패로 만들지 않는다.
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

/** GET 과 동일. 스케줄러가 POST 만 보낼 수 있는 경우를 위한 별칭. */
export const POST = GET;
