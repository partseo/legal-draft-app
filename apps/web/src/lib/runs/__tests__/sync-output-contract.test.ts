import { describe, it, expect, vi } from "vitest";
import { syncRun } from "@/lib/runs/sync";
import type { RunStore } from "@/lib/runs/store";
import type { AgentRuntime, RuntimeEvent } from "@/lib/agent/adapter";

// P5.5-5D — Output contract validation in syncRun (draft stage)

const msg = (id: string, text: string): RuntimeEvent => ({ id, at: null, type: "message", text });
const idle = (id: string): RuntimeEvent => ({ id, at: null, type: "status_idle" });

function makeRunComplete(files: { path: string; kind: string; filename: string }[]): string {
  return "```run-complete\n" + JSON.stringify({ files }) + "\n```";
}

function fakes(
  events: RuntimeEvent[],
  sessionFiles: { fileId: string; filename: string }[],
  roundKind: string = "소장",
  stage: string = "draft",
  over: Partial<RunStore> = {},
) {
  const state = {
    run: {
      id: "run1",
      round_id: "r1",
      stage,
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
      round: { id: "r1", kind: roundKind, case_id: "c1" },
    },
    artifacts: [] as unknown[],
    caseStatus: "",
  };
  const store = {
    getRun: vi.fn(async () => state.run),
    updateRun: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
      Object.assign(state.run, patch);
      return true;
    }),
    openCheckpoint: vi.fn(async () => null),
    insertCheckpoint: vi.fn(async () => undefined),
    respondCheckpoint: vi.fn(async () => undefined),
    nextFileVersion: vi.fn(async () => 1),
    saveArtifact: vi.fn(async (a: unknown) => void state.artifacts.push(a)),
    latestArtifactText: vi.fn(async () => null),
    updateCaseStatus: vi.fn(async (_c: string, s: string) => void (state.caseStatus = s)),
    getSettings: vi.fn(async () => ({ run_cost_cap_usd: 100 })),
    ...over,
  } as unknown as RunStore;
  const runtime = {
    listEvents: vi.fn(async () => events),
    listSessionFiles: vi.fn(async () => sessionFiles),
    downloadFile: vi.fn(async () => new Uint8Array([123])),
    interrupt: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => undefined),
  } as unknown as AgentRuntime;
  return { store, runtime, state };
}
const deps = (f: ReturnType<typeof fakes>) => ({
  store: f.store,
  runtime: f.runtime,
  model: "claude-sonnet-5",
  harvest: { attempts: 1, delayMs: 0 },
});

describe("P5.5-5D: Draft output contract in syncRun", () => {
  // ── 소장 single output — correct ────────────────────────────────
  it("소장 — correct single output → succeeded", async () => {
    const files = [{ path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" }];
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "소장_초안.docx" }],
      "소장",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(1);
  });

  // ── 소장 — wrong filename (missing the required one) ─────────────
  it("소장 — wrong filename declared → failed with 누락 + 미등록", async () => {
    const files = [{ path: "잘못된파일.docx", kind: "서면", filename: "잘못된파일.docx" }];
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "잘못된파일.docx" }],
      "소장",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("failed");
    expect(f.state.run.error).toContain("산출물 계약 위반");
    expect(f.state.run.error).toContain("누락");
    expect(f.state.run.error).toContain("미등록");
  });

  // ── 소장 — undeclared output ────────────────────────────────────
  it("소장 — undeclared extra output → failed with 미등록", async () => {
    const files = [
      { path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" },
      { path: "침입자.docx", kind: "서면", filename: "침입자.docx" },
    ];
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [
        { fileId: "f1", filename: "소장_초안.docx" },
        { fileId: "f2", filename: "침입자.docx" },
      ],
      "소장",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("failed");
    expect(f.state.run.error).toContain("미등록");
  });

  // ── 개인회생 5 outputs — all present → succeeded ────────────────
  it("개인회생 — all 5 outputs → succeeded", async () => {
    const filenames = [
      "개인회생신청서_초안.docx",
      "채권자목록.docx",
      "재산목록.docx",
      "수입지출목록.docx",
      "변제계획안.docx",
    ];
    const files = filenames.map((f) => ({ path: f, kind: "서면", filename: f }));
    const sessionFiles = filenames.map((f, i) => ({ fileId: `f${i}`, filename: f }));
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      sessionFiles,
      "개인회생신청서",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(5);
  });

  // ── 개인회생 — 1 missing → failed ──────────────────────────────
  it("개인회생 — 4 of 5 outputs → failed with 누락", async () => {
    const filenames = [
      "개인회생신청서_초안.docx",
      "채권자목록.docx",
      "재산목록.docx",
      "수입지출목록.docx",
    ];
    const files = filenames.map((f) => ({ path: f, kind: "서면", filename: f }));
    const sessionFiles = filenames.map((f, i) => ({ fileId: `f${i}`, filename: f }));
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      sessionFiles,
      "개인회생신청서",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("failed");
    expect(f.state.run.error).toContain("누락");
    expect(f.state.run.error).toContain("변제계획안.docx");
  });

  // ── 파산면책 3 outputs ─────────────────────────────────────────
  it("파산면책 — all 3 outputs → succeeded", async () => {
    const filenames = ["파산면책신청서_초안.docx", "채권자목록.docx", "재산목록.docx"];
    const files = filenames.map((f) => ({ path: f, kind: "서면", filename: f }));
    const sessionFiles = filenames.map((f, i) => ({ fileId: `f${i}`, filename: f }));
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      sessionFiles,
      "파산면책신청서",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(3);
  });

  // ── Duplicate filename ─────────────────────────────────────────
  it("duplicate filename → failed with 중복", async () => {
    const files = [
      { path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" },
      { path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" },
    ];
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "소장_초안.docx" }],
      "소장",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("failed");
    expect(f.state.run.error).toContain("중복");
  });

  // ── Non-draft stage skips output contract ──────────────────────
  it("intake stage — output contract not enforced", async () => {
    const files = [{ path: "사건컨텍스트.json", kind: "사건컨텍스트", filename: "사건컨텍스트.json" }];
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "사건컨텍스트.json" }],
      "소장",
      "intake",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("succeeded");
  });

  // ── Unknown roundKind in draft → all outputs rejected ──────────
  it("unknown roundKind in draft → failed", async () => {
    const files = [{ path: "whatever.docx", kind: "서면", filename: "whatever.docx" }];
    const f = fakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "whatever.docx" }],
      "존재하지않는유형",
    );
    const out = await syncRun(deps(f), "run1");
    expect(out.status).toBe("failed");
    expect(f.state.run.error).toContain("산출물 계약 위반");
  });
});
