// 에이전트 번들 tar.gz를 생성한다. 산출: src/lib/agent/bundle-data.json { hash, files, tarGzBase64 }
//
// 이 웹앱 repo는 에이전트 소스(.claude/skills·rules·templates)를 보관하지 않는다 —
// canonical 원본은 형제 프로젝트 `litigation-writer`다. 따라서:
//  · 소스가 있으면(AGENT_SRC_DIR 지정 또는 repo 루트에 존재) 재생성한다.
//  · 소스가 없으면(Vercel·웹앱 전용 체크아웃) 커밋된 bundle-data.json을 그대로 쓴다.
// 스킬을 수정했으면: AGENT_SRC_DIR=<litigation-writer 경로> npm run bundle 후 커밋한다.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as tar from "tar";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..", "..");
const srcRoot = process.env.AGENT_SRC_DIR ? path.resolve(process.env.AGENT_SRC_DIR) : repoRoot;
const outPath = path.join(appDir, "src", "lib", "agent", "bundle-data.json");

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
  ...SKILLS.map((s) => [`bundle/skills/${s}/SKILL.md`, path.join(srcRoot, ".claude", "skills", s, "SKILL.md")]),
  ...RULES.map((f) => [`bundle/rules/${f}`, path.join(srcRoot, "rules", f)]),
  ...TEMPLATES.map((f) => [`bundle/templates/${f}`, path.join(srcRoot, "templates", f)]),
].sort((a, b) => (a[0] < b[0] ? -1 : 1));

// 소스가 없으면 커밋된 번들을 사용(재생성 생략)
if (!entries.every(([, src]) => existsSync(src))) {
  if (existsSync(outPath)) {
    console.log("agent bundle: 소스 없음 — 커밋된 bundle-data.json 사용 (AGENT_SRC_DIR 지정 시 재생성)");
    process.exit(0);
  }
  throw new Error(
    "에이전트 소스도, 커밋된 bundle-data.json도 없습니다. AGENT_SRC_DIR=<litigation-writer 경로>로 재생성하세요.",
  );
}

const hasher = createHash("sha256");
const stage = mkdtempSync(path.join(tmpdir(), "agent-bundle-"));
try {
  for (const [rel, src] of entries) {
    const buf = readFileSync(src);
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
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`agent bundle: ${out.files.length} files, hash ${out.hash.slice(0, 12)} (src: ${srcRoot})`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
