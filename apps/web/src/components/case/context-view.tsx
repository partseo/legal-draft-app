/** 사건컨텍스트 구조화 뷰 (④-d) — props 기반, 데이터는 사건컨텍스트.json에서 매핑 */

export type ContextParty = { role: string; name: string; address?: string; contact?: string };
export type ContextFact = { date: string; content: string; evidence: string };
export type ContextIssue = { id: string; title: string; claim: string; approved: boolean };

export type CaseContextData = {
  parties: ContextParty[];
  facts: ContextFact[];
  issues: ContextIssue[];
  claimSummary: string;
  needsReview: string[];
};

import { Check } from "lucide-react";

export function ContextView({ data }: { data: CaseContextData }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        {data.parties.map((p) => (
          <div key={p.role + p.name} className="flex flex-1 flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold text-white ${
                  p.role === "원고" ? "bg-app-primary" : "bg-zinc-600"
                }`}
              >
                {p.role}
              </span>
              <span className="text-[15px] font-semibold text-neutral-950">{p.name}</span>
            </div>
            {p.address && (
              <div className="flex items-center gap-2.5">
                <span className="w-[52px] text-xs text-neutral-500">주소</span>
                <span className="text-[13px] text-neutral-950">{p.address}</span>
              </div>
            )}
            {p.contact && (
              <div className="flex items-center gap-2.5">
                <span className="w-[52px] text-xs text-neutral-500">연락처</span>
                <span className="text-[13px] text-neutral-950">{p.contact}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="flex border-b border-neutral-200 bg-neutral-100 text-xs font-semibold text-neutral-500">
          <span className="w-[140px] px-3 py-2">일자</span>
          <span className="flex-1 px-3 py-2">내용</span>
          <span className="w-[150px] px-3 py-2">근거</span>
        </div>
        {data.facts.map((f, i) => (
          <div key={i} className={`flex items-center ${i > 0 ? "border-t border-neutral-200" : ""}`}>
            <span className="w-[140px] px-3 py-2 text-[13px] text-neutral-950">{f.date}</span>
            <span className="flex-1 px-3 py-2 text-[13px] text-neutral-950">{f.content}</span>
            <span className="w-[150px] px-3 py-2">
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-zinc-600">{f.evidence}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {data.issues.map((s) => (
          <div key={s.id} className="flex flex-1 flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[13px] font-semibold text-neutral-950">
                {s.id} {s.title}
              </span>
              {s.approved && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-st-done">
                  <Check className="size-3.5" />
                  승인됨
                </span>
              )}
            </div>
            <p className="text-[13px] text-neutral-500">우리 주장: {s.claim}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4">
        <span className="text-[13px] font-semibold text-neutral-950">청구취지 요약</span>
        <p className="whitespace-pre-line text-[13px] leading-normal text-neutral-950">{data.claimSummary}</p>
      </div>

      {data.needsReview.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-st-block bg-st-block-bg p-4">
          <span className="text-[13px] font-semibold text-st-block">변호사 확인 필요</span>
          {data.needsReview.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-st-block" />
              <span className="text-[11px] font-semibold text-st-block">[변호사 확인 필요]</span>
              <span className="text-[13px] text-neutral-950">{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
