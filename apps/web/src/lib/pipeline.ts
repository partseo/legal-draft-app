import type { Tables, Enums } from "@/lib/db/database.types";
import type { StepState } from "@/components/case/pipeline-stepper";

export type RunStage = Enums<"run_stage">;
export const STAGES: RunStage[] = ["intake", "research", "draft", "verify"];

export type PipelineInput = {
  runs: Pick<Tables<"runs">, "id" | "stage" | "status" | "started_at" | "finished_at">[];
  reviews: Pick<Tables<"reviews">, "stage" | "decision" | "created_at">[];
  verifyHasFail: boolean;
};

function latestRun(input: PipelineInput, stage: RunStage) {
  return input.runs.filter((r) => r.stage === stage).sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0];
}

function isApproved(input: PipelineInput, stage: RunStage): boolean {
  const run = latestRun(input, stage);
  if (!run || run.status !== "succeeded") return false;
  if (stage === "verify" && input.verifyHasFail) return false;
  return input.reviews.some((v) => v.stage === stage && v.decision === "승인" && v.created_at > run.started_at);
}

export function deriveStepStates(input: PipelineInput): Record<RunStage, StepState> {
  const out = {} as Record<RunStage, StepState>;
  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const run = latestRun(input, stage);
    if (run && run.status === "running") out[stage] = "running";
    else if (run && run.status === "waiting_checkpoint") out[stage] = "action";
    else if (run && run.status === "failed") out[stage] = "fail";
    else if (run && run.status === "succeeded") {
      if (stage === "verify" && input.verifyHasFail) out[stage] = "fail";
      else out[stage] = isApproved(input, stage) ? "done" : "action";
    } else {
      const prevOk = i === 0 || isApproved(input, STAGES[i - 1]);
      out[stage] = prevOk ? "runnable" : "locked";
    }
  }
  return out;
}

export function canStartStage(input: PipelineInput, stage: RunStage): boolean {
  const busy = input.runs.some((r) => r.status === "running" || r.status === "waiting_checkpoint");
  if (busy) return false;
  const state = deriveStepStates(input)[stage];
  if (state === "runnable") return true;
  const run = latestRun(input, stage);
  return run !== undefined && ["succeeded", "failed", "canceled"].includes(run.status);
}

export function deriveCaseStatus(
  input: PipelineInput,
): "대기" | "실행중" | "응답 필요" | "검수 대기" | "제출 금지" | "완료" {
  if (input.runs.some((r) => r.status === "running")) return "실행중";
  if (input.runs.some((r) => r.status === "waiting_checkpoint")) return "응답 필요";
  if (input.verifyHasFail) return "제출 금지";
  if (isApproved(input, "verify")) return "완료";
  if (STAGES.some((s) => latestRun(input, s)?.status === "succeeded" && !isApproved(input, s))) return "검수 대기";
  return "대기";
}

/**
 * 단계 재실행 버튼 종류.
 * - "retry": 실패 단계 — 칩 자리에 큰 "다시 시도" 버튼 (확인 없이 즉시)
 * - "rerun": 완료·검수대기 단계 — 라벨 옆 작은 ↻ 아이콘 (confirm 후)
 * - null: 버튼 없음 (runnable은 기존 실행 버튼, locked/running/실행 중엔 미노출)
 */
export function rerunKind(state: StepState, startable: boolean): "retry" | "rerun" | null {
  if (!startable) return null;
  if (state === "fail") return "retry";
  if (state === "done" || state === "action") return "rerun";
  return null;
}
