/**
 * 실행 단계(run_stage) → 사람이 읽는 한국어 라벨. 클라이언트에서도 쓰이므로
 * 서버 전용 모듈(prompts.ts 등)을 import 하지 않는 순수 상수로 둔다.
 */
const STAGE_LABEL: Record<string, string> = {
  intake: "사건구성",
  research: "리서치",
  draft: "서면 작성",
  verify: "인용검증",
};

/** 미지의 값은 원문을 그대로 돌려준다(베타 — 단계 추가에 관대하게). */
export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}
