// 리포 canonical 원천(.claude/skills, rules, templates)에서 에이전트 번들 tar.gz를 생성한다.
// 산출: src/lib/agent/bundle-data.json { hash, files, tarGzBase64 }
// 해시는 원천 파일 내용 기준(gzip 비결정성 무관) — 프로비전 재생성 판단에 사용.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as tar from "tar";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..", "..");

const SKILLS = ["case-intake", "legal-research", "draft-complaint", "draft-brief", "verify-citations"];
const RULES = ["법령약칭.md", "사건컨텍스트.schema.json", "요건사실.md", "인용규칙.md", "절차비용.md"];
const TEMPLATES = [
  "check_projection.py",
  "render_서면.py",
  "소장_템플릿_docxtpl.docx",
  "준비서면_템플릿_docxtpl.docx",
  "context_소장_예시.json",
  "context_준비서면_예시.json",
];

/** [번들 내 경로, 원천 절대경로] 목록 (정렬 고정 → 해시 결정성) */
const entries = [
  ...SKILLS.map((s) => [`bundle/skills/${s}/SKILL.md`, path.join(repoRoot, ".claude", "skills", s, "SKILL.md")]),
  ...RULES.map((f) => [`bundle/rules/${f}`, path.join(repoRoot, "rules", f)]),
  ...TEMPLATES.map((f) => [`bundle/templates/${f}`, path.join(repoRoot, "templates", f)]),
].sort((a, b) => (a[0] < b[0] ? -1 : 1));

const hasher = createHash("sha256");
const stage = mkdtempSync(path.join(tmpdir(), "agent-bundle-"));
try {
  for (const [rel, src] of entries) {
    const buf = readFileSync(src); // 원천 없으면 여기서 throw — 번들 불완전 방지
    hasher.update(rel).update("\0").update(buf);
    const dest = path.join(stage, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
  const tarPath = path.join(stage, "bundle.tar.gz");
  await tar.create({ gzip: true, cwd: stage, file: tarPath, portable: true, noMtime: true }, ["bundle"]);
  const out = {
    hash: hasher.digest("hex"),
    files: entries.map(([rel]) => rel),
    tarGzBase64: readFileSync(tarPath).toString("base64"),
  };
  writeFileSync(path.join(appDir, "src", "lib", "agent", "bundle-data.json"), JSON.stringify(out));
  console.log(`agent bundle: ${out.files.length} files, hash ${out.hash.slice(0, 12)}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
