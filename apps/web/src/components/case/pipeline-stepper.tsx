import { Check, ChevronDown, ChevronRight, Lock, Loader2, Play, X, CircleAlert } from "lucide-react";

export type StepState = "runnable" | "locked" | "running" | "done" | "action" | "fail";

export type Step = { label: string; caption: string; state: StepState };

function StepChip({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return (
        <span className="flex size-7 items-center justify-center rounded-full bg-st-done">
          <Check className="size-4 text-white" />
        </span>
      );
    case "running":
      return (
        <span className="flex size-7 items-center justify-center rounded-full bg-st-run-bg">
          <Loader2 className="size-[15px] animate-spin text-st-run" />
        </span>
      );
    case "action":
      return (
        <span className="flex size-7 items-center justify-center rounded-full bg-st-action-bg">
          <CircleAlert className="size-[15px] text-st-action" />
        </span>
      );
    case "fail":
      return (
        <span className="flex size-7 items-center justify-center rounded-full bg-st-block">
          <X className="size-4 text-white" />
        </span>
      );
    default:
      return (
        <span className="flex size-7 items-center justify-center rounded-full bg-neutral-100">
          <Lock className="size-[15px] text-zinc-400" />
        </span>
      );
  }
}

export function PipelineStepper({
  round,
  steps,
  onRunHref,
}: {
  round: string;
  steps: Step[];
  onRunHref?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-5">
      <span className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-[13px] font-medium text-neutral-950">
        {round}
        <ChevronDown className="size-4 text-neutral-500" />
      </span>
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-3">
          {i > 0 && <ChevronRight className="size-4 text-zinc-300" />}
          <span className="flex items-center gap-2.5">
            {s.state === "runnable" ? (
              <a
                href={onRunHref ?? "#"}
                className="flex items-center gap-1.5 rounded-md bg-app-primary px-3 py-[7px] text-xs font-semibold text-white"
              >
                <Play className="size-3.5" />
                실행
              </a>
            ) : (
              <StepChip state={s.state} />
            )}
            <span className="flex flex-col gap-0.5">
              <span
                className={`text-[13px] ${
                  s.state === "locked" ? "font-medium text-zinc-400" : "font-semibold text-neutral-950"
                }`}
              >
                {s.label}
              </span>
              <span
                className={`text-[11px] ${
                  s.state === "running"
                    ? "text-st-run"
                    : s.state === "action"
                      ? "text-st-action"
                      : s.state === "fail"
                        ? "font-semibold text-st-block"
                        : s.state === "locked"
                          ? "text-zinc-400"
                          : "text-neutral-500"
                }`}
              >
                {s.caption}
              </span>
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
