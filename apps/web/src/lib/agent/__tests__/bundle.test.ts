import { describe, it, expect } from "vitest";
import { loadBundle } from "@/lib/agent/bundle";

describe("loadBundle", () => {
  it("스킬 5종·rules·templates가 모두 들어있다", () => {
    const b = loadBundle();
    expect(b.files).toContain("bundle/skills/case-intake/SKILL.md");
    expect(b.files).toContain("bundle/skills/verify-citations/SKILL.md");
    expect(b.files).toContain("bundle/rules/인용규칙.md");
    expect(b.files).toContain("bundle/templates/render_서면.py");
    expect(b.files).toContain("bundle/templates/소장_템플릿_docxtpl.docx");
    expect(b.files.length).toBe(53);
  });

  it("tarGz 바이트와 해시가 유효하다", () => {
    const b = loadBundle();
    expect(b.hash).toMatch(/^[0-9a-f]{64}$/);
    // gzip 매직 넘버
    expect(b.tarGz[0]).toBe(0x1f);
    expect(b.tarGz[1]).toBe(0x8b);
  });
});
