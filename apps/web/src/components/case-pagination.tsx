"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CasePagination({
  count,
  hasNextPage,
  nextCursor,
  hasPrevPage,
  searchQuery,
}: {
  count: number;
  hasNextPage: boolean;
  nextCursor: string | null;
  hasPrevPage: boolean;
  searchQuery?: string;
}) {
  const router = useRouter();

  function buildNextHref() {
    const params = new URLSearchParams();
    if (nextCursor) params.set("cursor", nextCursor);
    if (searchQuery) params.set("q", searchQuery);
    return `/?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-neutral-500">
        현재 {count}건 표시
      </span>
      <div className="flex items-center gap-2">
        {hasPrevPage && (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <ChevronLeft className="size-4" />
            이전
          </button>
        )}
        {hasNextPage && nextCursor && (
          <Link
            href={buildNextHref()}
            className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            다음 {count}건
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
