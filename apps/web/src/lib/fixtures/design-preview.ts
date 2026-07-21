/**
 * front-design.pen의 샘플 카피 그대로 — /preview 화면 검수 전용 가상 데이터.
 * 실제 사건 데이터가 아니며 어떤 산출물에도 사용하지 않는다.
 */
import type { CaseContextData } from "@/components/case/context-view";
import type { VerifyRow } from "@/components/case/verify-view";
import type { TimelineItem, CheckpointIssue } from "@/components/case/console-drawer";
import type { DraftSection, DraftVersion } from "@/components/case/draft-view";

export const FIXTURE_CONTEXT: CaseContextData = {
  parties: [
    { role: "원고", name: "김민재", address: "서울 관악구 봉천로 123, 4층", contact: "010-1234-5678" },
    { role: "피고", name: "㈜OO물류", address: "서울 강남구 테헤란로 456 (확인 필요)", contact: "02-555-0100" },
  ],
  facts: [
    { date: "2026-03-02", content: "구두로 해고 통보", evidence: "상담메모 §2" },
    { date: "2026-03-05", content: "서면 통지 부재 확인", evidence: "상담메모 §5" },
    { date: "2026-01~02", content: "임금 2개월 미지급", evidence: "갑2" },
    { date: "2026-03-10", content: "해고예고수당 미지급", evidence: "갑3" },
  ],
  issues: [
    { id: "S1", title: "해고의 절차적 정당성", claim: "서면 통지 부재로 해고 절차 위법.", approved: true },
    { id: "S2", title: "해고의 실체적 정당성", claim: "정당한 해고 사유 부존재.", approved: true },
    { id: "S3", title: "미지급 임금", claim: "임금·해고예고수당 미지급 명백.", approved: true },
  ],
  claimSummary:
    "1. 피고의 원고에 대한 2026-03-02자 해고가 무효임을 확인한다.\n2. 피고는 원고에게 미지급 임금 및 해고예고수당을 지급하라.\n3. 소송비용은 피고가 부담한다.",
  needsReview: ["지연이자 이율", "피고 법인 등기부상 주소"],
};

export const FIXTURE_TIMELINE: TimelineItem[] = [
  { text: "사건컨텍스트 로드", state: "done" },
  { text: "쟁점 1: 해고의 정당성 — 판례 8건 조회", state: "done" },
  {
    text: "쟁점 2: 임금 지급 — 조문 대조 중…",
    state: "running",
    logs: [
      "[00:02:41] 근로기준법 제43조 원문 조회",
      "[00:02:47] 판례 대법원 2019다12345 대조 중",
      "[00:02:53] 임금 체불 산정 근거 3건 수집…",
    ],
  },
];

export const FIXTURE_ISSUES: CheckpointIssue[] = [
  { id: "S1", title: "해고의 절차적 정당성", claim: "서면 통지 없이 구두 해고 — 근기법 위반" },
  { id: "S2", title: "해고의 실체적 정당성", claim: "정당한 이유 없음" },
  { id: "S3", title: "미지급 임금", claim: "2개월분 체불" },
];

export const FIXTURE_VERIFY: VerifyRow[] = [
  { citation: "대법원 2019다12345", kind: "판례", pass: true, result: "PASS · 원문 일치", note: "-" },
  { citation: "근로기준법 제23조", kind: "조문", pass: true, result: "PASS · 원문 일치", note: "-" },
  { citation: "대법원 2018다55667", kind: "판례", pass: true, result: "PASS · 원문 일치", note: "-" },
  { citation: "근로기준법 제26조", kind: "조문", pass: true, result: "PASS · 원문 일치", note: "-" },
  { citation: "근로기준법 제27조", kind: "조문", pass: false, result: "FAIL · 조문 번호 불일치", note: "수정 필요" },
  { citation: "대법원 2020다67890", kind: "판례", pass: false, result: "FAIL · 판시사항 발췌 불일치", note: "수정 필요" },
];

export const FIXTURE_DRAFT_SECTIONS: DraftSection[] = [
  {
    title: "청  구  취  지",
    body: "1. 피고는 원고에게 금 4,500,000원 및 이에 대하여 이 사건 소장 부본 송달 다음날부터 다 갚는 날까지 연 12%의 비율로 계산한 돈을 지급하라.\n2. 소송비용은 피고가 부담한다.\n3. 위 제1항은 가집행할 수 있다.",
  },
  {
    title: "청  구  원  인",
    body: "1. 당사자의 지위\n원고는 2021. 3. 2. 피고 회사에 입사하여 영업관리 업무를 담당하던 근로자이고, 피고는 상시 근로자 80여 명을 고용하여 전자부품 제조업을 영위하는 회사입니다. 피고는 2025. 5. 30. 원고에게 구두로 해고를 통보하였는바, 이는 근로기준법 제27조의 서면통지 의무를 위반한 것으로 그 효력이 없습니다.",
  },
];

export const FIXTURE_VERSIONS: DraftVersion[] = [
  { label: "v3 · 방금", caption: "수정 지시 반영", current: true },
  { label: "v2 · 어제", caption: "검증 FAIL 수정" },
  { label: "v1 · 2일 전", caption: "최초 생성" },
];

export const FIXTURE_ADVICE = [
  "1. 소 제기 전 내용증명으로 임금 지급 최고를 남겨두면 지연손해금 기산점 입증이 깔끔해집니다.",
  "2. 해고의 서면통지 흠결(근기법 제27조)은 절차적 위법으로 강하게 주장하되, 실체적 부당해고 주장과 병렬로 구성하세요.",
  "3. 부당해고 구제신청(노동위)과 민사 병행 시 중복이득 조정 가능성을 미리 검토하세요.",
];
