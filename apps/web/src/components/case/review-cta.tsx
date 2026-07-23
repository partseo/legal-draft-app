import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";

/**
 * 검수 안내 배너 — 사건 상태가 "검수 대기/제출 금지"라 변호사의 검수·승인이 필요한데
 * 개요 등 다른 탭에 있을 때, 해당 단계 탭으로 유도한다. (렌더 전용, next/link 이동)
 */
export function ReviewCta({
  message,
  href,
  ctaLabel = "검수하러 가기",
}: {
  message: string;
  href: string;
  ctaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-st-action bg-st-action-bg p-3.5">
      <CircleAlert className="size-[18px] shrink-0 text-st-action" />
      <span className="flex-1 text-sm font-medium text-neutral-950">{message}</span>
      <Link
        href={href}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-app-primary px-4 py-2 text-[13px] font-semibold text-white"
      >
        {ctaLabel}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
