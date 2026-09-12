import { describe, it, expect } from "vitest";
import { loadBundle } from "@/lib/agent/bundle";

const EXPECTED_SKILLS = [
  "case-intake",
  "legal-research",
  "draft-complaint",
  "draft-brief",
  "draft-demand-letter",
  "draft-injunction",
  "draft-execution",
  "draft-registration",
  "check-registration",
  "draft-rehabilitation",
  "draft-bankruptcy",
  "verify-citations",
];

const EXPECTED_RULES = [
  "법령약칭.md",
  "사건컨텍스트.schema.json",
  "요건사실.md",
  "인용규칙.md",
  "절차비용.md",
  "작성자설정.json",
  "등기요건.md",
  "등록면허세.md",
  "회생파산요건.md",
];

const EXPECTED_RUNTIME_SCRIPTS = ["check_projection.py", "render_서면.py"];

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
];

const EXPECTED_CONTEXTS = [
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
];

describe("P5.5-3 bundle contract (P1-P5 full coverage)", () => {
  it("contains all 12 skills", () => {
    const b = loadBundle();
    for (const skill of EXPECTED_SKILLS) {
      expect(b.files, `missing skill: ${skill}`).toContain(
        `bundle/skills/${skill}/SKILL.md`,
      );
    }
  });

  it("contains all 9 rules", () => {
    const b = loadBundle();
    for (const rule of EXPECTED_RULES) {
      expect(b.files, `missing rule: ${rule}`).toContain(
        `bundle/rules/${rule}`,
      );
    }
  });

  it("contains all 15 DOCX templates", () => {
    const b = loadBundle();
    for (const tmpl of EXPECTED_TEMPLATES) {
      expect(b.files, `missing template: ${tmpl}`).toContain(
        `bundle/templates/${tmpl}`,
      );
    }
  });

  it("contains all 15 context examples", () => {
    const b = loadBundle();
    for (const ctx of EXPECTED_CONTEXTS) {
      expect(b.files, `missing context: ${ctx}`).toContain(
        `bundle/templates/${ctx}`,
      );
    }
  });

  it("contains 2 runtime scripts", () => {
    const b = loadBundle();
    for (const script of EXPECTED_RUNTIME_SCRIPTS) {
      expect(b.files, `missing script: ${script}`).toContain(
        `bundle/templates/${script}`,
      );
    }
  });

  it("has exactly 53 files total", () => {
    const b = loadBundle();
    expect(b.files.length).toBe(53);
  });

  it("has no duplicate paths", () => {
    const b = loadBundle();
    const unique = new Set(b.files);
    expect(unique.size).toBe(b.files.length);
  });

  it("has no empty files", () => {
    const b = loadBundle();
    expect(b.files.every((f: string) => f.length > 0)).toBe(true);
  });

  it("contains no case data or sensitive files", () => {
    const b = loadBundle();
    const forbidden = ["cases/", ".env", "credential", "secret", "token", "apikey", ".git/", "node_modules/", "reports/"];
    for (const pattern of forbidden) {
      const found = b.files.filter((f: string) => f.toLowerCase().includes(pattern));
      expect(found, `forbidden pattern "${pattern}" found`).toEqual([]);
    }
  });
});
