import type { AgentRuntime, RuntimeEvent } from "@/lib/agent/adapter";
import { parseCheckpoint, parseRunComplete } from "@/lib/agent/protocol";
import { computeRunningMs, estimateRunCost, estimateTokens } from "@/lib/agent/usage";
import type { RunStore } from "@/lib/runs/store";

export type RunDeps = { store: RunStore; runtime: AgentRuntime; model: string };
const TERMINAL = ["succeeded", "failed", "canceled"];
const ACTIVE: ("running" | "waiting_checkpoint")[] = ["running", "waiting_checkpoint"];

function lastMessageText(events: RuntimeEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "message") return e.text;
  }
  return "";
}

function isIdle(events: RuntimeEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "status_idle") return true;
    if (e.type === "status_running") return false;
  }
  return false;
}

/** 유일한 run 상태 전이 지점. 어디서 몇 번 불려도 안전(멱등). */
export async function syncRun(deps: RunDeps, runId: string): Promise<{ status: string }> {
  const { store, runtime, model } = deps;
  const run = await store.getRun(runId);
  if (TERMINAL.includes(run.status)) return { status: run.status };
  if (!run.agent_session_id) return { status: run.status };

  const events = await runtime.listEvents(run.agent_session_id);
  const outputTokens = events.reduce((n, e) => (e.type === "message" ? n + estimateTokens(e.text) : n), 0);
  const runningMs = computeRunningMs(events, new Date().toISOString());
  const cost = estimateRunCost({ outputTokens, runningMs, model });
  await store.updateRun(runId, { output_tokens: outputTokens, cost_usd: cost }, { onlyIfStatus: ACTIVE });

  const idle = isIdle(events);
  const { run_cost_cap_usd } = await store.getSettings();
  if (cost > run_cost_cap_usd && !idle) {
    await runtime.interrupt(run.agent_session_id);
    await store.updateRun(
      runId,
      {
        status: "failed",
        error: `비용 상한 초과 (추정 $${cost} > $${run_cost_cap_usd})`,
        finished_at: new Date().toISOString(),
      },
      { onlyIfStatus: ACTIVE },
    );
    await store.updateCaseStatus(run.round.case_id, "대기");
    return { status: "failed" };
  }

  const errorEvent = events.find((e) => e.type === "error");
  if (errorEvent && errorEvent.type === "error") {
    await store.updateRun(
      runId,
      { status: "failed", error: errorEvent.message, finished_at: new Date().toISOString() },
      { onlyIfStatus: ACTIVE },
    );
    await store.updateCaseStatus(run.round.case_id, "대기");
    return { status: "failed" };
  }

  if (!idle) return { status: run.status };

  const text = lastMessageText(events);
  const checkpoint = parseCheckpoint(text);
  const complete = parseRunComplete(text);

  if (checkpoint) {
    const open = await store.openCheckpoint(runId);
    if (!open) {
      await store.insertCheckpoint({ runId, kind: checkpoint.type, payload: checkpoint });
      await store.updateRun(runId, { status: "waiting_checkpoint" }, { onlyIfStatus: ["running"] });
      await store.updateCaseStatus(run.round.case_id, "응답 필요");
    }
    return { status: "waiting_checkpoint" };
  }

  if (run.status === "waiting_checkpoint") return { status: run.status }; // 응답 대기 중 idle은 정상

  if (complete) {
    const claimed = await store.updateRun(runId, { status: "succeeded" }, { onlyIfStatus: ["running"] });
    if (!claimed) return { status: (await store.getRun(runId)).status }; // 경쟁 호출이 선점
    const sessionFiles = await runtime.listSessionFiles(run.agent_session_id);
    for (const f of complete.files) {
      const match = sessionFiles.find((s) => s.filename === f.filename);
      if (!match) continue; // 선언됐지만 못 찾은 파일 — error에 기록하지 않고 스킵(부분 harvest 허용)
      const content = await runtime.downloadFile(match.fileId);
      const version = await store.nextFileVersion(run.round.case_id, f.kind, f.filename);
      await store.saveArtifact({ caseId: run.round.case_id, kind: f.kind, filename: f.filename, version, content, runId });
    }
    await store.updateRun(runId, { finished_at: new Date().toISOString(), output_tokens: outputTokens, cost_usd: cost });
    if (run.stage === "verify") {
      const report = await store.latestArtifactText(run.round.case_id, "검증보고");
      await store.updateCaseStatus(run.round.case_id, report?.includes("FAIL") ? "제출 금지" : "검수 대기");
    } else {
      await store.updateCaseStatus(run.round.case_id, "검수 대기");
    }
    return { status: "succeeded" };
  }

  await store.updateRun(
    runId,
    {
      status: "failed",
      error: "완료/체크포인트 마커 없이 세션이 종료됨 — 세션 로그 확인 필요",
      finished_at: new Date().toISOString(),
    },
    { onlyIfStatus: ACTIVE },
  );
  await store.updateCaseStatus(run.round.case_id, "대기");
  return { status: "failed" };
}

export async function cancelRun(deps: RunDeps, runId: string): Promise<void> {
  const { store, runtime } = deps;
  const run = await store.getRun(runId);
  if (TERMINAL.includes(run.status)) return;
  if (run.agent_session_id) await runtime.interrupt(run.agent_session_id);
  await store.updateRun(runId, { status: "canceled", finished_at: new Date().toISOString() }, { onlyIfStatus: ACTIVE });
  await store.updateCaseStatus(run.round.case_id, "대기");
}
