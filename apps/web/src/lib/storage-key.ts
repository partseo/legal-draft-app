// Supabase Storage 키는 비ASCII(한글 등)를 거부한다("Invalid key"). 표시용 원본 파일명은
// DB의 case_files.filename 에 보관하고, 스토리지 키는 ASCII-safe 불투명 키를 쓴다.

/** 파일명에서 ASCII 확장자만 추출 (없으면 빈 문자열). 예: "사건기록.md" → ".md" */
export function asciiExt(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : "";
}

/** 입력 파일 스토리지 키 — 사건별 input/ 하위, 불투명 UUID + 확장자 */
export function inputStorageKey(caseId: string, filename: string): string {
  return `${caseId}/input/${crypto.randomUUID()}${asciiExt(filename)}`;
}

/** 산출물 스토리지 키 — 사건별 artifacts/ 하위. kind·버전·원본명은 DB에 있으므로 키는 불투명해도 된다. */
export function artifactStorageKey(caseId: string, version: number, filename: string): string {
  return `${caseId}/artifacts/v${version}-${crypto.randomUUID()}${asciiExt(filename)}`;
}
