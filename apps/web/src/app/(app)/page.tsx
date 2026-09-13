import Link from "next/link";
import { Plus, ChevronDown } from "lucide-react";
import { createRouteClient } from "@/lib/db/clients";
import { CaseRow } from "@/components/case-row";
import { fetchCasePage } from "@/lib/db/pagination";
import { CasePagination } from "@/components/case-pagination";
import { CaseSearchInput } from "@/components/case-search-input";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const cursor =
    typeof params.cursor === "string" ? params.cursor : undefined;
  const q = typeof params.q === "string" ? params.q : undefined;
  const supabase = await createRouteClient();
  const page = await fetchCasePage(supabase, { cursor, search: q });

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
        <CaseSearchInput defaultValue={q} />
      </div>

      {page.items.length === 0 && !cursor && !q ? (
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
        <>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center bg-neutral-100 px-4 py-[11px] text-xs font-semibold text-neutral-500">
              <span className="flex-1">사건명</span>
              <span className="w-[170px]">담당</span>
              <span className="w-[150px]">진행</span>
              <span className="w-[140px]">상태</span>
              <span className="w-[110px]">최근 활동</span>
            </div>
            {page.items.map((c, i) => {
              const assignee = c.assignee as { display_name: string | null } | null;
              return (
                <CaseRow
                  key={c.id}
                  index={i}
                  c={{
                    id: c.id,
                    title: c.title,
                    status: c.status,
                    updated_at: c.updated_at,
                    assigneeName: assignee?.display_name ?? null,
                  }}
                />
              );
            })}
          </div>
          <CasePagination
            count={page.items.length}
            hasNextPage={page.hasNextPage}
            nextCursor={page.nextCursor}
            hasPrevPage={!!cursor}
            searchQuery={q}
          />
        </>
      )}
    </div>
  );
}
