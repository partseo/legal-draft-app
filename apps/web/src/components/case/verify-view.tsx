"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";

export type VerifyRow = {
  citation: string;
  /** 출처 핀 (MST:… / 판례ID:…) */
  pin: string;
  kind: string;
  state: "pass" | "warn" | "fail";
  /** (a)존재~(d)생사 개별 검증 항목 — mark는 ✅/⚠/❌/- 기호, detail은 셀 원문 */
  checks: { label: string; mark: string; detail: string }[];
  /** 판정 셀 원문 */
  result: string;
  /** 사유 — 무엇을 재조회해 어떻게 대조했는지 */
  note: string;
};

/** 판정 표시 — state별 아이콘·라벨·색 */
function Verdict({ state }: { state: VerifyRow["state"] }) {
  if (state === "fail")
    return (
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-st-block">
        <XCircle className="size-[15px]" />
        실패
      </span>
    );
  if (state === "warn")
    return (
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-st-action">
        <AlertTriangle className="size-[15px]" />
        주의
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-st-done">
      <CheckCircle2 className="size-[15px]" />
      통과
    </span>
  );
}

/** (a)~(d) 개별 검증 항목 칩 — hover 시 셀 원문 전체 표시 */
function CheckChips({ checks }: { checks: VerifyRow["checks"] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {checks.map((c) => (
        <span key={c.label} title={c.detail} className="flex items-center gap-1 text-[12px] text-neutral-500">
          {c.label}
          <span
            className={
              c.mark === "❌" ? "font-semibold text-st-block" : c.mark === "⚠" ? "font-semibold text-st-action" : ""
            }
          >
            {c.mark}
          </span>
        </span>
      ))}
    </span>
  );
}

export function VerifyView({
  rows,
  onRequestChanges,
}: {
  rows: VerifyRow[];
  onRequestChanges?: (note: string) => Promise<void>;
}) {
  const failCount = rows.filter((r) => r.state === "fail").length;
  const warnCount = rows.filter((r) => r.state === "warn").length;
  const [reviseOpen, setReviseOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {failCount > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-st-block bg-st-block-bg p-3.5">
          <div className="flex items-center gap-3">
            <Ban className="size-5 shrink-0 text-st-block" />
            <span className="text-sm font-semibold text-st-block">
              인용 {failCount}건 검증 실패 — 이 서면은 제출 금지 상태입니다. 수정 지시 후 재검증하세요.
            </span>
            <span className="flex-1" />
            <button
              type="button"
              disabled={pending || !onRequestChanges}
              onClick={() => setReviseOpen((v) => !v)}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-st-block bg-white px-4 py-2 text-[13px] font-semibold text-st-block disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
              수정 지시…
            </button>
          </div>
          {reviseOpen && (
            <div className="flex gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="수정 지시문 — 이 지시로 인용검증을 다시 실행합니다"
                className="min-h-16 flex-1 rounded-md border border-neutral-200 p-2 text-sm"
              />
              <button
                type="button"
                disabled={pending || note.trim().length === 0}
                onClick={() => onRequestChanges && startTransition(() => onRequestChanges(note))}
                className="flex items-center gap-1.5 self-end rounded-md bg-app-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {pending ? "재검증 중…" : "재검증 실행"}
              </button>
            </div>
          )}
        </div>
      )}
      {warnCount > 0 && failCount === 0 && (
        <div className="flex items-center gap-3 rounded-md border border-st-action bg-st-action-bg p-3.5">
          <AlertTriangle className="size-5 shrink-0 text-st-action" />
          <span className="text-sm font-medium text-st-action">
            ⚠️ {warnCount}건 — 제출을 막는 실패는 아니지만 변호사 확인이 권장되는 항목이 있습니다. 각 행의 사유를
            확인하세요.
          </span>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="flex border-b border-neutral-200 bg-neutral-100 text-xs font-semibold text-neutral-500">
          <span className="flex-1 px-3 py-2">인용 · 출처 핀</span>
          <span className="w-[64px] px-3 py-2">유형</span>
          <span className="w-[290px] px-3 py-2">검증 항목</span>
          <span className="w-[90px] px-3 py-2">판정</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 px-0 py-2 ${i > 0 ? "border-t border-neutral-200" : ""} ${
              r.state === "fail" ? "bg-st-block-bg" : r.state === "warn" ? "bg-st-action-bg" : ""
            }`}
          >
            <div className="flex items-center">
              <span className="min-w-0 flex-1 px-3">
                <span className="block truncate font-mono text-[13px] font-medium text-neutral-950" title={r.citation}>
                  {r.citation}
                </span>
                {r.pin && (
                  <span className="block truncate font-mono text-[11px] text-neutral-400" title={r.pin}>
                    {r.pin}
                  </span>
                )}
              </span>
              <span className="w-[64px] px-3 text-[13px] text-neutral-500">{r.kind}</span>
              <span className="w-[290px] px-3">
                <CheckChips checks={r.checks} />
              </span>
              <span className="w-[90px] px-3">
                <Verdict state={r.state} />
              </span>
            </div>
            {r.note && (
              <p
                className={`px-3 text-[12px] leading-relaxed ${
                  r.state === "fail"
                    ? "font-medium text-st-block"
                    : r.state === "warn"
                      ? "text-st-action"
                      : "text-neutral-500"
                }`}
              >
                {r.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
