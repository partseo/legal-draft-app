import { describe, it, expect, vi } from "vitest";
import { startRun } from "@/lib/runs/start";
import type { RunStore } from "@/lib/runs/store";
import type { AgentRuntime } from "@/lib/agent/adapter";

function fakes(over: Partial<RunStore> = {}) {
  const calls: Record<string, unknown[][]> = {};
  const track = (name: string, ret: unknown) => vi.fn(async (...a: unknown[]) => ((calls[name] ??= []).push(a), ret));
  const store = {
    ensureRound: track("ensureRound", { roundId: "r1", kind: "소장" }),
    getPipelineInput: track("getPipelineInput", { runs: [], reviews: [] }),
    listCaseFiles: track("listCaseFiles", [
      { kind: "입력", filename: "메모.md", storage_path: "c1/입력/메모.md", version: 1, created_at: "t" },
    ]),
    downloadStorageFile: track("downloadStorageFile", new Uint8Array([1])),
    insertRun: track("insertRun", { runId: "run1" }),
    updateRun: track("updateRun", true),
    latestArtifactText: track("latestArtifactText", null),
    updateCaseStatus: track("updateCaseStatus", undefined),
    ...over,
  } as unknown as RunStore;
  const runtime = {
    ensureProvisioned: vi.fn(async () => ({ agentId: "a", environmentId: "e" })),
    uploadFile: vi.fn(async (name: string) => ({ fileId: `file_${name}` })),
    createSession: vi.fn(async () => ({ sessionId: "sesn_1" })),
    sendMessage: vi.fn(async () => undefined),
  } as unknown as AgentRuntime;
  return { store, runtime, calls };
}

describe("startRun", () => {
  it("게이트 통과 → run 생성·hydrate·세션·킥오프·상태 갱신", async () => {
    const { store, runtime } = fakes();
    const out = await startRun({ store, runtime }, { caseId: "c1", stage: "intake", userId: "u1" });
    expect(out.runId).toBe("run1");
    // 번들 + 입력 1개 업로드
    expect((runtime.uploadFile as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toContain("bundle.tar.gz");
    const session = (runtime.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(session.mounts.some((m: { mountPath: string }) => m.mountPath === "/workspace/bundle.tar.gz")).toBe(true);
    expect(session.mounts.some((m: { mountPath: string }) => m.mountPath === "/workspace/case/입력/메모.md")).toBe(true);
    const kickoff = (runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(kickoff).toContain("case-intake");
  });

  it("게이트 위반(선행 단계 미승인) → 던지고 run 미생성", async () => {
    const { store, runtime, calls } = fakes();
    await expect(startRun({ store, runtime }, { caseId: "c1", stage: "draft", userId: "u1" })).rejects.toThrow(
      /실행할 수 없는 단계/,
    );
    expect(calls["insertRun"]).toBeUndefined();
  });

  it("세션 시작 실패 → run failed 기록 후 재던짐", async () => {
    const { store, runtime } = fakes();
    (runtime.createSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    await expect(startRun({ store, runtime }, { caseId: "c1", stage: "intake", userId: "u1" })).rejects.toThrow("boom");
    const updateCalls = (store.updateRun as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls.some((c) => (c[1] as { status?: string }).status === "failed")).toBe(true);
  });
});
