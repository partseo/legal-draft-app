/** front-design 상태 토큰 5종. 사건 상태 문자열(한국어 라벨)을 톤으로 매핑한다. */
export type StatusTone = "wait" | "run" | "action" | "block" | "done";

const STATUS_TONE: Record<string, StatusTone> = {
  대기: "wait",
  실행중: "run",
  "실행 중": "run",
  "응답 필요": "action",
  "검수 대기": "action",
  "제출 금지": "block",
  완료: "done",
};

export function caseStatusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? "wait";
}

/** Tailwind 클래스 (globals.css의 st-* 토큰 사용) */
export const TONE_CLASSES: Record<StatusTone, { text: string; bg: string; dot: string }> = {
  wait: { text: "text-st-wait", bg: "bg-st-wait-bg", dot: "bg-st-wait" },
  run: { text: "text-st-run", bg: "bg-st-run-bg", dot: "bg-st-run" },
  action: { text: "text-st-action", bg: "bg-st-action-bg", dot: "bg-st-action" },
  block: { text: "text-st-block", bg: "bg-st-block-bg", dot: "bg-st-block" },
  done: { text: "text-st-done", bg: "bg-st-done-bg", dot: "bg-st-done" },
};

/** 라운드 내 단계 수 (사건구성→리서치→서면→검증) */
export const STAGE_LABELS = ["사건구성", "리서치", "서면 작성", "인용검증"] as const;

/** 사건 상태 → 미니 스테퍼에서 채워질 도트 수 (0~4). 실데이터(runs) 연결 전 근사치. */
export function progressFromStatus(status: string): number {
  switch (caseStatusTone(status)) {
    case "done":
      return 4;
    case "block":
      return 4;
    case "wait":
      return 0;
    default:
      return 1;
  }
}
