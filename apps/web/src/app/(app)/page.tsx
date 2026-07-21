import Link from "next/link";
import { Plus, Search, ChevronDown } from "lucide-react";
import { createRouteClient } from "@/lib/db/clients";
import { StatusBadge } from "@/components/status-badge";
import { AvatarBadge } from "@/components/avatar-badge";
import { MiniStepper } from "@/components/mini-stepper";
import { caseStatusTone, progressFromStatus } from "@/lib/status";
import { formatRelative } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const supabase = await createRouteClient();
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, status, updated_at, assignee:profiles!cases_assignee_fkey(display_name)")
    .order("updated_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6 p-9">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-950">사건</h1>
        <Link
          href="/cases/new"
          className="flex items-center gap-1.5 rounded-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="size-4" />새 사건
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950">
          담당자: 전체 <ChevronDown className="size-4 text-neutral-500" />
        </span>
        <span className="flex w-[260px] items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-500">
          <Search className="size-4" />
          사건명 검색
        </span>
      </div>

      {!cases || cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-lg border border-neutral-200 bg-white p-10 py-24">
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[15px] font-semibold text-neutral-950">아직 사건이 없습니다.</p>
            <p className="text-[13px] text-neutral-500">새 사건을 등록하세요.</p>
          </div>
          <Link
            href="/cases/new"
            className="flex items-center gap-1.5 rounded-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="size-4" />새 사건
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="flex items-center bg-neutral-100 px-4 py-[11px] text-xs font-semibold text-neutral-500">
            <span className="flex-1">사건명</span>
            <span className="w-[170px]">담당</span>
            <span className="w-[150px]">진행</span>
            <span className="w-[140px]">상태</span>
            <span className="w-[110px]">최근 활동</span>
          </div>
          {cases.map((c, i) => {
            const tone = caseStatusTone(c.status);
            const needsAttention = tone === "action";
            return (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className={`flex items-center px-4 py-3 hover:bg-neutral-50 ${
                  i > 0 ? "border-t border-neutral-200" : ""
                } ${needsAttention ? "border-l-2 border-l-st-action" : "border-l-2 border-l-transparent"}`}
              >
                <span className="flex-1 truncate text-sm font-medium text-neutral-950">{c.title}</span>
                <span className="flex w-[170px] items-center gap-2">
                  {c.assignee ? (
                    <>
                      <AvatarBadge name={c.assignee.display_name} />
                      <span className="text-sm text-neutral-950">{c.assignee.display_name}</span>
                    </>
                  ) : (
                    <span className="text-sm text-neutral-400">미지정</span>
                  )}
                </span>
                <span className="w-[150px]">
                  <MiniStepper filled={progressFromStatus(c.status)} />
                </span>
                <span className="w-[140px]">
                  <StatusBadge status={c.status} pulse={c.status === "응답 필요"} />
                </span>
                <span className="w-[110px] text-[13px] text-neutral-500">
                  {formatRelative(c.updated_at)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
