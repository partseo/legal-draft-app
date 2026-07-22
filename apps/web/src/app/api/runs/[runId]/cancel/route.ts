import { NextResponse } from "next/server";
import { buildRunDeps, requireUser } from "@/lib/runs/context";
import { cancelRun } from "@/lib/runs/sync";

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { runId } = await ctx.params;
  try {
    await cancelRun(buildRunDeps(), runId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "취소 실패" }, { status: 500 });
  }
}
