import type { AgentRuntime, Mount } from "@/lib/agent/adapter";
import { loadBundle } from "@/lib/agent/bundle";
import { buildKickoffPrompt } from "@/lib/agent/prompts";
import type { ValidAuthorMode } from "@/lib/agent/document-types";
import { getStagePolicy } from "@/lib/agent/document-types";
import { canStartStage } from "@/lib/pipeline";
import { buildMounts } from "@/lib/runs/mounts";
import type { RunStore, RunStage } from "@/lib/runs/store";

export async function startRun(
  deps: { store: RunStore; runtime: AgentRuntime },
  i: { caseId: string; stage: RunStage; instruction?: string | null; userId: string },
): Promise<{ runId: string }> {
  const { store, runtime } = deps;
  const round = await store.ensureRound(i.caseId);
  const authorMode = await store.getCaseAuthorMode(i.caseId);
  const pipe = await store.getPipelineInput(round.roundId);
  const verifyText = await store.latestArtifactText(i.caseId, "검증보고");
  const verifyHasFail = verifyText !== null && verifyText.includes("FAIL");
  const sp = getStagePolicy(round.kind);
  if (!canStartStage({ ...pipe, verifyHasFail, stagePolicy: sp }, i.stage)) {
    throw new Error(`실행할 수 없는 단계입니다: ${i.stage} (선행 단계 승인 또는 진행 중 실행을 확인하세요)`);
  }

  const { runId } = await store.insertRun({
    roundId: round.roundId,
    stage: i.stage,
    startedBy: i.userId,
    instruction: i.instruction?.trim() || null,
  });

  try {
    await runtime.ensureProvisioned();
    // hydrate: 번들 + 사건 파일 업로드 → 마운트 목록
    const bundle = loadBundle();
    const mounts: Mount[] = [];
    const bundleUp = await runtime.uploadFile("bundle.tar.gz", bundle.tarGz);
    mounts.push({ fileId: bundleUp.fileId, mountPath: "/workspace/bundle.tar.gz" });
    const files = await store.listCaseFiles(i.caseId);
    for (const m of buildMounts(files)) {
      const content = await store.downloadStorageFile(m.storagePath);
      const up = await runtime.uploadFile(m.mountPath.split("/").pop() ?? "file", content);
      mounts.push({ fileId: up.fileId, mountPath: m.mountPath });
    }

    const { sessionId } = await runtime.createSession({ title: `${i.caseId}:${i.stage}:${runId}`, mounts });
    await store.updateRun(runId, { agent_session_id: sessionId });
    await runtime.sendMessage(
      sessionId,
      buildKickoffPrompt({ stage: i.stage, roundKind: round.kind, instruction: i.instruction, authorMode: authorMode as ValidAuthorMode }),
    );
    await store.updateCaseStatus(i.caseId, "실행중");
    return { runId };
  } catch (e) {
    await store.updateRun(runId, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
      finished_at: new Date().toISOString(),
    });
    throw e;
  }
}
