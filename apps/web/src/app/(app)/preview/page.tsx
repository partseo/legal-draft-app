"use client";

/**
 * 디자인 검수용 프리뷰 — front-design.pen의 상태 변형(실행중/체크포인트/검수대기/제출금지/서면탭/시니어조언)을
 * 가상 데이터로 렌더링한다. P2에서 runs 데이터가 연결되면 실제 사건 상세가 이 상태들을 갖는다.
 */
import { useState } from "react";
import { CaseHeader } from "@/components/case/case-header";
import { PipelineStepper, type Step } from "@/components/case/pipeline-stepper";
import { CaseTabBar } from "@/components/case/case-tabs";
import { ContextView } from "@/components/case/context-view";
import { VerifyView } from "@/components/case/verify-view";
import { DraftView } from "@/components/case/draft-view";
import { GateBar } from "@/components/case/gate-bar";
import { RunningConsole, CheckpointConsole } from "@/components/case/console-drawer";
import { SeniorAdviceModal } from "@/components/case/senior-advice-modal";
import {
  FIXTURE_CONTEXT,
  FIXTURE_TIMELINE,
  FIXTURE_ISSUES,
  FIXTURE_VERIFY,
  FIXTURE_DRAFT_SECTIONS,
  FIXTURE_VERSIONS,
  FIXTURE_ADVICE,
} from "@/lib/fixtures/design-preview";

const STATES = ["실행중", "체크포인트", "검수대기", "제출금지", "서면탭"] as const;
type PreviewState = (typeof STATES)[number];

const STEPS: Record<PreviewState, { status: string; steps: Step[] }> = {
  실행중: {
    status: "실행중",
    steps: [
      { label: "사건구성", caption: "완료", state: "done" },
      { label: "리서치", caption: "실행 중 — 3분 경과", state: "running" },
      { label: "소장 작성", caption: "잠김", state: "locked" },
      { label: "인용검증", caption: "잠김", state: "locked" },
    ],
  },
  체크포인트: {
    status: "응답 필요",
    steps: [
      { label: "사건구성", caption: "응답 대기", state: "action" },
      { label: "리서치", caption: "잠김", state: "locked" },
      { label: "소장 작성", caption: "잠김", state: "locked" },
      { label: "인용검증", caption: "잠김", state: "locked" },
    ],
  },
  검수대기: {
    status: "검수 대기",
    steps: [
      { label: "사건구성", caption: "완료", state: "done" },
      { label: "리서치", caption: "승인 대기", state: "runnable" },
      { label: "소장 작성", caption: "잠김", state: "locked" },
      { label: "인용검증", caption: "잠김", state: "locked" },
    ],
  },
  제출금지: {
    status: "제출 금지",
    steps: [
      { label: "사건구성", caption: "완료", state: "done" },
      { label: "리서치", caption: "완료", state: "done" },
      { label: "소장 작성", caption: "완료", state: "done" },
      { label: "인용검증", caption: "FAIL 2건", state: "fail" },
    ],
  },
  서면탭: {
    status: "검수 대기",
    steps: [
      { label: "1. 사건구성", caption: "완료", state: "done" },
      { label: "2. 리서치", caption: "완료", state: "done" },
      { label: "3. 소장 작성", caption: "완료", state: "done" },
      { label: "4. 인용검증", caption: "실행 대기", state: "runnable" },
    ],
  },
};

export default function PreviewPage() {
  const [state, setState] = useState<PreviewState>("실행중");
  const [showAdvice, setShowAdvice] = useState(false);
  const cfg = STEPS[state];

  return (
    <div className="flex min-h-screen">
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-9">
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white p-3 text-xs text-neutral-500">
          디자인 검수용 프리뷰 (가상 데이터) — 상태:
          {STATES.map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={`rounded px-2 py-1 ${state === s ? "bg-app-tint font-semibold text-app-primary" : ""}`}
            >
              {s}
            </button>
          ))}
          <button onClick={() => setShowAdvice(true)} className="rounded px-2 py-1 underline">
            시니어 조언 모달
          </button>
        </div>

        <CaseHeader title="김민재 — 해고 무효 확인" status={cfg.status} assigneeName="이변호사" />
        <PipelineStepper round="라운드 1 — 소장" steps={cfg.steps} />
        <CaseTabBar
          active={state === "제출금지" ? "검증보고" : state === "서면탭" ? "서면" : state === "검수대기" ? "사건컨텍스트" : "개요"}
          baseHref="/preview"
        />

        {state === "검수대기" && (
          <>
            <GateBar message="사건구성 산출물 검수 — 승인하면 리서치를 진행할 수 있습니다" />
            <ContextView data={FIXTURE_CONTEXT} />
          </>
        )}
        {state === "제출금지" && <VerifyView rows={FIXTURE_VERIFY} />}
        {state === "서면탭" && (
          <>
            <GateBar message="소장 초안 검수 — 승인하면 다음 단계로 진행합니다" />
            <DraftView docTitle="소       장" sections={FIXTURE_DRAFT_SECTIONS} versions={FIXTURE_VERSIONS} />
          </>
        )}
        {(state === "실행중" || state === "체크포인트") && (
          <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5">
            <span className="text-[15px] font-semibold text-neutral-950">사건 개요</span>
            <div className="grid grid-cols-2 gap-x-6">
              {[
                ["사건번호", "2026가합10482"],
                ["사건유형", "해고 무효 확인의 소"],
                ["관할", "서울중앙지방법원"],
                ["접수일", "2026-06-14"],
                ["의뢰인", "김민재"],
                ["상대방", "(주)대한물류"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 border-b border-neutral-100 py-3">
                  <span className="text-xs font-medium text-neutral-500">{k}</span>
                  <span className="text-sm font-medium text-neutral-950">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {state === "실행중" && (
          <div className="flex items-center gap-3 rounded-lg bg-app-tint p-4 text-[13px] font-medium text-app-primary">
            현재 리서치 단계가 백그라운드에서 실행 중입니다. 우측 콘솔에서 진행 상황을 확인하세요.
          </div>
        )}
        {state === "체크포인트" && (
          <div className="flex items-center gap-3 rounded-lg bg-st-action-bg p-4 text-[13px] font-medium text-st-action">
            쟁점 승인 요청이 도착했습니다. 우측 패널에서 검토 후 승인하면 다음 단계가 진행됩니다.
          </div>
        )}
      </div>

      {state === "실행중" && (
        <RunningConsole title="리서치 실행 중" items={FIXTURE_TIMELINE} footer="korean-law-mcp로 원문 대조 중" />
      )}
      {state === "체크포인트" && <CheckpointConsole issues={FIXTURE_ISSUES} />}
      {showAdvice && <SeniorAdviceModal advice={FIXTURE_ADVICE} onClose={() => setShowAdvice(false)} />}
    </div>
  );
}
