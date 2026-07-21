import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { AvatarBadge } from "@/components/avatar-badge";

export function CaseHeader({
  title,
  status,
  assigneeName,
}: {
  title: string;
  status: string;
  assigneeName?: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/"
        className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white"
      >
        <ArrowLeft className="size-[18px] text-neutral-950" />
      </Link>
      <h1 className="text-xl font-semibold text-neutral-950">{title}</h1>
      <StatusBadge status={status} pulse={status === "응답 필요"} />
      <span className="flex-1" />
      {assigneeName && (
        <span className="flex items-center gap-2">
          <AvatarBadge name={assigneeName} />
          <span className="text-sm font-medium text-neutral-950">{assigneeName}</span>
        </span>
      )}
    </div>
  );
}
