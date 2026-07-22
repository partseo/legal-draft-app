import { NextResponse } from "next/server";
import { z } from "zod";
import { buildRunDeps, requireUser } from "@/lib/runs/context";
import { respondToCheckpoint } from "@/lib/runs/respond";

export const runtime = "nodejs";

const Body = z.object({ response: z.unknown() });

export async function POST(request: Request, ctx: { params: Promise<{ checkpointId: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { checkpointId } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  try {
    await respondToCheckpoint(buildRunDeps(), { checkpointId, response: parsed.data.response, userId: user.userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "응답 실패" }, { status: 500 });
  }
}
