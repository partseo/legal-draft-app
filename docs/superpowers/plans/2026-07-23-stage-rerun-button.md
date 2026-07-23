# 파이프라인 단계 재실행 버튼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파이프라인 단계가 실패하면 "다시 시도" 버튼으로 즉시 재실행, 성공·검수대기 단계는 작은 ↻ 아이콘(confirm 후)으로 언제든 재실행 가능하게 한다.

**Architecture:** 백엔드 `canStartStage`는 이미 재실행을 허용하므로(`startable[stage]` true) UI만 변경한다. 순수 함수 `rerunKind`로 버튼 종류를 판단하고, `RerunButton` 클라이언트 컴포넌트가 기존 `StartRunButton`과 같은 POST 엔드포인트를 호출하며, `PipelineStepper`의 `Step`에 `rerunSlot` 프로퍼티를 추가해 서버 컴포넌트(page.tsx)가 슬롯을 주입한다.

**Tech Stack:** Next.js 15 App Router (RSC + client components), Tailwind v4, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-stage-rerun-button-design.md`

## Global Constraints

- 백엔드(`canStartStage`, API route, `startRun`) 변경 금지 — 순수 UI 작업.
- 확인 다이얼로그는 브라우저 `confirm()` 사용 (run-panel.tsx 취소 버튼과 같은 관용구).
- confirm 문구(그대로 사용): `${stageName} 단계를 다시 실행할까요? 새 산출물 버전이 생성되며 기존 버전은 보존됩니다. (실행 비용 발생)`
- fail 캡션: 검증 FAIL(verify)이면 `검증 실패 · 제출 금지`, 실행 실패면 `실행 실패 · 재시도 가능`(재실행 불가 시 `실행 실패`).
- 재실행 버튼 색: retry 큰 버튼은 `bg-st-block`(빨간 톤, 삭제 버튼과 동일 토큰), 아이콘은 neutral 톤.
- 모든 명령은 `apps/web/`에서 실행.

---

### Task 1: `rerunKind` 순수 함수 (pipeline.ts) — TDD

**Files:**
- Modify: `apps/web/src/lib/pipeline.ts` (파일 끝에 함수 추가)
- Test: `apps/web/src/lib/__tests__/pipeline.test.ts` (describe 블록 추가)

**Interfaces:**
- Consumes: `StepState` 타입 (`@/components/case/pipeline-stepper`에서 이미 import 됨 — pipeline.ts:2)
- Produces: `rerunKind(state: StepState, startable: boolean): "retry" | "rerun" | null` — Task 4가 import 해서 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/__tests__/pipeline.test.ts` — import에 `rerunKind` 추가:

```ts
import { deriveStepStates, canStartStage, deriveCaseStatus, rerunKind, type PipelineInput } from "@/lib/pipeline";
```

파일 끝에 describe 블록 추가:

```ts
describe("rerunKind", () => {
  it("startable false → 항상 null (실행 중이거나 잠김)", () => {
    expect(rerunKind("fail", false)).toBe(null);
    expect(rerunKind("done", false)).toBe(null);
    expect(rerunKind("action", false)).toBe(null);
  });

  it("fail → retry (큰 다시 시도 버튼)", () => {
    expect(rerunKind("fail", true)).toBe("retry");
  });

  it("done/action → rerun (작은 아이콘 + confirm)", () => {
    expect(rerunKind("done", true)).toBe("rerun");
    expect(rerunKind("action", true)).toBe("rerun");
  });

  it("runnable/locked/running → null (기존 실행 버튼 또는 버튼 없음)", () => {
    expect(rerunKind("runnable", true)).toBe(null);
    expect(rerunKind("locked", true)).toBe(null);
    expect(rerunKind("running", true)).toBe(null);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- src/lib/__tests__/pipeline.test.ts`
Expected: FAIL — `rerunKind`가 export 되지 않아 undefined 호출 에러.

- [ ] **Step 3: 최소 구현**

`apps/web/src/lib/pipeline.ts` 파일 끝에 추가:

```ts
/**
 * 단계 재실행 버튼 종류.
 * - "retry": 실패 단계 — 칩 자리에 큰 "다시 시도" 버튼 (확인 없이 즉시)
 * - "rerun": 완료·검수대기 단계 — 라벨 옆 작은 ↻ 아이콘 (confirm 후)
 * - null: 버튼 없음 (runnable은 기존 실행 버튼, locked/running/실행 중엔 미노출)
 */
export function rerunKind(state: StepState, startable: boolean): "retry" | "rerun" | null {
  if (!startable) return null;
  if (state === "fail") return "retry";
  if (state === "done" || state === "action") return "rerun";
  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- src/lib/__tests__/pipeline.test.ts`
Expected: PASS (기존 describe 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat(web): rerunKind — 단계 재실행 버튼 종류 판단 순수 함수"
```

---

### Task 2: `RerunButton` 클라이언트 컴포넌트 (run-panel.tsx)

**Files:**
- Modify: `apps/web/src/app/(app)/cases/[id]/run-panel.tsx` (StartRunButton 리팩터 + RerunButton 추가)

**Interfaces:**
- Consumes: 기존 POST `/api/cases/{caseId}/runs` 엔드포인트 (변경 없음)
- Produces: `RerunButton({ caseId, stage, stageName, kind }: { caseId: string; stage: string; stageName: string; kind: "retry" | "rerun" })` — Task 4가 import. `StartRunButton`의 시그니처·동작은 그대로 유지.

- [ ] **Step 1: 공용 시작 로직 추출 + RerunButton 구현**

`run-panel.tsx`의 lucide-react import에 `RotateCcw` 추가:

```ts
import { Play, RotateCcw } from "lucide-react";
```

기존 `StartRunButton`(22-49행)을 아래로 교체(공용 훅 추출 + RerunButton 추가):

```tsx
/** POST /api/cases/{caseId}/runs — 성공 시 router.refresh(), 실패 시 alert. */
function useStartStage(caseId: string, stage: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "실행 시작 실패");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return { busy, start };
}

export function StartRunButton({ caseId, stage, label }: { caseId: string; stage: string; label: string }) {
  const { busy, start } = useStartStage(caseId, stage);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={start}
      className="flex items-center gap-1.5 rounded-md bg-app-primary px-3 py-[7px] text-xs font-semibold text-white disabled:opacity-50"
    >
      <Play className="size-3.5" />
      {busy ? "시작 중…" : label}
    </button>
  );
}

/**
 * 단계 재실행 버튼.
 * - kind="retry": 실패 단계 — 빨간 톤 "다시 시도" 버튼, 확인 없이 즉시 실행
 * - kind="rerun": 완료·검수대기 단계 — 작은 ↻ 아이콘, confirm 후 실행
 */
export function RerunButton({
  caseId,
  stage,
  stageName,
  kind,
}: {
  caseId: string;
  stage: string;
  stageName: string;
  kind: "retry" | "rerun";
}) {
  const { busy, start } = useStartStage(caseId, stage);
  if (kind === "retry") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={start}
        className="flex items-center gap-1.5 rounded-md bg-st-block px-3 py-[7px] text-xs font-semibold text-white disabled:opacity-50"
      >
        <RotateCcw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "시작 중…" : "다시 시도"}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      title={`${stageName} 다시 실행`}
      aria-label={`${stageName} 다시 실행`}
      onClick={() => {
        if (busy) return;
        if (confirm(`${stageName} 단계를 다시 실행할까요? 새 산출물 버전이 생성되며 기존 버전은 보존됩니다. (실행 비용 발생)`))
          start();
      }}
      className="flex size-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
    >
      <RotateCcw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
    </button>
  );
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `npx eslint "src/app/(app)/cases/[id]/run-panel.tsx" && npm run test`
Expected: eslint 통과(기존 52행 `caseId` unused 경고는 RunPanel 쪽 기존 이슈로 무관), vitest 전부 PASS.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(app)/cases/[id]/run-panel.tsx"
git commit -m "feat(web): RerunButton — 실패 재시도·완료 단계 재실행 버튼 컴포넌트"
```

---

### Task 3: `PipelineStepper`에 `rerunSlot` 렌더링

**Files:**
- Modify: `apps/web/src/components/case/pipeline-stepper.tsx`

**Interfaces:**
- Consumes: 없음 (ReactNode 슬롯만 받음 — 컴포넌트 결합 없음)
- Produces: `Step` 타입에 `rerunSlot?: ReactNode` 추가. 렌더 규칙: state `fail`이면 칩 자리에 rerunSlot, 그 외 state는 칩+텍스트 뒤에 rerunSlot. Task 4가 이 프로퍼티에 `<RerunButton/>`을 주입.

- [ ] **Step 1: Step 타입 확장 + 렌더 분기**

`pipeline-stepper.tsx`의 Step 타입(8행)을 교체:

```ts
/** href가 있으면 칩을 클릭해 해당 단계 탭으로 이동(검수 유도). runnable은 runSlot이 우선. rerunSlot: fail이면 칩 자리, 그 외엔 텍스트 뒤에 렌더. */
export type Step = { label: string; caption: string; state: StepState; href?: string; rerunSlot?: ReactNode };
```

steps 매핑 내부(66-107행 부근)의 렌더 분기를 교체 — 기존:

```tsx
          <span className="flex items-center gap-2.5">
            {s.state === "runnable" ? (
              (runSlot ?? (
                <a
                  href={onRunHref ?? "#"}
                  className="flex items-center gap-1.5 rounded-md bg-app-primary px-3 py-[7px] text-xs font-semibold text-white"
                >
                  <Play className="size-3.5" />
                  실행
                </a>
              ))
            ) : s.href ? (
              <Link href={s.href} title="검수하러 가기" className="transition-opacity hover:opacity-80">
                <StepChip state={s.state} />
              </Link>
            ) : (
              <StepChip state={s.state} />
            )}
```

교체 후:

```tsx
          <span className="flex items-center gap-2.5">
            {s.state === "runnable" ? (
              (runSlot ?? (
                <a
                  href={onRunHref ?? "#"}
                  className="flex items-center gap-1.5 rounded-md bg-app-primary px-3 py-[7px] text-xs font-semibold text-white"
                >
                  <Play className="size-3.5" />
                  실행
                </a>
              ))
            ) : s.state === "fail" && s.rerunSlot ? (
              s.rerunSlot
            ) : s.href ? (
              <Link href={s.href} title="검수하러 가기" className="transition-opacity hover:opacity-80">
                <StepChip state={s.state} />
              </Link>
            ) : (
              <StepChip state={s.state} />
            )}
```

그리고 텍스트 블록(`<span className="flex flex-col gap-0.5">…</span>`) **닫힌 직후, 바깥 `</span>` 직전**에 추가:

```tsx
            {s.state !== "fail" && s.rerunSlot}
```

- [ ] **Step 2: 린트 확인**

Run: `npx eslint src/components/case/pipeline-stepper.tsx`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/components/case/pipeline-stepper.tsx
git commit -m "feat(web): PipelineStepper에 rerunSlot 슬롯 — fail은 칩 대체, 그 외 라벨 뒤"
```

---

### Task 4: page.tsx 배선 + fail 캡션 분기 + 빌드 검증

**Files:**
- Modify: `apps/web/src/app/(app)/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: `rerunKind` (`@/lib/pipeline`, Task 1), `RerunButton` (`./run-panel`, Task 2), `Step.rerunSlot` (Task 3)
- Produces: 최종 사용자 동작 — 스펙의 UI 동작 표 전체

- [ ] **Step 1: import 추가**

```ts
import { STAGES } from "@/lib/pipeline";
```
를 다음으로 교체:
```ts
import { STAGES, rerunKind } from "@/lib/pipeline";
```

```ts
import { RunPanel, StartRunButton } from "./run-panel";
```
를 다음으로 교체:
```ts
import { RunPanel, StartRunButton, RerunButton } from "./run-panel";
```

- [ ] **Step 2: steps 매핑에 rerunSlot·캡션 분기 적용**

기존(102-113행):

```tsx
  const steps: Step[] = STAGES.map((s, i) => {
    const state = detail.stepStates[s];
    // 검수 대기(action인데 진행 중 run 없음) 또는 verify 실패 → 해당 단계 탭으로 이동 가능
    const needsReview = state === "action" && !detail.activeRun;
    const linkable = needsReview || (s === "verify" && state === "fail");
    return {
      label: `${STEP_MARK[i]} ${STAGE_LABELS[i]}`,
      caption: needsReview ? "검수 대기 · 클릭해 검수" : STEP_CAPTION[state],
      state,
      href: linkable ? `/cases/${id}?tab=${encodeURIComponent(STAGE_TAB[s])}` : undefined,
    };
  });
```

교체 후:

```tsx
  const steps: Step[] = STAGES.map((s, i) => {
    const state = detail.stepStates[s];
    // 검수 대기(action인데 진행 중 run 없음) 또는 verify 실패 → 해당 단계 탭으로 이동 가능
    const needsReview = state === "action" && !detail.activeRun;
    const linkable = needsReview || (s === "verify" && state === "fail");
    const rerun = rerunKind(state, detail.startable[s]);
    // fail 캡션: 인용검증 FAIL은 제출 금지 유지, 실행 실패는 재시도 유도
    const isVerifyFail = s === "verify" && state === "fail" && detail.verifyHasFail;
    const failCaption = isVerifyFail ? "검증 실패 · 제출 금지" : rerun ? "실행 실패 · 재시도 가능" : "실행 실패";
    return {
      label: `${STEP_MARK[i]} ${STAGE_LABELS[i]}`,
      caption: needsReview ? "검수 대기 · 클릭해 검수" : state === "fail" ? failCaption : STEP_CAPTION[state],
      state,
      href: linkable ? `/cases/${id}?tab=${encodeURIComponent(STAGE_TAB[s])}` : undefined,
      rerunSlot: rerun ? <RerunButton caseId={id} stage={s} stageName={STAGE_LABELS[i]} kind={rerun} /> : undefined,
    };
  });
```

참고: `STEP_CAPTION.fail`("실패 / 제출 금지")은 더 이상 fail 경로에서 사용되지 않지만 `Record<StepState, string>` 타입 충족을 위해 유지한다.

- [ ] **Step 3: 전체 테스트·빌드 검증**

Run: `npm run test && npm run build`
Expected: vitest 전부 PASS, `next build` 성공(타입·린트 포함). 기존 경고(run-panel.tsx `caseId` unused)만 허용.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/cases/[id]/page.tsx"
git commit -m "feat(web): 파이프라인 단계 재실행 — 실패 시 다시 시도, 완료 단계 재실행 아이콘"
```

- [ ] **Step 5: 수동 확인 (dev 서버)**

Run: `npm run dev` 후 브라우저에서:
1. 실패한 단계가 있는 사건 → 스텝퍼에 빨간 [↻ 다시 시도] 버튼, 클릭 시 즉시 실행 시작·우측 콘솔 표시.
2. 승인된 단계(✓ 칩) 옆 작은 ↻ 아이콘 → 클릭 시 confirm 문구 확인 → 확인 시 실행.
3. 실행 중에는 모든 재실행 버튼 미노출.
