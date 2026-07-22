import { NextResponse } from "next/server";
import { z } from "zod";
import { Constants } from "@/lib/db/database.types";
import { buildRunDeps, requireUser } from "@/lib/runs/context";
import { startRun } from "@/lib/runs/start";

export const runtime = "nodejs";
export const maxDuration = 120; // hydrate 업로드 포함

const Body = z.object({
  stage: z.enum(Constants.public.Enums.run_stage),
  instruction: z.string().max(4000).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ caseId: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { caseId } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  try {
    const out = await startRun(buildRunDeps(), {
      caseId,
      stage: parsed.data.stage,
      instruction: parsed.data.instruction ?? null,
      userId: user.userId,
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "실행 시작 실패";
    const status = msg.includes("실행할 수 없는 단계") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
