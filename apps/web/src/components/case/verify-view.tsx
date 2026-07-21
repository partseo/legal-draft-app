import { Ban, CheckCircle2, RotateCcw, XCircle } from "lucide-react";

export type VerifyRow = {
  citation: string;
  kind: string;
  pass: boolean;
  result: string;
  note: string;
};

export function VerifyView({ rows }: { rows: VerifyRow[] }) {
  const failCount = rows.filter((r) => !r.pass).length;
  return (
    <div className="flex flex-col gap-4">
      {failCount > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-st-block bg-st-block-bg p-3.5">
          <Ban className="size-5 text-st-block" />
          <span className="text-sm font-semibold text-st-block">
            인용 {failCount}건 검증 실패 — 이 서면은 제출 금지 상태입니다. 수정 지시 후 재검증하세요.
          </span>
          <span className="flex-1" />
          <button className="flex items-center gap-1.5 rounded-md border border-st-block bg-white px-4 py-2 text-[13px] font-semibold text-st-block">
            <RotateCcw className="size-3.5" />
            수정 지시…
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="flex border-b border-neutral-200 bg-neutral-100 text-xs font-semibold text-neutral-500">
          <span className="flex-1 px-3 py-2">인용</span>
          <span className="w-[100px] px-3 py-2">유형</span>
          <span className="w-[220px] px-3 py-2">대조 결과</span>
          <span className="w-[140px] px-3 py-2">비고</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className={`flex items-center ${i > 0 ? "border-t border-neutral-200" : ""} ${
              r.pass ? "" : "bg-st-block-bg"
            }`}
          >
            <span className="flex-1 px-3 py-2 font-mono text-[13px] font-medium text-neutral-950">{r.citation}</span>
            <span className="w-[100px] px-3 py-2 text-[13px] text-neutral-500">{r.kind}</span>
            <span className={`flex w-[220px] items-center gap-1.5 px-3 py-2 text-[13px] font-semibold ${r.pass ? "text-st-done" : "text-st-block"}`}>
              {r.pass ? <CheckCircle2 className="size-[15px]" /> : <XCircle className="size-[15px]" />}
              {r.result}
            </span>
            <span className={`w-[140px] px-3 py-2 text-[13px] ${r.pass ? "text-neutral-500" : "text-st-block"}`}>
              {r.note}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
