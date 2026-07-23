"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

/**
 * <Link> 자손에 두면 그 링크의 네비게이션이 진행 중일 때 로딩 표시를 보여준다.
 * (Next.js useLinkStatus 는 Link 내부에서만 pending 을 읽을 수 있다.)
 * - 기본: 인라인 스피너 (탭 라벨 옆 등)
 * - overlay: 부모 영역 전체를 덮는 반투명 로딩 오버레이 (사건 행 등)
 */
export function LinkPending({
  overlay = false,
  className = "",
}: {
  overlay?: boolean;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  if (overlay) {
    return (
      <span className="absolute inset-0 flex items-center justify-center gap-2 bg-white/70 text-[13px] font-medium text-app-primary backdrop-blur-[1px]">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        여는 중…
      </span>
    );
  }

  return <Loader2 className={`size-3.5 shrink-0 animate-spin ${className}`} aria-label="불러오는 중" />;
}
