"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { AvatarBadge } from "@/components/avatar-badge";
import { MiniStepper } from "@/components/mini-stepper";
import { caseStatusTone, progressFromStatus } from "@/lib/status";
import { formatRelative } from "@/lib/time";
import { deleteCase } from "@/app/(app)/cases/actions";

export type CaseListItem = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  assigneeName: string | null;
};

/** 사건 목록의 한 행 — 전체는 상세로 이동하는 링크, hover 시 우측에 삭제 버튼. */
export function CaseRow({ c, index }: { c: CaseListItem; index: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsAttention = caseStatusTone(c.status) === "action";

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setOpen(true);
  }
  function cancel() {
    if (!pending) {
      setOpen(false);
      setError(null);
    }
  }
  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCase(c.id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOpen(false); // 서버의 revalidatePath("/")가 목록에서 이 행을 제거한다.
    });
  }

  return (
    <div
      className={`group relative flex items-center px-4 py-3 hover:bg-neutral-50 ${
        index > 0 ? "border-t border-neutral-200" : ""
      } ${needsAttention ? "border-l-2 border-l-st-action" : "border-l-2 border-l-transparent"}`}
    >
      <Link
        href={`/cases/${c.id}`}
        aria-label={`${c.title} 사건 열기`}
        className="absolute inset-0"
      />
      <span className="pointer-events-none relative flex-1 truncate text-sm font-medium text-neutral-950">
        {c.title}
      </span>
      <span className="pointer-events-none relative flex w-[170px] items-center gap-2">
        {c.assigneeName ? (
          <>
            <AvatarBadge name={c.assigneeName} />
            <span className="text-sm text-neutral-950">{c.assigneeName}</span>
          </>
        ) : (
          <span className="text-sm text-neutral-400">미지정</span>
        )}
      </span>
      <span className="pointer-events-none relative w-[150px]">
        <MiniStepper filled={progressFromStatus(c.status)} />
      </span>
      <span className="pointer-events-none relative w-[140px]">
        <StatusBadge status={c.status} pulse={c.status === "응답 필요"} />
      </span>
      <span className="pointer-events-none relative w-[110px] text-[13px] text-neutral-500">
        {formatRelative(c.updated_at)}
      </span>

      <button
        type="button"
        onClick={openModal}
        aria-label={`${c.title} 사건 삭제`}
        className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 opacity-0 hover:bg-st-block-bg hover:text-st-block focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-800/80"
          onClick={cancel}
        >
          <div
            className="flex w-[440px] flex-col overflow-hidden rounded-xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2 p-6">
              <span className="text-lg font-semibold text-neutral-950">사건 삭제</span>
              <p className="text-sm leading-relaxed text-neutral-700">
                <b className="font-semibold text-neutral-950">{c.title}</b> 사건을 완전히
                삭제할까요? 라운드·서면·검증·업로드 파일이 모두 삭제되며 되돌릴 수 없습니다.
              </p>
              {error && <p className="text-[13px] text-st-block">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-6 py-4">
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-950 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="rounded-lg bg-st-block px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
