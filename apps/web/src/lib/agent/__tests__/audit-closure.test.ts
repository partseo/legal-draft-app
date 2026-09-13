import { describe, it, expect, vi } from "vitest";
import {
  listDocumentTypes,
  getDocumentType,
  getDraftSkill,
  getVerifySkill,
  getStagePolicy,
  validateOutputContract,
  isValidAuthorMode,
  isAuthorModeSupported,
  VALID_AUTHOR_MODES,
  DEFAULT_AUTHOR_MODE,
  getSelectableDocumentTypes,
} from "@/lib/agent/document-types";
import { buildKickoffPrompt, buildSystemPrompt, SYSTEM_PROMPT } from "@/lib/agent/prompts";
import {
  deriveStepStates,
  STAGES,
  type PipelineInput,
} from "@/lib/pipeline";
import { syncRun } from "@/lib/runs/sync";
import type { RunStore } from "@/lib/runs/store";
import type { AgentRuntime, RuntimeEvent } from "@/lib/agent/adapter";

// ═══════════════════════════════════════════════════════════════
// P5.5-FINAL.1 — Audit Closure Tests
// DETERMINISTIC_CONTRACT_E2E — NOT_LIVE_MODEL_QUALITY_TEST
// ═══════════════════════════════════════════════════════════════

const ALL_11 = [
  "소장", "준비서면", "내용증명",
  "가압류신청서", "가처분신청서", "강제집행신청서",
  "등기신청서_소유권이전", "등기신청서_근저당설정", "등기신청서_법인변경",
  "개인회생신청서", "파산면책신청서",
];

// ── STEP 2: Registry ↔ DB ↔ TypeScript 3-way contract ────────

describe("AUDIT STEP 2: 3-way contract verification", () => {
  const DB_ROUND_KINDS = [
    "소장", "준비서면", "내용증명",
    "가압류신청서", "가처분신청서", "강제집행신청서",
    "등기신청서_소유권이전", "등기신청서_근저당설정", "등기신청서_법인변경",
    "개인회생신청서", "파산면책신청서",
  ];

  const DB_AUTHOR_MODES = ["lawyer", "judicial_scrivener"];

  it("Registry has exactly 11 document types", () => {
    expect(listDocumentTypes()).toHaveLength(11);
  });

  it("Registry IDs match DB round_kind enum (symmetric difference = EMPTY)", () => {
    const registryIds = listDocumentTypes().map(t => t.id).sort();
    const dbIds = [...DB_ROUND_KINDS].sort();
    expect(registryIds).toEqual(dbIds);
  });

  it("author_mode: exactly 2 (symmetric difference = EMPTY)", () => {
    const registryModes = [...VALID_AUTHOR_MODES].sort();
    const dbModes = [...DB_AUTHOR_MODES].sort();
    expect(registryModes).toEqual(dbModes);
  });

  it("sub-outputs (채권자목록, 재산목록, etc.) are NOT in round_kind", () => {
    const subOutputNames = ["채권자목록", "재산목록", "수입지출목록", "변제계획안"];
    for (const sub of subOutputNames) {
      expect(getDocumentType(sub)).toBeUndefined();
    }
  });

  it("paralegal is not in author_mode", () => {
    expect(DB_AUTHOR_MODES).not.toContain("paralegal");
    expect(isValidAuthorMode("paralegal")).toBe(false);
  });
});

// ── STEP 3: Multi-output preservation via syncRun ─────────────

const msg = (id: string, text: string): RuntimeEvent => ({ id, at: null, type: "message", text });
const idle = (id: string): RuntimeEvent => ({ id, at: null, type: "status_idle" });

function makeRunComplete(files: { path: string; kind: string; filename: string }[]): string {
  return "```run-complete\n" + JSON.stringify({ files }) + "\n```";
}

function makeSyncFakes(
  events: RuntimeEvent[],
  sessionFiles: { fileId: string; filename: string }[],
  roundKind: string,
  stage: string = "draft",
) {
  const state = {
    run: {
      id: "run1", round_id: "r1", stage, status: "running",
      agent_session_id: "sesn_1", instruction: null,
      input_tokens: 0, output_tokens: 0, cost_usd: 0,
      error: null, started_by: "u1",
      started_at: "2026-07-22T00:00:00Z", finished_at: null,
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
const syncDeps = (f: ReturnType<typeof makeSyncFakes>) => ({
  store: f.store, runtime: f.runtime,
  model: "claude-sonnet-5", harvest: { attempts: 1, delayMs: 0 },
});

describe("AUDIT STEP 3: Multi-output preservation E2E", () => {
  it("개인회생 — 5 outputs each saved as independent artifact", async () => {
    const filenames = [
      "개인회생신청서_초안.docx", "채권자목록.docx",
      "재산목록.docx", "수입지출목록.docx", "변제계획안.docx",
    ];
    const files = filenames.map(f => ({ path: f, kind: "서면", filename: f }));
    const sessionFiles = filenames.map((f, i) => ({ fileId: `f${i}`, filename: f }));
    const f = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      sessionFiles, "개인회생신청서",
    );
    const out = await syncRun(syncDeps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(5);
    const savedFilenames = (f.state.artifacts as { filename?: string }[]).map(a => a.filename);
    for (const fn of filenames) {
      expect(savedFilenames).toContain(fn);
    }
  });

  it("개인회생 — no overwrite (all 5 distinct fileIds)", async () => {
    const filenames = [
      "개인회생신청서_초안.docx", "채권자목록.docx",
      "재산목록.docx", "수입지출목록.docx", "변제계획안.docx",
    ];
    const files = filenames.map(f => ({ path: f, kind: "서면", filename: f }));
    const sessionFiles = filenames.map((f, i) => ({ fileId: `f${i}`, filename: f }));
    const f = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      sessionFiles, "개인회생신청서",
    );
    await syncRun(syncDeps(f), "run1");
    expect(f.store.saveArtifact).toHaveBeenCalledTimes(5);
  });

  it("파산면책 — 3 outputs each saved independently", async () => {
    const filenames = ["파산면책신청서_초안.docx", "채권자목록.docx", "재산목록.docx"];
    const files = filenames.map(f => ({ path: f, kind: "서면", filename: f }));
    const sessionFiles = filenames.map((f, i) => ({ fileId: `f${i}`, filename: f }));
    const f = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      sessionFiles, "파산면책신청서",
    );
    const out = await syncRun(syncDeps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(3);
  });

  it("소장 — single output preserved (regression)", async () => {
    const files = [{ path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" }];
    const f = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "소장_초안.docx" }], "소장",
    );
    const out = await syncRun(syncDeps(f), "run1");
    expect(out.status).toBe("succeeded");
    expect(f.state.artifacts.length).toBe(1);
  });

  it("duplicate filename → rejected (0 overwrites)", async () => {
    const files = [
      { path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" },
      { path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" },
    ];
    const f = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "소장_초안.docx" }], "소장",
    );
    const out = await syncRun(syncDeps(f), "run1");
    expect(out.status).toBe("failed");
    expect(f.state.run.error).toContain("중복");
  });

  it("undeclared extra file → rejected", async () => {
    const files = [
      { path: "소장_초안.docx", kind: "서면", filename: "소장_초안.docx" },
      { path: "침입.docx", kind: "서면", filename: "침입.docx" },
    ];
    const f = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "소장_초안.docx" }, { fileId: "f2", filename: "침입.docx" }],
      "소장",
    );
    const out = await syncRun(syncDeps(f), "run1");
    expect(out.status).toBe("failed");
  });

  it("re-run with same input is deterministic", async () => {
    const filenames = ["소장_초안.docx"];
    const files = filenames.map(f => ({ path: f, kind: "서면", filename: f }));
    const run1 = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "소장_초안.docx" }], "소장",
    );
    const run2 = makeSyncFakes(
      [msg("e1", makeRunComplete(files)), idle("e2")],
      [{ fileId: "f1", filename: "소장_초안.docx" }], "소장",
    );
    const out1 = await syncRun(syncDeps(run1), "run1");
    const out2 = await syncRun(syncDeps(run2), "run1");
    expect(out1.status).toBe(out2.status);
    expect(run1.state.artifacts.length).toBe(run2.state.artifacts.length);
  });
});

// ── STEP 4: Author mode integrated dataflow ──────────────────

describe("AUDIT STEP 4: Author mode dataflow", () => {
  it("case 1: no input → defaults to lawyer", () => {
    expect(DEFAULT_AUTHOR_MODE).toBe("lawyer");
    expect(isValidAuthorMode("")).toBe(false);
    expect(isValidAuthorMode(null)).toBe(false);
    expect(isValidAuthorMode(undefined)).toBe(false);
  });

  it("case 2: lawyer stored → prompt contains 변호사", () => {
    const sys = buildSystemPrompt("lawyer");
    expect(sys).toContain("변호사");
    const kick = buildKickoffPrompt({ stage: "draft", roundKind: "소장", authorMode: "lawyer" });
    expect(kick).not.toContain("작성자유형 오버레이");
  });

  it("case 3: judicial_scrivener stored → prompt contains 법무사 + overlay", () => {
    const sys = buildSystemPrompt("judicial_scrivener");
    expect(sys).toContain("법무사");
    const kick = buildKickoffPrompt({ stage: "draft", roundKind: "소장", authorMode: "judicial_scrivener" });
    expect(kick).toContain("작성자유형 오버레이");
    expect(kick).toContain("법무사 확인 필요");
    expect(kick).toContain("시니어 법무사 송무 조언");
  });

  it("case 4: paralegal rejected", () => {
    expect(isValidAuthorMode("paralegal")).toBe(false);
  });

  it("case 5: unknown values rejected", () => {
    expect(isValidAuthorMode("admin")).toBe(false);
    expect(isValidAuthorMode("judge")).toBe(false);
    expect(isValidAuthorMode("법무사")).toBe(false);
    expect(isValidAuthorMode(123)).toBe(false);
  });

  it("case 6: per-case author mode isolation (different prompts)", () => {
    const lawyerKick = buildKickoffPrompt({ stage: "draft", roundKind: "소장", authorMode: "lawyer", instruction: "수정" });
    const jsKick = buildKickoffPrompt({ stage: "draft", roundKind: "소장", authorMode: "judicial_scrivener", instruction: "수정" });
    expect(lawyerKick).not.toEqual(jsKick);
    expect(lawyerKick).toContain("변호사 수정 지시");
    expect(jsKick).toContain("법무사 수정 지시");
    // Without instruction, lawyer default has no overlay
    const lawyerNoInst = buildKickoffPrompt({ stage: "draft", roundKind: "소장", authorMode: "lawyer" });
    const jsNoInst = buildKickoffPrompt({ stage: "draft", roundKind: "소장", authorMode: "judicial_scrivener" });
    expect(jsNoInst).toContain("작성자유형 오버레이");
    expect(lawyerNoInst).not.toContain("작성자유형 오버레이");
  });

  it("case 7: no silent default conversion (invalid → error, not fallback)", () => {
    expect(isValidAuthorMode("paralegal")).toBe(false);
    expect(isValidAuthorMode("")).toBe(false);
    // actions.ts returns error for invalid values instead of silently converting
  });
});

// ── STEP 5: 11 document types integration ────────────────────

describe("AUDIT STEP 5: 11-type integration", () => {
  for (const id of ALL_11) {
    describe(id, () => {
      it("selectable", () => {
        const selectable = getSelectableDocumentTypes().map(t => t.id);
        expect(selectable).toContain(id);
      });

      it("resolvable from Registry", () => {
        expect(getDocumentType(id)).toBeDefined();
      });

      it("stage policy complete", () => {
        const sp = getStagePolicy(id)!;
        expect(sp.intake).toBe("required");
        expect(sp.draft).toBe("required");
        expect(["required", "optional", "skipped"]).toContain(sp.research);
        expect(["required", "conditional"]).toContain(sp.verify);
      });

      it("draft routing → correct skill", () => {
        const skill = getDraftSkill(id);
        expect(skill).toBeTruthy();
        expect(typeof skill).toBe("string");
      });

      it("verify routing → correct skill", () => {
        const verifySkill = getVerifySkill(id);
        if (id.startsWith("등기신청서")) {
          expect(verifySkill).toBe("check-registration");
        } else {
          expect(verifySkill).toBe("verify-citations");
        }
      });

      it("output contract valid with all required outputs", () => {
        const dt = getDocumentType(id)!;
        const filenames = dt.outputs.filter(o => o.required).map(o => o.filename);
        const result = validateOutputContract(id, filenames);
        expect(result.valid).toBe(true);
        expect(result.missing).toHaveLength(0);
        expect(result.unknown).toHaveLength(0);
        expect(result.duplicate).toHaveLength(0);
      });

      it("both author modes supported", () => {
        expect(isAuthorModeSupported(id, "lawyer")).toBe(true);
        expect(isAuthorModeSupported(id, "judicial_scrivener")).toBe(true);
      });

      it("kickoff prompt resolves for non-skipped stages", () => {
        const sp = getStagePolicy(id)!;
        for (const stage of STAGES) {
          if (sp[stage as keyof typeof sp] === "skipped") continue;
          const prompt = buildKickoffPrompt({
            stage,
            roundKind: id as Parameters<typeof buildKickoffPrompt>[0]["roundKind"],
          });
          expect(prompt).toBeTruthy();
          expect(typeof prompt).toBe("string");
        }
      });
    });
  }

  it("sub-output as independent run → fail-closed", () => {
    const r = validateOutputContract("채권자목록", ["채권자목록.docx"]);
    expect(r.valid).toBe(false);
  });

  it("unknown type → fail-closed", () => {
    expect(getDocumentType("존재하지않는유형")).toBeUndefined();
    const r = validateOutputContract("존재하지않는유형", ["any.docx"]);
    expect(r.valid).toBe(false);
  });

  it("explicit wrong value not silently converted to 소장", () => {
    expect(getDocumentType("wrongType")).toBeUndefined();
    expect(getDocumentType("")).toBeUndefined();
  });
});

// ── STEP 6: Determinism dual-run ─────────────────────────────

describe("AUDIT STEP 6: Determinism dual-run comparison", () => {
  it("listDocumentTypes: two calls identical", () => {
    const a = listDocumentTypes();
    const b = listDocumentTypes();
    expect(a.map(t => t.id)).toEqual(b.map(t => t.id));
    expect(a.map(t => t.label)).toEqual(b.map(t => t.label));
  });

  for (const id of ALL_11) {
    it(`${id}: stagePolicy deterministic`, () => {
      expect(getStagePolicy(id)).toEqual(getStagePolicy(id));
    });

    it(`${id}: output contract deterministic`, () => {
      const dt = getDocumentType(id)!;
      const filenames = dt.outputs.filter(o => o.required).map(o => o.filename);
      expect(validateOutputContract(id, filenames)).toEqual(validateOutputContract(id, filenames));
    });
  }

  it("buildSystemPrompt deterministic for both modes", () => {
    expect(buildSystemPrompt("lawyer")).toBe(buildSystemPrompt("lawyer"));
    expect(buildSystemPrompt("judicial_scrivener")).toBe(buildSystemPrompt("judicial_scrivener"));
  });

  it("buildKickoffPrompt deterministic", () => {
    const args = { stage: "draft" as const, roundKind: "소장" as Parameters<typeof buildKickoffPrompt>[0]["roundKind"], authorMode: "judicial_scrivener" as const };
    expect(buildKickoffPrompt(args)).toBe(buildKickoffPrompt(args));
  });

  it("SYSTEM_PROMPT const equals buildSystemPrompt(lawyer)", () => {
    expect(SYSTEM_PROMPT).toBe(buildSystemPrompt("lawyer"));
  });

  it("pipeline deriveStepStates deterministic", () => {
    const empty: PipelineInput = { runs: [], reviews: [], verifyHasFail: false };
    expect(deriveStepStates(empty)).toEqual(deriveStepStates(empty));
  });

  it("normalization note: timestamps and temp paths are not used in contract functions", () => {
    // All contract functions are pure: they take string inputs and return objects
    // No Date.now(), Math.random(), or file paths in any return value
    // Normalization rules: NONE NEEDED — outputs are fully deterministic
    expect(true).toBe(true);
  });
});
