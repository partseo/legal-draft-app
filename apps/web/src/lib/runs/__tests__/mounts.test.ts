import { describe, it, expect } from "vitest";
import { buildMounts } from "@/lib/runs/mounts";
import type { CaseFileLite } from "@/lib/runs/store";

const f = (kind: CaseFileLite["kind"], filename: string, version: number, storage_path: string): CaseFileLite =>
  ({ kind, filename, storage_path, version, created_at: `2026-07-2${version}T00:00:00Z` }) as CaseFileLite;

describe("buildMounts", () => {
  it("입력은 전부, 산출물은 kind·filename별 최신 버전만", () => {
    const files = [
      f("입력", "상담메모.md", 1, "c1/입력/상담메모.md"),
      f("입력", "계약서.pdf", 1, "c1/입력/계약서.pdf"),
      f("사건컨텍스트", "사건컨텍스트.json", 1, "c1/산출물/사건컨텍스트/v1/사건컨텍스트.json"),
      f("사건컨텍스트", "사건컨텍스트.json", 2, "c1/산출물/사건컨텍스트/v2/사건컨텍스트.json"),
      f("리서치", "쟁점별_법리.md", 1, "c1/산출물/리서치/v1/쟁점별_법리.md"),
      f("서면", "소장_초안.docx", 1, "c1/산출물/서면/v1/소장_초안.docx"),
      f("검증보고", "검증보고_소장.md", 1, "c1/산출물/검증보고/v1/검증보고_소장.md"),
      f("context_json", "context_소장.json", 1, "c1/산출물/context_json/v1/context_소장.json"),
    ];
    const mounts = buildMounts(files);
    const byPath = Object.fromEntries(mounts.map((m) => [m.mountPath, m.storagePath]));
    expect(byPath["/workspace/case/입력/상담메모.md"]).toBe("c1/입력/상담메모.md");
    expect(byPath["/workspace/case/사건컨텍스트.json"]).toBe("c1/산출물/사건컨텍스트/v2/사건컨텍스트.json");
    expect(byPath["/workspace/case/리서치/쟁점별_법리.md"]).toBe("c1/산출물/리서치/v1/쟁점별_법리.md");
    expect(byPath["/workspace/case/산출물/소장_초안.docx"]).toBe("c1/산출물/서면/v1/소장_초안.docx");
    expect(byPath["/workspace/case/산출물/검증보고_소장.md"]).toBe("c1/산출물/검증보고/v1/검증보고_소장.md");
    expect(byPath["/workspace/case/산출물/context_소장.json"]).toBe("c1/산출물/context_json/v1/context_소장.json");
    expect(mounts.length).toBe(7); // v1 사건컨텍스트는 제외됨
  });
});
