import { CircleAlert } from "lucide-react";

/** 검수 게이트 바 (④-d, c5). 액션 연결은 P2 — 버튼은 렌더만. */
export function GateBar({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-st-action bg-st-action-bg p-3.5">
      <span className="flex items-center gap-2">
        <CircleAlert className="size-[18px] text-st-action" />
        <span className="text-sm font-medium text-neutral-950">{message}</span>
      </span>
      <span className="flex-1" />
      <button className="rounded-md bg-app-primary px-4 py-2 text-[13px] font-semibold text-white">
        승인하고 다음 단계로
      </button>
      <button className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-950">
        수정 지시…
      </button>
    </div>
  );
}
