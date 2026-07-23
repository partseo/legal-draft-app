# 파이프라인 단계 재실행 버튼 — 설계

날짜: 2026-07-23
상태: 사용자 승인됨 (버튼 배치·확인 다이얼로그 정책 포함)

## 문제

에이전트 단계(예: 리서치)가 실패하면 스텝퍼에 ❌ 칩 + "실패 / 제출 금지" 캡션만 남고
다시 시작할 방법이 없다. 또한 성공·승인된 단계도 결과가 마음에 안 들면 재실행할 수
있어야 한다.

백엔드 `canStartStage`(`apps/web/src/lib/pipeline.ts`)는 최근 run이
`succeeded/failed/canceled`인 단계의 재실행을 이미 허용한다(`startable[stage]` true).
버튼을 그리는 UI(`cases/[id]/page.tsx`)가 `runnable` 상태에만 실행 버튼을 렌더하는
것이 원인 — **순수 UI 작업이며 백엔드 변경 없음**.

## UI 동작

| 단계 상태 | 표시 | 클릭 동작 |
|---|---|---|
| fail (실행 실패 또는 검증 FAIL) | ❌ 칩 자리에 빨간 톤 **[↻ 다시 시도]** 버튼 | 확인 없이 즉시 재실행 |
| done / action (성공·승인·검수대기) | 기존 칩 유지 + 라벨 옆 작은 **↻ 아이콘** | `confirm()` 후 재실행 |
| runnable | 기존 [▶ 실행] 버튼 (변경 없음) | — |
| locked / running / 다른 run 진행 중 | 버튼 없음 (`startable` false) | — |

- confirm 문구: "○○ 단계를 다시 실행할까요? 새 산출물 버전이 생성되며 기존 버전은
  보존됩니다. (실행 비용 발생)" — `run-panel.tsx` 취소 버튼과 같은 `confirm()` 관용구.
- fail 캡션 분기:
  - 에이전트 실행 실패 → "실행 실패 · 재시도 가능"
  - 인용검증 FAIL(verify run은 성공) → "검증 실패 · 제출 금지" (기존 문구 유지)

## 구현 변경점 (4개 파일)

1. **`apps/web/src/lib/pipeline.ts`** — 순수 함수 추가:
   `rerunKind(state: StepState, startable: boolean): "retry" | "rerun" | null`
   - `startable`이 false → null
   - state `fail` → "retry" (큰 버튼)
   - state `done`/`action` → "rerun" (작은 아이콘 + confirm)
   - 그 외(runnable/locked/running) → null
2. **`apps/web/src/app/(app)/cases/[id]/run-panel.tsx`** — `RerunButton` 추가.
   기존 `StartRunButton`의 POST `/api/cases/{caseId}/runs` 로직 재사용(공용 헬퍼로 추출).
   variant: `retry`(빨간 톤 버튼, 즉시) / `rerun`(아이콘, confirm 후).
3. **`apps/web/src/components/case/pipeline-stepper.tsx`** — `Step`에
   `rerunSlot?: ReactNode` 추가. state `fail`이면 칩 자리에, 그 외에는 라벨 뒤에 렌더.
4. **`apps/web/src/app/(app)/cases/[id]/page.tsx`** — 단계별 `rerunKind`로 슬롯 주입,
   fail 캡션 분기(`stage === "verify" && detail.verifyHasFail` 여부).

## 엣지 케이스

- **승인된 단계 재실행**: 성공 후 "검수 대기"(action)로 돌아간다. 아직 실행 안 한 후속
  단계는 승인 시각 < 새 run 시작 시각이라 자동으로 다시 잠긴다(기존 `isApproved` 파생
  로직). 이미 실행된 후속 단계의 산출물·상태는 유지되며 개별 재실행 가능.
- **검증 FAIL 시 verify 칩 링크**: 칩이 재시도 버튼으로 대체되어 "검증보고 탭 이동"
  링크가 사라지지만, 상단 ReviewCta 배너가 같은 링크를 제공한다.
- **이중 실행 방지**: run 진행 중(`running`/`waiting_checkpoint`)이면 서버가
  `startable` 전부 false → 버튼 미노출. API도 `canStartStage`로 재검증(409).

## 테스트

- `rerunKind` 단위 테스트 (vitest, `pipeline.test.ts` 또는 신규 파일).
- 기존 `canStartStage` 테스트로 서버 게이트 회귀 확인.
- UI는 `npm run build` + 수동 확인(실패 단계 재시도, 완료 단계 confirm 재실행).

## 범위 밖 (YAGNI)

- 후속 단계 산출물 자동 무효화/삭제 — 기존 버전 보존 정책 유지.
- 재실행 시 지시사항(instruction) 입력 UI — API는 받지만 이번 범위 아님.
