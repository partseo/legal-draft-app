import { describe, it, expect, vi } from "vitest";
import { syncRun, cancelRun } from "@/lib/runs/sync";
import { respondToCheckpoint } from "@/lib/runs/respond";
import type { RunStore } from "@/lib/runs/store";
import type { AgentRuntime, RuntimeEvent } from "@/lib/agent/adapter";

const msg = (id: string, text: string): RuntimeEvent => ({ id, at: null, type: "message", text });
const idle = (id: string): RuntimeEvent => ({ id, at: null, type: "status_idle" });

const RUN = {
  id: "run1",
  round_id: "r1",
  stage: "intake",
  status: "running",
  agent_session_id: "sesn_1",
  instruction: null,
  input_tokens: 0,
  output_tokens: 0,
  cost_usd: 0,
  error: null,
  started_by: "u1",
  started_at: "2026-07-22T00:00:00Z",
  finished_at: null,
  round: { id: "r1", kind: "소장", case_id: "c1" },
};

function fakes(events: RuntimeEvent[], over: Partial<RunStore> = {}) {
  const state = { run: { ...RUN }, checkpoints: [] as unknown[], artifacts: [] as unknown[], caseStatus: "" };
  const store = {
    getRun: vi.fn(async () => state.run),
    updateRun: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
      Object.assign(state.run, patch);
      return true;
    }),
    openCheckpoint: vi.fn(async () => null),
    insertCheckpoint: vi.fn(async (c: unknown) => void state.checkpoints.push(c)),
    respondCheckpoint: vi.fn(async () => ({ id: "cp1", run_id: "run1", kind: "쟁점승인" })),
    nextFileVersion: vi.fn(async () => 1),
    saveArtifact: vi.fn(async (a: unknown) => void state.artifacts.push(a)),
    latestArtifactText: vi.fn(async () => null),
    updateCaseStatus: vi.fn(async (_c: string, s: string) => void (state.caseStatus = s)),
    getSettings: vi.fn(async () => ({ run_cost_cap_usd: 5 })),
    ...over,
  } as unknown as RunStore;
  const runtime = {
    listEvents: vi.fn(async () => events),
    listSessionFiles: vi.fn(async () => [{ fileId: "f1", filename: "사건컨텍스트.json" }]),
    downloadFile: vi.fn(async () => new Uint8Array([123])),
    interrupt: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => undefined),
  } as unknown as AgentRuntime;
  return { store, runtime, state };
}
const deps = (f: ReturnType<typeof fakes>) => ({ store: f.store, runtime: f.runtime, model: "claude-sonnet-5" });

describe("syncRun", () => {
  it("idle + checkpoint 블록 → waiting_checkpoint + 체크포인트 생성 + 응답 필요", async () => {
    const f = fakes([
      msg("e1", '```checkpoint\n{"type":"쟁점승인","issues":[{"id":"쟁점1","title":"t","claim":"c"}]}\n```'),
      idle("e2"),
    ]);
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("waiting_checkpoint");
    expect(f.state.checkpoints.length).toBe(1);
    expect(f.state.caseStatus).toBe("응답 필요");
  });

  it("idle + run-complete → harvest·succeeded·검수 대기", async () => {
    const f = fakes([
      msg(
        "e1",
        '```run-complete\n{"files":[{"path":"사건컨텍스트.json","kind":"사건컨텍스트","filename":"사건컨텍스트.json"}]}\n```',
      ),
      idle("e2"),
    ]);
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(1);
    expect(f.state.caseStatus).toBe("검수 대기");
  });

  it("run-complete인데 선언 파일이 세션에 하나도 없음 → failed (유령 성공 방지)", async () => {
    const f = fakes([
      msg(
        "e1",
        '```run-complete\n{"files":[{"path":"사건컨텍스트.json","kind":"사건컨텍스트","filename":"사건컨텍스트.json"}]}\n```',
      ),
      idle("e2"),
    ]);
    // 산출물은 없고 입력 마운트만 보이는 실제 상황 재현
    (f.runtime.listSessionFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fileId: "in1", filename: "사건기록.md" },
    ]);
    const out = await syncRun({ ...deps(f), harvest: { attempts: 2, delayMs: 0 } }, "run1");
    expect(out.status).toBe("failed");
    expect(f.state.artifacts.length).toBe(0);
    expect(f.state.run.error).toContain("회수하지 못했습니다");
  });

  it("인덱싱 지연: 첫 조회는 비어도 재시도로 harvest → succeeded", async () => {
    const f = fakes([
      msg(
        "e1",
        '```run-complete\n{"files":[{"path":"사건컨텍스트.json","kind":"사건컨텍스트","filename":"사건컨텍스트.json"}]}\n```',
      ),
      idle("e2"),
    ]);
    (f.runtime.listSessionFiles as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // idle 직후 아직 인덱싱 전
      .mockResolvedValue([{ fileId: "f1", filename: "사건컨텍스트.json" }]); // 재시도 시 등장
    const out = await syncRun({ ...deps(f), harvest: { attempts: 3, delayMs: 0 } }, "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(1);
  });

  it("verify + FAIL 보고 → 제출 금지", async () => {
    const f = fakes(
      [
        msg(
          "e1",
          '```run-complete\n{"files":[{"path":"검증보고_소장.md","kind":"검증보고","filename":"검증보고_소장.md"}]}\n```',
        ),
        idle("e2"),
      ],
      { latestArtifactText: vi.fn(async () => "…\n**FAIL — 제출 금지**") },
    );
    f.state.run.stage = "verify";
    (f.runtime.listSessionFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fileId: "f1", filename: "검증보고_소장.md" },
    ]);
    (f.runtime.downloadFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      new TextEncoder().encode("**FAIL — 제출 금지**"),
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.caseStatus).toBe("제출 금지");
  });

  it("idle인데 마커 없음 → failed", async () => {
    const f = fakes([msg("e1", "그냥 끝"), idle("e2")]);
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("failed");
  });

  it("아직 running(마지막이 idle 아님) → 상태 유지, 비용만 갱신", async () => {
    const f = fakes([{ id: "e1", at: null, type: "status_running" }, msg("e2", "작업 중…")]);
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("running");
  });

  it("종결 run은 그대로 반환 (멱등)", async () => {
    const f = fakes([]);
    f.state.run.status = "succeeded";
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.runtime.listEvents).not.toHaveBeenCalled();
  });

  it("비용 상한 초과 + 실행 중 → interrupt + failed", async () => {
    const big = "가".repeat(4_000_000); // ≈2M 토큰 → sonnet-5 기준 $60 > $5
    const f = fakes([{ id: "e0", at: null, type: "status_running" }, msg("e1", big)]);
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("failed");
    expect(f.runtime.interrupt).toHaveBeenCalled();
  });
});

describe("respondToCheckpoint / cancelRun", () => {
  it("응답 → checkpoint 응답됨·세션 재개·run running", async () => {
    const f = fakes([]);
    f.state.run.status = "waiting_checkpoint";
    await respondToCheckpoint(deps(f), { checkpointId: "cp1", response: { issues: [] }, userId: "u1" });
    expect(f.runtime.sendMessage).toHaveBeenCalled();
    expect(f.state.run.status).toBe("running");
    expect(f.state.caseStatus).toBe("실행중");
  });

  it("취소 → interrupt + canceled", async () => {
    const f = fakes([]);
    await cancelRun(deps(f), "run1");
    expect(f.runtime.interrupt).toHaveBeenCalled();
    expect(f.state.run.status).toBe("canceled");
  });
});
