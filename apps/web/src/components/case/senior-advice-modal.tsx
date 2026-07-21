"use client";

import { CircleAlert, X } from "lucide-react";

/** 시니어 조언 모달 (c6) — 표시 전용, 어디에도 저장하지 않는다. */
export function SeniorAdviceModal({
  advice,
  onClose,
}: {
  advice: string[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-800/80">
      <div className="flex w-[640px] flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-center gap-3 px-6 py-5">
          <span className="text-lg font-semibold text-neutral-950">시니어 변호사 송무 조언</span>
          <span className="flex-1" />
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-md hover:bg-neutral-100">
            <X className="size-[18px] text-neutral-500" />
          </button>
        </div>
        <div className="flex gap-2 bg-st-action-bg px-6 py-3">
          <CircleAlert className="size-[18px] shrink-0 text-st-action" />
          <p className="text-[13px] font-medium leading-normal text-st-action">
            이 조언은 어디에도 저장되지 않습니다. 닫으면 다시 볼 수 없습니다(재검증 시에만 재생성).
          </p>
        </div>
        <div className="flex flex-col gap-3.5 p-6">
          {advice.map((a, i) => (
            <p key={i} className="text-sm leading-relaxed text-neutral-950">
              {a}
            </p>
          ))}
        </div>
        <div className="flex justify-end border-t border-neutral-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-app-primary px-[18px] py-2.5 text-sm font-semibold text-white"
          >
            확인하고 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
