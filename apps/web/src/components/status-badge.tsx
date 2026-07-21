import { Loader2 } from "lucide-react";
import { caseStatusTone, TONE_CLASSES } from "@/lib/status";

export function StatusBadge({ status, pulse }: { status: string; pulse?: boolean }) {
  const tone = caseStatusTone(status);
  const c = TONE_CLASSES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.bg} ${c.text}`}>
      {tone === "run" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className={`size-1.5 rounded-full ${c.dot} ${pulse ? "animate-pulse" : ""}`} />
      )}
      {status}
    </span>
  );
}
