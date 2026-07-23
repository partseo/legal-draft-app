import { z } from "zod";
import type { CaseContextData } from "@/components/case/context-view";
import type { DraftSection } from "@/components/case/draft-view";
import type { VerifyRow } from "@/components/case/verify-view";

// ── 사건컨텍스트.json → ContextView (rules/사건컨텍스트.schema.json 대응, 관대한 파싱)
// 선언하지 않은 키는 z.object 기본 동작으로 무시된다(스킬이 필드를 추가해도 안전).
const Loose = z.object({
  당사자: z
    .object({
      원고: z
        .array(
          z.object({
            성명: z.string(),
            주소: z.string().optional(),
            전화: z.string().optional(),
            이메일: z.string().optional(),
          }),
        )
        .default([]),
      피고: z
        .array(z.object({ 명칭: z.string(), 주소: z.string().optional(), 대표자: z.string().optional() }))
        .default([]),
    })
    .optional(),
  사실관계: z.array(z.object({ 일자: z.string(), 사실: z.string(), 근거: z.string() })).default([]),
  쟁점: z.array(z.object({ id: z.string(), 제목: z.string(), 우리주장: z.string() })).default([]),
  청구: z.array(z.object({ 청구취지문안: z.string() })).default([]),
  확인필요: z.array(z.string()).default([]),
});

export function contextJsonToView(json: unknown): CaseContextData {
  const p = Loose.safeParse(json);
  const d = p.success ? p.data : Loose.parse({});
  return {
    parties: [
      ...(d.당사자?.원고 ?? []).map((x) => ({ role: "원고", name: x.성명, address: x.주소, contact: x.전화 ?? x.이메일 })),
      ...(d.당사자?.피고 ?? []).map((x) => ({ role: "피고", name: x.명칭, address: x.주소, contact: undefined })),
    ],
    facts: d.사실관계.map((f) => ({ date: f.일자, content: f.사실, evidence: f.근거 })),
    issues: d.쟁점.map((i) => ({ id: i.id, title: i.제목, claim: i.우리주장, approved: true })),
    claimSummary: d.청구.map((c) => c.청구취지문안).join("\n"),
    needsReview: d.확인필요,
  };
}

// ── 마크다운(리서치) → 섹션
export function mdToSections(md: string): DraftSection[] {
  const parts = md.split(/^##\s+/m);
  const out: DraftSection[] = [];
  const head = parts[0]?.trim();
  if (head) out.push({ title: "개요", body: head.replace(/^#\s+.*\r?\n?/, "").trim() });
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const title = (nl < 0 ? part : part.slice(0, nl)).trim();
    const body = (nl < 0 ? "" : part.slice(nl + 1)).trim();
    out.push({ title, body });
  }
  return out.filter((s) => s.title.length > 0);
}

// ── context_{서면}.json → DraftView 미리보기 섹션
const RenderCtx = z.object({
  청구취지: z.array(z.string()).default([]),
  청구원인: z
    .array(z.object({ 번호: z.string().optional(), 제목: z.string(), 문단: z.array(z.string()).default([]) }))
    .default([]),
});

export function renderContextToSections(json: unknown): DraftSection[] {
  const p = RenderCtx.safeParse(json);
  const d = p.success ? p.data : RenderCtx.parse({});
  const out: DraftSection[] = [];
  if (d.청구취지.length > 0) out.push({ title: "청구 취지", body: d.청구취지.join("\n") });
  for (const c of d.청구원인) {
    out.push({ title: c.번호 ? `${c.번호}. ${c.제목}` : c.제목, body: c.문단.join("\n\n") });
  }
  return out;
}

// ── 검증보고 md → VerifyView rows (표 형식: verify-citations SKILL.md §5)
// 열 위치를 고정하지 않고 헤더 이름으로 매핑한다 — 에이전트가 # 번호 열을 붙이거나
// "출처 핀(서면)"처럼 헤더 표기를 바꿔도 파싱이 어긋나지 않게.
const CHECK_LABEL = /^\([a-d]\)/; // (a)존재 · (b)내용일치 · (c)현행성 · (d)생사
const MARK = /✅|⚠|❌/;

type VerifyCols = {
  citation: number;
  pin: number;
  verdict: number;
  reason: number;
  checks: { label: string; idx: number }[];
};

export function parseVerifyReport(md: string): { rows: VerifyRow[]; fail: boolean } {
  const rows: VerifyRow[] = [];
  let cols: VerifyCols | null = null;
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.every((c) => c === "" || /^:?-{2,}:?$/.test(c))) continue; // 구분선
    if (cells.includes("인용") && cells.includes("판정")) {
      cols = {
        citation: cells.indexOf("인용"),
        pin: cells.findIndex((c) => c.startsWith("출처")),
        verdict: cells.indexOf("판정"),
        reason: cells.findIndex((c) => c === "사유"),
        checks: cells
          .map((c, idx) => ({ c, idx }))
          .filter(({ c }) => CHECK_LABEL.test(c))
          .map(({ c, idx }) => ({ label: c.replace(CHECK_LABEL, ""), idx })),
      };
      continue;
    }
    if (!cols) continue;
    const citation = cells[cols.citation] ?? "";
    if (!citation) continue;
    const verdict = cells[cols.verdict] ?? "";
    const checks = cols.checks.map(({ label, idx }) => {
      const detail = cells[idx] ?? "";
      return { label, mark: detail.match(MARK)?.[0] ?? (detail || "-"), detail };
    });
    const alive = checks.find((c) => c.label.includes("생사"));
    rows.push({
      citation,
      pin: cols.pin >= 0 ? (cells[cols.pin] ?? "") : "",
      kind: !alive || alive.mark === "-" ? "법령" : "판례",
      state: verdict.includes("❌") ? "fail" : verdict.includes("⚠") ? "warn" : "pass",
      checks,
      result: verdict,
      note: cols.reason >= 0 ? (cells[cols.reason] ?? "") : "",
    });
  }
  // 보고 말미의 FAIL 마커 또는 ❌ 행 존재 — 둘 중 하나라도 실패로 본다
  return { rows, fail: md.includes("FAIL") || rows.some((r) => r.state === "fail") };
}
