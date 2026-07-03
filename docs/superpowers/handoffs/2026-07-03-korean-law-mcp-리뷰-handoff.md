# Handoff — korean-law-mcp 전환 리뷰·검증·개선 도출

작성: 2026-07-03 · 대상: 새 세션(fresh agent)
프로젝트 루트: `C:\Users\byung\WorkOS\AI Work\.side-projects\litigation-writer`
이 문서 위치(저장소에 커밋됨): `docs/superpowers/handoffs/2026-07-03-korean-law-mcp-리뷰-handoff.md`

## 다음 세션의 목표 (사용자 지시)

1. **이번 개편(git 저장소 → korean-law-mcp 전환) 리뷰.**
2. **현재 에이전트(스킬 파이프라인) 동작 리뷰·검증.**
3. **`김민재 해고 무효` 결과물 비교(클린룸 vs 골든 케이스)를 기반으로 추가 개선 필요 지점 도출.**

산출 기대: 개편 평가 + 동작 검증 결과 + 우선순위화된 개선 목록(가능하면 근거·재현 포함).

## 먼저 읽을 것 (중복 금지 — 경로 참조)

이번 작업의 1차 기록은 아래 문서와 git 커밋이다. 요약을 새로 쓰지 말고 이것들을 읽어라.

- 설계: `docs/superpowers/specs/2026-07-03-korean-law-mcp-전환-design.md`
- 계획: `docs/superpowers/plans/2026-07-03-korean-law-mcp-전환.md`
- **실행 로그(요약 정본)**: `docs/superpowers/execution/2026-07-03-korean-law-mcp-실행로그.md`
- **MCP 도구 인터페이스 정본**: `docs/superpowers/notes/2026-07-03-mcp-field-map.md`
- 프로젝트 SSOT: `CLAUDE.md`, 듀얼호스트 규칙: `AGENTS.md`, 인용 규칙: `rules/인용규칙.md`
- git 히스토리: 브랜치 `feat/korean-law-mcp`가 `master`에 fast-forward 머지됨. 전환 본체는 `6c898b8`까지(17커밋); 이후 이 핸드오프 등 문서 커밋이 master에 추가됨. 최신 상태는 `git log --oneline` 로 확인.

## 리포지토리 현재 상태

- `master` = 전환 완료본(전환 본체 `6c898b8`, 이후 문서 커밋 추가). **원격 미설정, push 안 됨.** GitHub(`byungjunjang/litigation-writer`, public)의 `main`은 아직 단일 "Initial public release" 커밋 상태 — 로컬 `master`와 히스토리 무관.
- 로컬 `legalize-kr/`·`precedent-kr/` 클론은 **삭제됨**(전환으로 불필요).
- MCP: `.mcp.json`에 `korean-law`(stdio, `command: korean-law-mcp`) 등록. Claude Code 세션에서 `mcp__korean-law__*` 9개 도구 사용 가능(재시작 후 로드됨).
- **API 키(LAW_OC): `.env`(gitignore)와 사용자 환경변수에만 존재. 값은 이 문서에 기재하지 않음(REDACTED).** 실 OC 값이 과거 커밋에 노출됐던 것은 `git filter-branch`로 전 히스토리에서 스크럽 완료(검증: `git log -S <oc> --all` = 0).

## 검증 대상 산출물 (김민재 해고 무효)

**골든 케이스(커밋됨)** — `cases/2026_김민재 해고 무효/`
- MCP 기준 재베이스라인 커밋 `581666c`. 사용자가 사건컨텍스트를 보강(사건번호·상대주장)한 상태에서 재실행. 소장 검증 PASS(❌0). 준비서면 산출물은 원설계대로 미추적(gitignore).

**클린룸(gitignore — 커밋 안 됨)** — `cases/2026_김민재_해고무효_클린룸/`
- 원자료 2개(`입력/사건기록_임금체불_부당해고.md`, `입력/상대방_답변서.md`)만으로 **처음부터** 풀 파이프라인 실행(case-intake→research→draft-complaint→verify→draft-brief→verify).
- 결과: 소장 PASS(❌0,⚠️1), 준비서면 FAIL→재작성→PASS(최종 ❌0,⚠️0).
- 검토 파일: `산출물/소장_초안.docx`, `산출물/준비서면_초안.docx`, `산출물/검증보고_{소장,준비서면}.md`, `리서치/쟁점별_법리.md`, `사건컨텍스트.json`.

**비교 관점(개선 도출용)**: 클린룸은 컨텍스트를 무에서 구성(쟁점 5개, 확인필요 10건)한 반면 골든은 사용자 보강본. 두 결과의 쟁점 구성·인용 선택·확인필요 처리·검증 판정을 대조하면 파이프라인의 재현성·변동성·약점을 판단할 수 있다.

## 이번에 실측으로 드러난 이슈 (개선 후보 — 검증부터)

1. **`cite_check` 짧은 사건번호 prefix 오매칭.** `legal_analysis(mode='cite_check', caseNumber='2020도68')`가 `2020도6874`(무관 판례)를 반환. 반환 판례의 사건번호가 질의와 실제 일치하는지 확인하는 가드가 없다. (클린룸 리서치에서 재현.)
2. **`get_law_text` 연혁 MST 단독 조회 실패.** 연혁 MST(예 근퇴법 279829) 단독 `get_law_text(mst=…, jo=…)`는 `NOT_FOUND`; `efYd`(시행일자) 병행 또는 `legal_analysis(mode='applicable_law')`로 우회됨. 스킬/규칙에 이 절차가 명시돼 있지 않아 검증자가 매번 우회를 재발견한다.
3. **draft 단계가 결함을 흘리고 verify가 잡는 구조.** 클린룸에서 draft-brief가 (a) 근거 없는 사실 주장 1건, 소장이 (b) 핀 누락/[행위시 확인] 부기 누락을 냈고 verify가 FAIL/⚠️로 적발 → 재작성 루프로 수정. 게이트는 정상 작동하나, draft 단계에 자체 사전점검(모든 조문 언급에 핀 / 모든 사실주장에 근거)을 넣으면 루프 비용을 줄일 수 있다.
4. **문서 이관 손실.** 리서치의 `[행위시 확인: …]` 부기가 draft 핀으로 이관될 때 누락(소장 ⚠️). draft 스킬의 핀 복사 규칙 강화 여지.
5. **(경미)** verify-citations SKILL.md가 MCP 도구 인자를 `--mst` 같은 CLI 플래그 표기로 적음(무해하나 실제 MCP는 JSON 파라미터). 표기 통일 여지.

## 열린 결정 (사용자 대기 중)

- **GitHub public 반영(push).** 사용자가 "잘 되면 master 머지 후 GitHub 반영" 의사. 현재 머지까지만 됨. 반영하려면 `git remote add origin …` → `git push --force origin master:main`(히스토리 무관, 강제 필요). 실행 전 명시 승인 필요.
- **OC 키 로테이션(선택).** 히스토리 스크럽은 완료됐으나, 이미 로컬에 찍혔던 값이라 `open.law.go.kr` 새 OC 재발급을 원하면 후속 처리.
- **클린룸 폴더 처리.** 평가용 임시 산출물(gitignore). 유지/삭제/골든 교체 여부 미정.

## 주의사항

- **골든 케이스 폴더 삭제·임의수정 금지**(회귀 픽스처). 클린룸은 별도 폴더로 골든을 건드리지 않음.
- `.claude/skills/`가 canonical, `.codex/skills/`는 생성 미러 — 스킬 수정 시 `python scripts/sync_codex_mirror.py`로 재생성(`--check` exit 0 확인). 미러 직접 수정 금지.
- 사건 폴더(`cases/*`)는 gitignore(의뢰인 자료 보호). 골든 케이스만 tracked.
- 파일명·내용 한국어, UTF-8. Windows 경로(공백·한글) 인용부호 주의.

## 제안 스킬 (다음 세션에서 호출)

- **`/code-review`** (또는 superpowers:requesting-code-review) — 개편 diff(`git diff <merge-base>..master`) 정합·품질 리뷰. merge-base는 `git merge-base` 대신 브랜치 시작점(플랜 커밋)을 쓸 것.
- **CLAUDE.md "회귀 점검" 프로토콜** — 골든 케이스로 영향단계 서브에이전트 재실행(① PASS/FAIL 불변 ② 컨텍스트 멱등 ③ 형식 정상). 에이전트 동작 검증에 사용.
- **`superpowers:brainstorming`** — 개선 지점을 설계로 구체화하기 전(창의/변경 작업 게이트).
- **`autoresearch` 또는 `skill-creator`** — 도출된 개선(예: draft 자체점검, cite_check 가드)을 스킬에 반영·벤치마크할 때.
- 프로젝트 스킬(`legal-research`, `verify-citations`, `draft-complaint`, `draft-brief`, `case-intake`) — 동작 재현·검증 시 직접 실행/서브에이전트.

## 메모리

`C:\Users\byung\.claude\projects\C--Users-byung-WorkOS-AI-Work--side-projects-litigation-writer\memory\` 에 프로젝트 메모리 시스템 있음(`MEMORY.md` 인덱스). 새 세션 시작 시 참조.
