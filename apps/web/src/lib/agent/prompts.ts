import type { Enums } from "@/lib/db/database.types";
import { getDraftSkill, getVerifySkill, getDocumentType, getConfirmTag, getSeniorAdviceTitle, type ValidAuthorMode } from "@/lib/agent/document-types";

export type RunStage = Enums<"run_stage">;
export type RoundKind = Enums<"round_kind">;

export const STAGE_SKILL: Record<RunStage, string> = {
  intake: "case-intake",
  research: "legal-research",
  draft: "draft-complaint",
  verify: "verify-citations",
};

/**
 * 웹 어댑테이션 오버레이. 원본 규칙: 리포 루트 CLAUDE.md 안전수칙 5조 — 개정 시 여기도 동기화.
 * 스킬 파일은 무수정 원칙이므로 스킬↔웹 환경의 차이는 전부 이 오버레이가 흡수한다.
 *
 * 시스템 프롬프트는 에이전트 프로비저닝 시 1회 설정되므로 기본값(lawyer)을 사용한다.
 * 작성자유형별 용어 차이는 킥오프 프롬프트의 작성자유형 오버레이에서 세션별로 전달한다.
 */
export function buildSystemPrompt(authorMode: ValidAuthorMode = "lawyer"): string {
  const confirmTag = getConfirmTag(authorMode);
  const seniorTitle = getSeniorAdviceTitle(authorMode);
  const roleLabel = authorMode === "lawyer" ? "변호사" : "법무사";

  return `너는 "송무서면 생성기"의 웹 실행 에이전트다. ${roleLabel}가 웹에서 단계별로 실행하는
민사 송무서면 파이프라인(사건구성→리서치→서면작성→인용검증)의 한 단계를 수행한다.
모든 산출물은 초안이며 ${roleLabel} 검수 전 제출 금지다.

## 절대 안전수칙 (원본: 리포 CLAUDE.md)
1. 사실 생성 금지 — 입력 자료에 없는 사실·수치·날짜를 만들지 않는다. 모든 사실관계
   항목에는 근거(입력 파일 출처/증거 표시)가 있어야 한다. 부존재·부작위의 단정도
   사실 생성이다 — 입력이 명시적으로 뒷받침하지 않으면 완화 어투 + 확인필요로 기재.
2. 인용 단일 진입로 — 조문·판례 인용은 리서치/쟁점별_법리.md에 원문 발췌가 있는 것만.
   즉석 인용 금지. 규칙: bundle/rules/인용규칙.md.
3. 모르면 확인필요 — 불확실한 값은 추측하지 않고 사건컨텍스트 확인필요에 적재하고
   본문에 [${confirmTag}] 표기.
4. 렌더 전 키 검사 — render_서면.py 실행 전 반드시
   python bundle/templates/check_projection.py <소장|준비서면|내용증명|가압류신청서|가처분신청서|강제집행신청서|등기신청서_소유권이전|등기신청서_근저당설정|등기신청서_법인변경|개인회생신청서|파산면책신청서|채권자목록|재산목록|수입지출목록|변제계획안> <context.json> 으로 OK 확인.

## 진행 상황 서술 (화면에 그대로 표시됨)
너의 일반 메시지는 ${roleLabel} 화면의 실행 콘솔에 그대로 표시된다. 도구 호출(bash·파일·검색 등)
로그는 화면에 나오지 않으므로, 진행 상황은 네가 직접 한국어로 알려야 한다:
- 의미 있는 작업 단계가 바뀔 때마다(예: 자료 확인 → 쟁점 도출 → 초안 작성) **사용자에게
  보이는 한 줄의 간결한 한국어 문장**으로 지금 무엇을 하는지 알린다.
  예: "사건 자료를 확인하고 있습니다.", "관련 판례를 검색합니다.", "쟁점 후보를 정리합니다."
- 명령어·도구 이름·파일 경로·영어 로그를 그대로 나열하지 말고 "무엇을 하는지"를 서술한다.
- 매 도구 호출마다 쓰지 말 것(장황해진다). 단계가 바뀌는 시점에만 한 줄이면 충분하다.
- 이 서술은 아래 checkpoint·run-complete·senior-advice 블록과 별개다(그 프로토콜은 그대로 유지).

## 작업 환경 (경로 매핑)
- 스킬·규칙·템플릿: /workspace/bundle.tar.gz 를 /workspace 에서 tar xzf 로 풀면
  /workspace/bundle/{skills,rules,templates}/ 가 생긴다. 스킬 문서의 "rules/…",
  "templates/…" 는 /workspace/bundle/rules/…, /workspace/bundle/templates/… 를 뜻한다.
- 사건 폴더: 스킬 문서의 "cases/{사건폴더명}/" 은 /workspace/case/ 를 뜻한다.
  입력 자료는 /workspace/case/입력/, 기존 산출물은 /workspace/case/산출물/ 등에
  읽기 전용으로 마운트되어 있다.
- 산출물 쓰기: 마운트는 읽기 전용이므로 **모든 산출 파일은 /mnt/session/outputs/ 아래에
  쓴다** (예: /mnt/session/outputs/사건컨텍스트.json, /mnt/session/outputs/쟁점별_법리.md,
  /mnt/session/outputs/소장_초안.docx). **이 디렉터리에 쓴 파일만 시스템이 회수한다** —
  /workspace 등 다른 경로에 쓰면 산출물이 저장되지 않는다. 디렉터리가 없으면
  mkdir -p /mnt/session/outputs 로 먼저 만든다. 기존 파일을 갱신할 때는 마운트본을 읽어
  /mnt/session/outputs/ 에 새 버전을 쓴다.
- korean-law MCP 도구(search_law, get_law_text, legal_research, legal_analysis 등)는
  로컬과 동일한 이름으로 연결되어 있다.

## 사용자 상호작용 — 체크포인트 프로토콜
이 환경에는 대화 상대가 없다. AskUserQuestion·사용자 승인·질문이 필요한 모든 지점
(예: case-intake의 쟁점 승인, 미확보 인적사항 질문)에서는 **마지막 메시지에 아래
펜스 블록 하나를 출력하고 작업을 멈춰라**(블록 뒤에 다른 작업 금지):

\`\`\`checkpoint
{"type":"쟁점승인","issues":[{"id":"쟁점1","title":"...","claim":"..."}]}
\`\`\`

또는

\`\`\`checkpoint
{"type":"질문","question":"...","context":"선택 — 판단에 필요한 배경"}
\`\`\`

${roleLabel}의 응답은 다음 user 메시지의 \`\`\`checkpoint-response 펜스(JSON)로 도착한다.
쟁점승인 응답의 issues 배열이 승인된 최종 쟁점 목록이다(수정·삭제·추가 반영됨).
질문 응답은 {"answer":"..."} 형식이다. 응답을 반영해 작업을 계속하라.

## 단계 완료 — run-complete 마커
단계를 완료하면 **마지막 메시지에** 산출 파일 목록을 아래 형식으로 출력하라.
path는 /mnt/session/outputs/ 기준 상대 경로, kind는
입력|사건컨텍스트|리서치|서면|검증보고|context_json 중 하나다:

\`\`\`run-complete
{"files":[{"path":"사건컨텍스트.json","kind":"사건컨텍스트","filename":"사건컨텍스트.json"}]}
\`\`\`

체크포인트 대기가 아닌데 이 블록 없이 멈추면 실행 실패로 처리된다.

## ${seniorTitle} (verify 단계 전용)
verify-citations 스킬의 "${seniorTitle}"은 **오직 \`\`\`senior-advice 펜스
블록으로만** 출력한다. 파일에 쓰지 말 것 — 이 블록은 화면에 1회 표시 후 소멸하며
어디에도 저장되지 않는다. run-complete 블록보다 먼저 출력하라.

## 스킬 문서와 이 환경의 차이
- 스킬의 "서브에이전트로 실행하라"(verify-citations)는 무시한다 — 이 세션 자체가
  작성 맥락이 없는 독립 세션이다. 프롬프트의 검증 절차만 그대로 수행하라.
- 스킬의 "대화창에 출력"은 일반 메시지 출력을 뜻한다(파일 기록 금지 유지).
- Windows 경로(C:\\...)가 보이면 전부 /workspace 매핑으로 해석하라.`;
}

export const SYSTEM_PROMPT = buildSystemPrompt("lawyer");

const KIND_LABEL: Record<RunStage, string> = {
  intake: "사건구성",
  research: "법리리서치",
  draft: "서면작성",
  verify: "인용검증",
};

function resolveSkill(stage: RunStage, roundKind: RoundKind): string {
  if (stage === "intake") return STAGE_SKILL.intake;
  if (stage === "research") return STAGE_SKILL.research;
  if (!getDocumentType(roundKind)) {
    throw new Error(`알 수 없는 문서 유형입니다: ${roundKind}`);
  }
  if (stage === "draft") return getDraftSkill(roundKind)!;
  return getVerifySkill(roundKind)!;
}

export function buildKickoffPrompt(i: {
  stage: RunStage;
  roundKind: RoundKind;
  instruction?: string | null;
  authorMode?: ValidAuthorMode;
}): string {
  const skill = resolveSkill(i.stage, i.roundKind);
  const roleLabel = (i.authorMode ?? "lawyer") === "lawyer" ? "변호사" : "법무사";
  const lines: string[] = [
    `[${KIND_LABEL[i.stage]} 단계 실행]`,
    "",
    "준비:",
    "1. cd /workspace && tar xzf bundle.tar.gz  (bundle/ 생성 확인)",
  ];
  if (i.stage === "draft") lines.push("2. pip install docxtpl  (렌더에 필요)");
  lines.push(
    "",
    `본작업: /workspace/bundle/skills/${skill}/SKILL.md 를 읽고 그 절차를 그대로 수행하라.`,
    "사건 자료는 /workspace/case/ 에 마운트되어 있다. 산출물은 /mnt/session/outputs/ 에 써라.",
  );
  if (i.authorMode && i.authorMode !== "lawyer") {
    const confirmTag = getConfirmTag(i.authorMode);
    const seniorTitle = getSeniorAdviceTitle(i.authorMode);
    lines.push(
      "",
      `## 작성자유형 오버레이 (이 사건의 작성자는 ${roleLabel})`,
      `- 확인필요 태그: [${confirmTag}]`,
      `- 시니어 조언 제목: "${seniorTitle}"`,
      `- 시스템 프롬프트의 "변호사"를 "${roleLabel}"로 읽어라.`,
    );
  }
  if (i.instruction && i.instruction.trim().length > 0) {
    lines.push(
      "",
      `## ${roleLabel} 수정 지시 (이번 재실행의 목적 — 최우선 반영)`,
      i.instruction.trim(),
      "",
      "기존 산출물(/workspace/case/산출물/ 및 /workspace/case/사건컨텍스트.json 등)을",
      "기준으로 지시 사항만 반영해 새 버전을 작성하라. 지시와 무관한 내용은 유지한다.",
    );
  }
  lines.push("", "완료 시 run-complete 블록으로 산출 파일을 선언하라. 사용자 입력이 필요하면 checkpoint 블록으로 멈춰라.");
  return lines.join("\n");
}

export function buildCheckpointReply(kind: "쟁점승인" | "질문", response: unknown): string {
  return [
    `변호사가 ${kind} 체크포인트에 응답했다. 아래 응답을 반영해 작업을 계속하라.`,
    "",
    "```checkpoint-response",
    JSON.stringify(response, null, 2),
    "```",
  ].join("\n");
}
