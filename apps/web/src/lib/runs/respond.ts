import { buildCheckpointReply } from "@/lib/agent/prompts";
import type { RunDeps } from "@/lib/runs/sync";

export async function respondToCheckpoint(
  deps: RunDeps,
  i: { checkpointId: string; response: unknown; userId: string },
): Promise<void> {
  const { store, runtime } = deps;
  const cp = await store.respondCheckpoint(i.checkpointId, i.response, i.userId);
  const run = await store.getRun(cp.run_id);
  if (!run.agent_session_id) throw new Error("세션 ID가 없는 run입니다");
  await runtime.sendMessage(run.agent_session_id, buildCheckpointReply(cp.kind, i.response));
  await store.updateRun(cp.run_id, { status: "running" }, { onlyIfStatus: ["waiting_checkpoint"] });
  await store.updateCaseStatus(run.round.case_id, "실행중");
}
