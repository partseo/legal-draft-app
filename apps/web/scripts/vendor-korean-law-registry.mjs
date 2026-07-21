// korean-law-mcp의 tool-registry.js를 벤더링한다 (MIT).
// 재실행 조건: korean-law-mcp 버전 변경 시.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// exports 맵이 ./package.json 서브패스도 차단하므로 node_modules 경로를 직접 구성
const appDir = fileURLToPath(new URL("..", import.meta.url));
const pkgDir = path.join(appDir, "node_modules", "korean-law-mcp");
const pkgJsonPath = path.join(pkgDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
const src = readFileSync(path.join(pkgDir, "build", "tool-registry.js"), "utf8");

// exports 맵 패턴("./tools/*" → "./build/tools/*.js")이 .js를 덧붙이므로
// 서브패스 import에서는 .js 접미사를 제거해야 한다.
const rewritten = src.replace(
  /from "\.\/(tools|lib)\/([^"]+?)(?:\.js)?"/g,
  'from "korean-law-mcp/$1/$2"',
);

const header = `/**
 * VENDORED from korean-law-mcp@${pkg.version} build/tool-registry.js (MIT, © Chris).
 * 원본은 패키지 exports 맵에 없어 서브패스 import가 불가하여 복사함.
 * 수정 금지 — 갱신은 scripts/vendor-korean-law-registry.mjs 재실행으로만.
 */
`;

writeFileSync(
  new URL("../src/lib/mcp/korean-law-registry.mjs", import.meta.url),
  header + rewritten,
);
console.log(`vendored korean-law-mcp@${pkg.version} tool-registry`);
