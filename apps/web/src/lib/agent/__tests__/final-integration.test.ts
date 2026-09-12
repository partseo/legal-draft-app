import { describe, it, expect } from "vitest";
import {
  listDocumentTypes,
  getDocumentType,
  getDraftSkill,
  getVerifySkill,
  getStagePolicy,
  getDocumentLabel,
  getRequiredOutputs,
  validateOutputContract,
  isValidAuthorMode,
  isAuthorModeSupported,
  VALID_AUTHOR_MODES,
  DEFAULT_ROUND_KIND,
  DEFAULT_AUTHOR_MODE,
  getSelectableDocumentTypes,
} from "@/lib/agent/document-types";
import { buildKickoffPrompt, buildSystemPrompt, SYSTEM_PROMPT } from "@/lib/agent/prompts";
import {
  deriveStepStates,
  STAGES,
  type PipelineInput,
} from "@/lib/pipeline";

// P5.5-5F — Final Integration & Freeze Tests

const ALL_11_TYPES = [
  "소장", "준비서면", "내용증명",
  "가압류신청서", "가처분신청서", "강제집행신청서",
  "등기신청서_소유권이전", "등기신청서_근저당설정", "등기신청서_법인변경",
  "개인회생신청서", "파산면책신청서",
];

describe("P5.5-5F: 11 Document Type Corpus", () => {
  it("registry has exactly 11 types", () => {
    expect(listDocumentTypes()).toHaveLength(11);
  });

  it("all 11 IDs resolve", () => {
    for (const id of ALL_11_TYPES) {
      expect(getDocumentType(id)).toBeDefined();
    }
  });

  it("no extra types beyond 11", () => {
    const ids = listDocumentTypes().map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(ALL_11_TYPES));
    expect(ids).toHaveLength(11);
  });

  describe("per-type contract", () => {
    for (const id of ALL_11_TYPES) {
      describe(id, () => {
        it("has label", () => {
          expect(getDocumentLabel(id)).toBeTruthy();
        });

        it("has draftSkill", () => {
          expect(getDraftSkill(id)).toBeTruthy();
        });

        it("has verifySkill", () => {
          expect(getVerifySkill(id)).toBeTruthy();
        });

        it("has stagePolicy", () => {
          const sp = getStagePolicy(id)!;
          expect(sp.intake).toBe("required");
          expect(sp.draft).toBe("required");
          expect(["required", "optional", "skipped"]).toContain(sp.research);
          expect(["required", "conditional"]).toContain(sp.verify);
        });

        it("has ≥1 required output", () => {
          const outputs = getRequiredOutputs(id)!;
          expect(outputs.length).toBeGreaterThanOrEqual(1);
        });

        it("output contract accepts all required outputs", () => {
          const dt = getDocumentType(id)!;
          const filenames = dt.outputs.filter((o) => o.required).map((o) => o.filename);
          const result = validateOutputContract(id, filenames);
          expect(result.valid).toBe(true);
        });

        it("supports both author modes", () => {
          expect(isAuthorModeSupported(id, "lawyer")).toBe(true);
          expect(isAuthorModeSupported(id, "judicial_scrivener")).toBe(true);
        });

        it("kickoff prompt resolves for all 4 stages", () => {
          for (const stage of STAGES) {
            const sp = getStagePolicy(id)!;
            const policy = sp[stage as keyof typeof sp];
            if (policy === "skipped") continue;
            expect(() =>
              buildKickoffPrompt({ stage, roundKind: id as Parameters<typeof buildKickoffPrompt>[0]["roundKind"] })
            ).not.toThrow();
          }
        });
      });
    }
  });
});

describe("P5.5-5F: Author Mode × Integration", () => {
  for (const mode of VALID_AUTHOR_MODES) {
    it(`buildSystemPrompt(${mode}) produces valid prompt`, () => {
      const sp = buildSystemPrompt(mode);
      expect(sp).toContain("checkpoint");
      expect(sp).toContain("run-complete");
      expect(sp).toContain("senior-advice");
    });

    it(`kickoff with ${mode} resolves for 소장 draft`, () => {
      const p = buildKickoffPrompt({
        stage: "draft",
        roundKind: "소장",
        authorMode: mode,
      });
      expect(p).toContain("draft-complaint");
    });
  }
});

describe("P5.5-5F: Determinism", () => {
  it("listDocumentTypes returns same order on repeated calls", () => {
    const a = listDocumentTypes().map((t) => t.id);
    const b = listDocumentTypes().map((t) => t.id);
    expect(a).toEqual(b);
  });

  it("getSelectableDocumentTypes returns same order", () => {
    const a = getSelectableDocumentTypes().map((t) => t.id);
    const b = getSelectableDocumentTypes().map((t) => t.id);
    expect(a).toEqual(b);
  });

  it("SYSTEM_PROMPT is stable across calls", () => {
    expect(SYSTEM_PROMPT).toBe(buildSystemPrompt("lawyer"));
  });

  it("validateOutputContract is deterministic", () => {
    const a = validateOutputContract("소장", ["소장_초안.docx"]);
    const b = validateOutputContract("소장", ["소장_초안.docx"]);
    expect(a).toEqual(b);
  });

  it("pipeline with empty input is deterministic", () => {
    const empty: PipelineInput = { runs: [], reviews: [], verifyHasFail: false };
    const a = deriveStepStates(empty);
    const b = deriveStepStates(empty);
    expect(a).toEqual(b);
  });
});

describe("P5.5-5F: Scope Freeze Assertions", () => {
  it("DEFAULT_ROUND_KIND is 소장", () => {
    expect(DEFAULT_ROUND_KIND).toBe("소장");
  });

  it("DEFAULT_AUTHOR_MODE is lawyer", () => {
    expect(DEFAULT_AUTHOR_MODE).toBe("lawyer");
  });

  it("paralegal is never valid", () => {
    expect(isValidAuthorMode("paralegal")).toBe(false);
  });

  it("STAGES is exactly 4: intake, research, draft, verify", () => {
    expect(STAGES).toEqual(["intake", "research", "draft", "verify"]);
  });

  it("등기 3종 use check-registration for verify", () => {
    expect(getVerifySkill("등기신청서_소유권이전")).toBe("check-registration");
    expect(getVerifySkill("등기신청서_근저당설정")).toBe("check-registration");
    expect(getVerifySkill("등기신청서_법인변경")).toBe("check-registration");
  });

  it("non-등기 use verify-citations for verify", () => {
    for (const t of listDocumentTypes()) {
      if (t.category !== "registration") {
        expect(getVerifySkill(t.id)).toBe("verify-citations");
      }
    }
  });
});
