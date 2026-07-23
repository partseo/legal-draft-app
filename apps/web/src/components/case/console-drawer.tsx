"use client";

import { useState } from "react";
import { Check, ChevronDown, CircleAlert, Loader2, Plus, Trash2, X } from "lucide-react";

export type TimelineItem = {
  text: string;
  state: "done" | "running";
  logs?: string[];
};

export type CheckpointIssue = { id: string; title: string; claim: string };

/** 실행 콘솔 드로어 — 실행중 모드 (④-b) */
export function RunningConsole({
  title,
  items,
  footer,
  onCancel,
  submitting = false,
}: {
  title: string;
  items: TimelineItem[];
  footer: string;
  onCancel?: () => void;
  submitting?: boolean;
}) {
  return (
    <aside className="flex w-[420px] shrink-0 flex-col gap-3 border-l border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-st-run" />
          <span className="text-[15px] font-semibold text-neutral-950">{title}</span>
        </span>
        <button
          type="button"
          disabled={!onCancel || submitting}
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-md border border-st-block bg-white px-3 py-1.5 text-[13px] font-semibold text-st-block disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          {submitting ? "취소 중…" : "실행 취소"}
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              {item.state === "done" ? (
                <Check className="size-4 shrink-0 text-st-done" />
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin text-st-run" />
              )}
              <span className="flex-1 text-[13px] font-medium leading-snug text-neutral-950">{item.text}</span>
              <ChevronDown className="size-[15px] shrink-0 text-zinc-400" />
            </div>
            {item.logs && (
              <div className="flex flex-col gap-1 rounded-md bg-neutral-100 p-3">
                {item.logs.map((log, j) => (
                  <span key={j} className="font-mono text-[11px] leading-normal text-neutral-500">
                    {log}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <span className="text-[11px] text-neutral-500">{footer}</span>
    </aside>
  );
}

/** 체크포인트 드로어 — 쟁점 승인 / 질문 (④-c). 콜백이 없으면 렌더 전용(프리뷰 호환). */
export function CheckpointConsole({
  issues,
  question,
  onSubmit,
  onSubmitAnswer,
  submitting = false,
}: {
  issues: CheckpointIssue[];
  question?: string;
  onSubmit?: (issues: CheckpointIssue[]) => void;
  onSubmitAnswer?: (answer: string) => void;
  submitting?: boolean;
}) {
  const [rows, setRows] = useState<CheckpointIssue[]>(issues);
  const [answer, setAnswer] = useState("");

  if (question) {
    return (
      <aside className="flex w-[420px] shrink-0 flex-col gap-3 border-l border-neutral-200 bg-white p-5">
        <div className="flex flex-col gap-3.5 rounded-lg border border-st-action bg-white p-4">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-[18px] text-st-action" />
            <span className="text-[15px] font-semibold text-neutral-950">확인이 필요합니다</span>
          </div>
          <p className="text-[13px] leading-normal text-neutral-950">{question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            placeholder="답변을 입력하세요"
            className="rounded-md border border-neutral-200 p-2 text-[13px]"
          />
          <button
            type="button"
            disabled={!onSubmitAnswer || answer.trim().length === 0 || submitting}
            onClick={() => onSubmitAnswer?.(answer.trim())}
            className="flex items-center justify-center gap-2 rounded-md bg-app-primary px-4 py-[11px] text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {submitting ? "보내는 중…" : "답변 보내기"}
          </button>
        </div>
        <span className="text-[11px] leading-normal text-neutral-500">
          응답 전까지 세션은 일시정지 상태이며 비용이 발생하지 않습니다.
        </span>
      </aside>
    );
  }

  const update = (i: number, patch: Partial<CheckpointIssue>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));
  const add = () => setRows((prev) => [...prev, { id: `쟁점${prev.length + 1}`, title: "", claim: "" }]);

  return (
    <aside className="flex w-[420px] shrink-0 flex-col gap-3 border-l border-neutral-200 bg-white p-5">
      <div className="flex flex-col gap-3.5 rounded-lg border border-st-action bg-white p-4">
        <div className="flex items-center gap-2">
          <CircleAlert className="size-[18px] text-st-action" />
          <span className="text-[15px] font-semibold text-neutral-950">쟁점 승인이 필요합니다</span>
        </div>
        <p className="text-[13px] leading-normal text-neutral-500">
          AI가 도출한 쟁점 후보입니다. 수정·삭제·추가 후 승인하세요.
        </p>
        <div className="flex flex-col gap-2">
          {rows.map((s, i) => (
            <div key={i} className="flex flex-col gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-app-tint px-[7px] py-0.5 font-mono text-[11px] font-semibold text-app-primary">
                  {s.id}
                </span>
                <input
                  value={s.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  disabled={!onSubmit}
                  placeholder="쟁점 제목"
                  className="flex-1 bg-transparent text-[13px] font-semibold text-neutral-950 outline-none"
                />
                <button type="button" disabled={!onSubmit} onClick={() => remove(i)} className="disabled:opacity-40">
                  <Trash2 className="size-[15px] text-neutral-500" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-zinc-400">우리 주장</span>
                <textarea
                  value={s.claim}
                  onChange={(e) => update(i, { claim: e.target.value })}
                  disabled={!onSubmit}
                  rows={2}
                  className="resize-none rounded-md border border-neutral-200 bg-white p-1.5 text-xs leading-snug text-zinc-600 outline-none disabled:border-transparent disabled:bg-transparent disabled:p-0"
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={!onSubmit}
          onClick={add}
          className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold text-app-primary disabled:opacity-40"
        >
          <Plus className="size-[15px]" />
          쟁점 추가
        </button>
        <button
          type="button"
          disabled={!onSubmit || rows.length === 0 || submitting}
          onClick={() => onSubmit?.(rows)}
          className="flex items-center justify-center gap-2 rounded-md bg-app-primary px-4 py-[11px] text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {submitting ? "승인 중…" : `${rows.length}개 쟁점 승인하고 계속`}
        </button>
      </div>
      <span className="text-[11px] leading-normal text-neutral-500">
        응답 전까지 세션은 일시정지 상태이며 비용이 발생하지 않습니다.
      </span>
    </aside>
  );
}
