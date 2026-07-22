import "server-only";
import { createServiceClient } from "@/lib/db/clients";
import { createSupabaseRunStore } from "@/lib/runs/store";
import {
  deriveStepStates,
  deriveCaseStatus,
  canStartStage,
  STAGES,
  type PipelineInput,
  type RunStage,
} from "@/lib/pipeline";
import type { StepState } from "@/components/case/pipeline-stepper";
import type { Tables, Enums } from "@/lib/db/database.types";

export type CaseDetail = {
  roundId: string;
  roundKind: Enums<"round_kind">;
  stepStates: Record<RunStage, StepState>;
  startable: Record<RunStage, boolean>;
  caseStatus: string;
  /** running | waiting_checkpoint 인 run (콘솔 표시 대상) */
  activeRun: Pick<Tables<"runs">, "id" | "stage" | "status" | "cost_usd"> | null;
  openCheckpoint: Tables<"checkpoints"> | null;
  /** kind별 최신 산출물 (텍스트 포함, 서면 docx는 내용 없이 메타만) */
  artifacts: Partial<
    Record<Enums<"file_kind">, { filename: string; version: number; storagePath: string; text: string | null }>
  >;
  /** 서면 kind 전 버전 (버전 히스토리용, 최신순) */
  draftVersions: { filename: string; version: number; storagePath: string; createdAt: string }[];
  verifyHasFail: boolean;
};

const TEXT_KINDS: Enums<"file_kind">[] = ["사건컨텍스트", "리서치", "검증보고", "context_json"];

export async function getCaseDetail(caseId: string): Promise<CaseDetail> {
  const db = createServiceClient();
  const store = createSupabaseRunStore(db);
  const round = await store.ensureRound(caseId);
  const pipe = await store.getPipelineInput(round.roundId);

  const files = await store.listCaseFiles(caseId);
  const artifacts: CaseDetail["artifacts"] = {};
  for (const kind of [...TEXT_KINDS, "서면" as const]) {
    const latest = files.filter((f) => f.kind === kind).sort((a, b) => b.version - a.version)[0];
    if (!latest) continue;
    const text = TEXT_KINDS.includes(kind)
      ? new TextDecoder().decode(await store.downloadStorageFile(latest.storage_path))
      : null;
    artifacts[kind] = { filename: latest.filename, version: latest.version, storagePath: latest.storage_path, text };
  }
  const verifyHasFail = artifacts["검증보고"]?.text?.includes("FAIL") ?? false;
  const input: PipelineInput = { ...pipe, verifyHasFail };

  const { data: activeRuns } = await db
    .from("runs")
    .select("id, stage, status, cost_usd")
    .eq("round_id", round.roundId)
    .in("status", ["running", "waiting_checkpoint"])
    .order("started_at", { ascending: false })
    .limit(1);
  const activeRun = activeRuns?.[0] ?? null;
  const openCheckpoint = activeRun ? await store.openCheckpoint(activeRun.id) : null;

  const draftVersions = files
    .filter((f) => f.kind === "서면")
    .sort((a, b) => b.version - a.version)
    .map((f) => ({ filename: f.filename, version: f.version, storagePath: f.storage_path, createdAt: f.created_at }));

  return {
    roundId: round.roundId,
    roundKind: round.kind,
    stepStates: deriveStepStates(input),
    startable: Object.fromEntries(STAGES.map((s) => [s, canStartStage(input, s)])) as Record<RunStage, boolean>,
    caseStatus: deriveCaseStatus(input),
    activeRun,
    openCheckpoint,
    artifacts,
    draftVersions,
    verifyHasFail,
  };
}
