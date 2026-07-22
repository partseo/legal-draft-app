"use client";

import { useState, useTransition } from "react";
import { CircleAlert } from "lucide-react";

/** 검수 게이트 바 (④-d, c5). 액션 props가 없으면 렌더 전용(프리뷰 호환). */
export function GateBar({
  message,
  onApprove,
  onRequestChanges,
}: {
  message: string;
  onApprove?: () => Promise<void>;
  onRequestChanges?: (note: string) => Promise<void>;
}) {
  const [reviseOpen, setReviseOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-st-action bg-st-action-bg p-3.5">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2">
          <CircleAlert className="size-[18px] text-st-action" />
          <span className="text-sm font-medium text-neutral-950">{message}</span>
        </span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={pending || !onApprove}
          onClick={() => onApprove && startTransition(() => onApprove())}
          className="rounded-md bg-app-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          승인하고 다음 단계로
        </button>
        <button
          type="button"
          disabled={pending || !onRequestChanges}
          onClick={() => setReviseOpen((v) => !v)}
          className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-950 disabled:opacity-50"
        >
          수정 지시…
        </button>
      </div>
      {reviseOpen && (
        <div className="flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="수정 지시문 — 이 지시로 같은 단계를 재실행합니다"
            className="min-h-16 flex-1 rounded-md border border-neutral-200 p-2 text-sm"
          />
          <button
            type="button"
            disabled={pending || note.trim().length === 0}
            onClick={() => onRequestChanges && startTransition(() => onRequestChanges(note))}
            className="self-end rounded-md bg-app-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            재실행
          </button>
        </div>
      )}
    </div>
  );
}
