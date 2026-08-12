import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { isAuthorizedCron, touchSupabase } from "@/lib/keepalive";

export const runtime = "nodejs";
/** Cron이 매번 실제로 DB를 건드려야 하므로 캐시 금지 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let result;
  try {
    result = await touchSupabase(getEnv());
  } catch {
    result = { ok: false, db: false, detail: "env 검증 실패" };
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
