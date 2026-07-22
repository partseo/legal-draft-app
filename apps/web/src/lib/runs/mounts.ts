import type { CaseFileLite } from "@/lib/runs/store";

/** 스킬이 기대하는 로컬 cases/ 레이아웃을 /workspace/case/ 아래로 재현한다 (오버레이 경로 매핑과 짝) */
export function buildMounts(files: CaseFileLite[]): { storagePath: string; mountPath: string }[] {
  const mounts: { storagePath: string; mountPath: string }[] = [];
  for (const f of files.filter((x) => x.kind === "입력")) {
    mounts.push({ storagePath: f.storage_path, mountPath: `/workspace/case/입력/${f.filename}` });
  }
  const latest = new Map<string, CaseFileLite>();
  for (const f of files.filter((x) => x.kind !== "입력")) {
    const k = `${f.kind}\0${f.filename}`;
    const cur = latest.get(k);
    if (!cur || f.version > cur.version) latest.set(k, f);
  }
  for (const f of latest.values()) {
    const mountPath =
      f.kind === "사건컨텍스트"
        ? "/workspace/case/사건컨텍스트.json"
        : f.kind === "리서치"
          ? `/workspace/case/리서치/${f.filename}`
          : `/workspace/case/산출물/${f.filename}`;
    mounts.push({ storagePath: f.storage_path, mountPath });
  }
  return mounts;
}
