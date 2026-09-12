import { describe, it, expect } from "vitest";
import {
  VALID_AUTHOR_MODES,
  DEFAULT_AUTHOR_MODE,
  isValidAuthorMode,
  getAuthorModeLabel,
  getConfirmTag,
  getSeniorAdviceTitle,
  isAuthorModeSupported,
  listDocumentTypes,
} from "@/lib/agent/document-types";
import { buildSystemPrompt, buildKickoffPrompt, SYSTEM_PROMPT } from "@/lib/agent/prompts";

// P5.5-5E — Author Mode Tests

describe("P5.5-5E: Author Mode Validation", () => {
  it("no value → defaults to lawyer", () => {
    expect(DEFAULT_AUTHOR_MODE).toBe("lawyer");
  });

  it("exactly 2 valid modes: lawyer, judicial_scrivener", () => {
    expect(VALID_AUTHOR_MODES).toHaveLength(2);
    expect(VALID_AUTHOR_MODES).toContain("lawyer");
    expect(VALID_AUTHOR_MODES).toContain("judicial_scrivener");
  });

  it("paralegal is rejected", () => {
    expect(isValidAuthorMode("paralegal")).toBe(false);
  });

  it("NULL/undefined/empty is rejected", () => {
    expect(isValidAuthorMode(null)).toBe(false);
    expect(isValidAuthorMode(undefined)).toBe(false);
    expect(isValidAuthorMode("")).toBe(false);
  });

  it("unknown string is rejected", () => {
    expect(isValidAuthorMode("admin")).toBe(false);
    expect(isValidAuthorMode("judge")).toBe(false);
  });

  it("lawyer is valid", () => {
    expect(isValidAuthorMode("lawyer")).toBe(true);
  });

  it("judicial_scrivener is valid", () => {
    expect(isValidAuthorMode("judicial_scrivener")).toBe(true);
  });
});

describe("P5.5-5E: Author Mode Labels", () => {
  it("lawyer → 변호사", () => {
    expect(getAuthorModeLabel("lawyer")).toBe("변호사");
  });

  it("judicial_scrivener → 법무사", () => {
    expect(getAuthorModeLabel("judicial_scrivener")).toBe("법무사");
  });
});

describe("P5.5-5E: Author Mode Prompt Integration", () => {
  it("lawyer confirm tag → 변호사 확인 필요", () => {
    expect(getConfirmTag("lawyer")).toBe("변호사 확인 필요");
  });

  it("judicial_scrivener confirm tag → 법무사 확인 필요", () => {
    expect(getConfirmTag("judicial_scrivener")).toBe("법무사 확인 필요");
  });

  it("lawyer senior advice title", () => {
    expect(getSeniorAdviceTitle("lawyer")).toBe("시니어 변호사 송무 조언");
  });

  it("judicial_scrivener senior advice title", () => {
    expect(getSeniorAdviceTitle("judicial_scrivener")).toBe("시니어 법무사 송무 조언");
  });

  it("SYSTEM_PROMPT (default) contains 변호사", () => {
    expect(SYSTEM_PROMPT).toContain("변호사");
    expect(SYSTEM_PROMPT).toContain("변호사 확인 필요");
  });

  it("buildSystemPrompt(judicial_scrivener) contains 법무사", () => {
    const sp = buildSystemPrompt("judicial_scrivener");
    expect(sp).toContain("법무사");
    expect(sp).toContain("법무사 확인 필요");
    expect(sp).toContain("시니어 법무사 송무 조언");
  });

  it("kickoff prompt default (no authorMode) → 변호사 수정 지시", () => {
    const p = buildKickoffPrompt({
      stage: "draft",
      roundKind: "소장",
      instruction: "수정해주세요",
    });
    expect(p).toContain("변호사 수정 지시");
    expect(p).not.toContain("작성자유형 오버레이");
  });

  it("kickoff prompt with judicial_scrivener → 법무사 수정 지시 + overlay", () => {
    const p = buildKickoffPrompt({
      stage: "draft",
      roundKind: "소장",
      instruction: "수정해주세요",
      authorMode: "judicial_scrivener",
    });
    expect(p).toContain("법무사 수정 지시");
    expect(p).toContain("작성자유형 오버레이");
    expect(p).toContain("법무사 확인 필요");
    expect(p).toContain("시니어 법무사 송무 조언");
  });

  it("kickoff prompt with lawyer → no overlay (default)", () => {
    const p = buildKickoffPrompt({
      stage: "draft",
      roundKind: "소장",
      authorMode: "lawyer",
    });
    expect(p).not.toContain("작성자유형 오버레이");
  });

  it("lawyer regression — existing prompt unchanged", () => {
    const p = buildKickoffPrompt({ stage: "intake", roundKind: "소장" });
    expect(p).toContain("case-intake");
    expect(p).toContain("run-complete");
    expect(p).not.toContain("작성자유형 오버레이");
  });
});

describe("P5.5-5E: Author Mode × Document Type Support", () => {
  it("all 11 types support both modes", () => {
    for (const t of listDocumentTypes()) {
      expect(isAuthorModeSupported(t.id, "lawyer")).toBe(true);
      expect(isAuthorModeSupported(t.id, "judicial_scrivener")).toBe(true);
    }
  });

  it("unknown type → not supported", () => {
    expect(isAuthorModeSupported("존재하지않는유형", "lawyer")).toBe(false);
  });
});
