import { describe, it, expect } from "vitest";
import {
  validateOutputContract,
  getStagePolicy,
  listDocumentTypes,
  getDocumentType,
  getVerifySkill,
} from "@/lib/agent/document-types";

// P5.5-5D — Output Contract & Stage Policy Tests

describe("P5.5-5D: Output Contract Validation", () => {
  // ─── 1. Single-output types (소장, 준비서면, etc.) ─────────────────

  describe("single-output types", () => {
    it("소장 — single correct output → valid", () => {
      const r = validateOutputContract("소장", ["소장_초안.docx"]);
      expect(r.valid).toBe(true);
      expect(r.missing).toHaveLength(0);
      expect(r.unknown).toHaveLength(0);
    });

    it("준비서면 — single correct output → valid", () => {
      const r = validateOutputContract("준비서면", ["준비서면_초안.docx"]);
      expect(r.valid).toBe(true);
    });

    it("소장 — wrong filename → unknown", () => {
      const r = validateOutputContract("소장", ["잘못된파일.docx"]);
      expect(r.valid).toBe(false);
      expect(r.unknown).toContain("잘못된파일.docx");
      expect(r.missing).toContain("소장_초안.docx");
    });

    it("소장 — missing output → missing", () => {
      const r = validateOutputContract("소장", []);
      expect(r.valid).toBe(false);
      expect(r.missing).toContain("소장_초안.docx");
    });

    it("소장 — existing flow regression: correct output accepted", () => {
      const r = validateOutputContract("소장", ["소장_초안.docx"]);
      expect(r).toEqual({ valid: true, missing: [], unknown: [], duplicate: [] });
    });

    it("준비서면 — existing flow regression: correct output accepted", () => {
      const r = validateOutputContract("준비서면", ["준비서면_초안.docx"]);
      expect(r).toEqual({ valid: true, missing: [], unknown: [], duplicate: [] });
    });
  });

  // ─── 2. Multi-output types (개인회생 5개, 파산면책 3개) ────────────

  describe("multi-output: 개인회생 (5 outputs)", () => {
    const ALL_5 = [
      "개인회생신청서_초안.docx",
      "채권자목록.docx",
      "재산목록.docx",
      "수입지출목록.docx",
      "변제계획안.docx",
    ];

    it("all 5 outputs → valid", () => {
      const r = validateOutputContract("개인회생신청서", ALL_5);
      expect(r.valid).toBe(true);
      expect(r.missing).toHaveLength(0);
    });

    it("missing 1 of 5 → invalid with missing", () => {
      const r = validateOutputContract("개인회생신청서", ALL_5.slice(0, 4));
      expect(r.valid).toBe(false);
      expect(r.missing).toContain("변제계획안.docx");
    });

    it("extra undeclared file → invalid with unknown", () => {
      const r = validateOutputContract("개인회생신청서", [...ALL_5, "기타문서.docx"]);
      expect(r.valid).toBe(false);
      expect(r.unknown).toContain("기타문서.docx");
    });

    it("duplicate filename → invalid with duplicate", () => {
      const r = validateOutputContract("개인회생신청서", [...ALL_5, "채권자목록.docx"]);
      expect(r.valid).toBe(false);
      expect(r.duplicate).toContain("채권자목록.docx");
    });

    it("same kind (서면) for all 5 — different filenames preserved", () => {
      const dt = getDocumentType("개인회생신청서")!;
      const kinds = dt.outputs.map((o) => o.kind);
      expect(kinds.every((k) => k === "서면")).toBe(true);
      const filenames = dt.outputs.map((o) => o.filename);
      expect(new Set(filenames).size).toBe(5);
    });
  });

  describe("multi-output: 파산면책 (3 outputs)", () => {
    const ALL_3 = ["파산면책신청서_초안.docx", "채권자목록.docx", "재산목록.docx"];

    it("all 3 outputs → valid", () => {
      const r = validateOutputContract("파산면책신청서", ALL_3);
      expect(r.valid).toBe(true);
    });

    it("missing output → invalid", () => {
      const r = validateOutputContract("파산면책신청서", ALL_3.slice(0, 2));
      expect(r.valid).toBe(false);
      expect(r.missing).toContain("재산목록.docx");
    });
  });

  // ─── 3. Unknown type / undeclared output ───────────────────────────

  describe("fail-closed", () => {
    it("unknown roundKind → all files treated as unknown", () => {
      const r = validateOutputContract("존재하지않는유형", ["some.docx"]);
      expect(r.valid).toBe(false);
      expect(r.unknown).toContain("some.docx");
    });

    it("undeclared output for valid type → rejected", () => {
      const r = validateOutputContract("소장", ["소장_초안.docx", "침입자.docx"]);
      expect(r.valid).toBe(false);
      expect(r.unknown).toContain("침입자.docx");
    });
  });
});

describe("P5.5-5D: Verify Routing Contract", () => {
  it("등기 3종 → check-registration", () => {
    expect(getVerifySkill("등기신청서_소유권이전")).toBe("check-registration");
    expect(getVerifySkill("등기신청서_근저당설정")).toBe("check-registration");
    expect(getVerifySkill("등기신청서_법인변경")).toBe("check-registration");
  });

  it("non-등기 → verify-citations", () => {
    for (const t of listDocumentTypes()) {
      if (t.category !== "registration") {
        expect(getVerifySkill(t.id)).toBe("verify-citations");
      }
    }
  });
});

describe("P5.5-5D: Stage Policy", () => {
  it("all 11 types have stagePolicy", () => {
    for (const t of listDocumentTypes()) {
      expect(getStagePolicy(t.id)).toBeDefined();
    }
  });

  it("강제집행 research = skipped", () => {
    expect(getStagePolicy("강제집행신청서")?.research).toBe("skipped");
  });

  it("내용증명 research = optional, verify = conditional", () => {
    const sp = getStagePolicy("내용증명")!;
    expect(sp.research).toBe("optional");
    expect(sp.verify).toBe("conditional");
  });

  it("소장 — all required", () => {
    const sp = getStagePolicy("소장")!;
    expect(sp.intake).toBe("required");
    expect(sp.research).toBe("required");
    expect(sp.draft).toBe("required");
    expect(sp.verify).toBe("required");
  });

  it("등기 3종 research = optional", () => {
    expect(getStagePolicy("등기신청서_소유권이전")?.research).toBe("optional");
    expect(getStagePolicy("등기신청서_근저당설정")?.research).toBe("optional");
    expect(getStagePolicy("등기신청서_법인변경")?.research).toBe("optional");
  });
});
