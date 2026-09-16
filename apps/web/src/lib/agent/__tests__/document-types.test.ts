import { describe, it, expect } from "vitest";
import bundleData from "@/lib/agent/bundle-data.json";
import * as registry from "@/lib/agent/document-types";

const EXPECTED_TOP_LEVEL_IDS = [
  "소장",
  "준비서면",
  "내용증명",
  "가압류신청서",
  "가처분신청서",
  "강제집행신청서",
  "등기신청서_소유권이전",
  "등기신청서_근저당설정",
  "등기신청서_법인변경",
  "개인회생신청서",
  "파산면책신청서",
] as const;

const SUB_OUTPUT_IDS = ["채권자목록", "재산목록", "수입지출목록", "변제계획안"] as const;

const EXPECTED_SKILLS = [
  "case-intake",
  "check-registration",
  "draft-bankruptcy",
  "draft-brief",
  "draft-complaint",
  "draft-demand-letter",
  "draft-execution",
  "draft-injunction",
  "draft-registration",
  "draft-rehabilitation",
  "legal-research",
  "verify-citations",
] as const;

const EXPECTED_TEMPLATES = [
  "소장_템플릿_docxtpl.docx",
  "준비서면_템플릿_docxtpl.docx",
  "내용증명_템플릿_docxtpl.docx",
  "가압류신청서_템플릿_docxtpl.docx",
  "가처분신청서_템플릿_docxtpl.docx",
  "강제집행신청서_템플릿_docxtpl.docx",
  "등기신청서_소유권이전_템플릿_docxtpl.docx",
  "등기신청서_근저당설정_템플릿_docxtpl.docx",
  "등기신청서_법인변경_템플릿_docxtpl.docx",
  "개인회생신청서_템플릿_docxtpl.docx",
  "파산면책신청서_템플릿_docxtpl.docx",
  "채권자목록_템플릿_docxtpl.docx",
  "재산목록_템플릿_docxtpl.docx",
  "수입지출목록_템플릿_docxtpl.docx",
  "변제계획안_템플릿_docxtpl.docx",
] as const;

const EXPECTED_CONTEXT_EXAMPLES = [
  "context_소장_예시.json",
  "context_준비서면_예시.json",
  "context_내용증명_예시.json",
  "context_가압류_예시.json",
  "context_가처분_예시.json",
  "context_강제집행_예시.json",
  "context_등기신청서_소유권이전_예시.json",
  "context_등기신청서_근저당설정_예시.json",
  "context_등기신청서_법인변경_예시.json",
  "context_개인회생신청서_예시.json",
  "context_파산면책신청서_예시.json",
  "context_채권자목록_예시.json",
  "context_재산목록_예시.json",
  "context_수입지출목록_예시.json",
  "context_변제계획안_예시.json",
] as const;

const EXPECTED_PROJECTIONS = [
  "소장",
  "준비서면",
  "내용증명",
  "가압류신청서",
  "가처분신청서",
  "강제집행신청서",
  "등기신청서_소유권이전",
  "등기신청서_근저당설정",
  "등기신청서_법인변경",
  "개인회생신청서",
  "파산면책신청서",
  "채권자목록",
  "재산목록",
  "수입지출목록",
  "변제계획안",
] as const;

const bundlePaths = Object.values(bundleData.files) as string[];

describe("Document Type Registry", () => {
  it("상위 문서유형 11개를 등록한다", () => {
    const types = registry.listDocumentTypes();
    expect(types).toHaveLength(11);
  });

  it("상위 문서유형 ID가 기대 목록과 일치한다", () => {
    const ids = registry.listDocumentTypes().map((t) => t.id);
    for (const expected of EXPECTED_TOP_LEVEL_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it("하위 산출물 4개가 독립 상위 유형으로 계산되지 않는다", () => {
    const ids = registry.listDocumentTypes().map((t) => t.id);
    for (const sub of SUB_OUTPUT_IDS) {
      expect(ids).not.toContain(sub);
    }
  });

  it("중복 ID가 없다", () => {
    const ids = registry.listDocumentTypes().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("15개 Projection 출력을 커버한다", () => {
    const types = registry.listDocumentTypes();
    const allProjections = types.flatMap((t) => t.outputs.map((o) => o.projectionType));
    for (const proj of EXPECTED_PROJECTIONS) {
      expect(allProjections).toContain(proj);
    }
  });

  it("15개 Template을 참조한다", () => {
    const types = registry.listDocumentTypes();
    const allTemplates = types.flatMap((t) => t.outputs.map((o) => o.template));
    for (const tmpl of EXPECTED_TEMPLATES) {
      expect(allTemplates).toContain(tmpl);
    }
  });

  it("12개 Bundle Skill만 참조한다", () => {
    const types = registry.listDocumentTypes();
    const skillNames = new Set<string>();
    for (const t of types) {
      skillNames.add(t.draftSkill);
      skillNames.add(t.verifySkill);
    }
    for (const skill of skillNames) {
      expect(EXPECTED_SKILLS).toContain(skill);
      expect(bundlePaths).toContain(`bundle/skills/${skill}/SKILL.md`);
    }
  });

  it("15개 Template이 Bundle에 존재한다", () => {
    const types = registry.listDocumentTypes();
    const allTemplates = types.flatMap((t) => t.outputs.map((o) => o.template));
    for (const tmpl of new Set(allTemplates)) {
      expect(bundlePaths).toContain(`bundle/templates/${tmpl}`);
    }
  });

  it("15개 Context Example이 Bundle에 존재한다", () => {
    const types = registry.listDocumentTypes();
    const allExamples = [...new Set(types.flatMap((t) => t.outputs.map((o) => o.contextExample)))];
    expect(allExamples).toHaveLength(EXPECTED_CONTEXT_EXAMPLES.length);
    for (const ex of allExamples) {
      expect(bundlePaths).toContain(`bundle/templates/${ex}`);
      expect(EXPECTED_CONTEXT_EXAMPLES).toContain(ex);
    }
  });

  it("등기 3종의 verifySkill이 check-registration이다", () => {
    for (const id of ["등기신청서_소유권이전", "등기신청서_근저당설정", "등기신청서_법인변경"]) {
      const t = registry.getDocumentType(id);
      expect(t).toBeDefined();
      expect(t!.verifySkill).toBe("check-registration");
    }
  });

  it("소장의 draftSkill이 draft-complaint이다", () => {
    const t = registry.getDocumentType("소장");
    expect(t).toBeDefined();
    expect(t!.draftSkill).toBe("draft-complaint");
  });

  it("준비서면의 draftSkill이 draft-brief이다", () => {
    const t = registry.getDocumentType("준비서면");
    expect(t).toBeDefined();
    expect(t!.draftSkill).toBe("draft-brief");
  });

  it("개인회생 필수 산출물이 5개다", () => {
    const t = registry.getDocumentType("개인회생신청서");
    expect(t).toBeDefined();
    const required = t!.outputs.filter((o) => o.required);
    expect(required).toHaveLength(5);
  });

  it("파산면책 필수 산출물이 3개다", () => {
    const t = registry.getDocumentType("파산면책신청서");
    expect(t).toBeDefined();
    const required = t!.outputs.filter((o) => o.required);
    expect(required).toHaveLength(3);
  });

  it("paralegal 값이 0건이다", () => {
    const types = registry.listDocumentTypes();
    for (const t of types) {
      for (const mode of t.supportedAuthorModes) {
        expect(mode).not.toBe("paralegal");
      }
    }
  });

  it("judicial_scrivener 값이 사용된다", () => {
    const types = registry.listDocumentTypes();
    const allModes = types.flatMap((t) => [...t.supportedAuthorModes]);
    expect(allModes).toContain("judicial_scrivener");
  });

  it("알 수 없는 문서 ID는 undefined를 반환한다", () => {
    expect(registry.getDocumentType("존재하지_않는_유형")).toBeUndefined();
  });

  it("getRequiredOutputs가 필수 산출물만 반환한다", () => {
    const outputs = registry.getRequiredOutputs("소장");
    expect(outputs).toBeDefined();
    expect(outputs!.every((o) => o.required)).toBe(true);
  });

  it("getDraftSkill이 올바른 값을 반환한다", () => {
    expect(registry.getDraftSkill("소장")).toBe("draft-complaint");
    expect(registry.getDraftSkill("준비서면")).toBe("draft-brief");
    expect(registry.getDraftSkill("내용증명")).toBe("draft-demand-letter");
  });

  it("getVerifySkill이 올바른 값을 반환한다", () => {
    expect(registry.getVerifySkill("소장")).toBe("verify-citations");
    expect(registry.getVerifySkill("등기신청서_소유권이전")).toBe("check-registration");
  });

  it("isExistingWebDocumentType이 전체 11종에 대해 true다", () => {
    for (const t of registry.listDocumentTypes()) {
      expect(registry.isExistingWebDocumentType(t.id)).toBe(true);
    }
  });
});
