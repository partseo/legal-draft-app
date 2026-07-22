"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createRouteClient } from "@/lib/db/clients";
import { buildRunDeps } from "@/lib/runs/context";
import { startRun } from "@/lib/runs/start";
import { Constants } from "@/lib/db/database.types";
import { deriveCaseStatus } from "@/lib/pipeline";

const StageSchema = z.enum(Constants.public.Enums.run_stage);

async function requireUserId(): Promise<string> {
  const supabase = await createRouteClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return data.user.id;
}

/** 검수 승인 → reviews(승인) 기록. 다음 단계는 파생 로직이 자동 해제. */
export async function approveStage(caseId: string, roundId: string, stageRaw: string): Promise<void> {
  const userId = await requireUserId();
  const stage = StageSchema.parse(stageRaw);
  const supabase = await createRouteClient(); // RLS 사용자 컨텍스트로 기록
  const { error } = await supabase
    .from("reviews")
    .insert({ round_id: roundId, stage, decision: "승인", reviewer: userId });
  if (error) throw new Error(`승인 기록 실패: ${error.message}`);
  // 사건 배지 재계산
  const deps = buildRunDeps();
  const pipe = await deps.store.getPipelineInput(roundId);
  const verifyText = await deps.store.latestArtifactText(caseId, "검증보고");
  await deps.store.updateCaseStatus(
    caseId,
    deriveCaseStatus({ ...pipe, verifyHasFail: verifyText?.includes("FAIL") ?? false }),
  );
  revalidatePath(`/cases/${caseId}`);
}

/** 수정 지시 → reviews(수정지시) 기록 + 같은 단계 재실행 */
export async function requestChanges(
  caseId: string,
  roundId: string,
  stageRaw: string,
  note: string,
): Promise<void> {
  const userId = await requireUserId();
  const stage = StageSchema.parse(stageRaw);
  const instruction = note.trim();
  if (!instruction) throw new Error("수정 지시문을 입력하세요");
  const supabase = await createRouteClient();
  const { error } = await supabase
    .from("reviews")
    .insert({ round_id: roundId, stage, decision: "수정지시", note: instruction, reviewer: userId });
  if (error) throw new Error(`수정지시 기록 실패: ${error.message}`);
  await startRun(buildRunDeps(), { caseId, stage, instruction, userId });
  revalidatePath(`/cases/${caseId}`);
}
