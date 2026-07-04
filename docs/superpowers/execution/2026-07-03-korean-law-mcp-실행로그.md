# korean-law-mcp 전환 — 실행 로그

- 실행일: 2026-07-03
- 브랜치: `feat/korean-law-mcp`
- 설계: `docs/superpowers/specs/2026-07-03-korean-law-mcp-전환-design.md`
- 계획: `docs/superpowers/plans/2026-07-03-korean-law-mcp-전환.md`
- 도구 인터페이스 정본: `docs/superpowers/notes/2026-07-03-mcp-field-map.md`

브레인스토밍 → 설계 → 계획 → 서브에이전트 구동 실행(태스크별 구현+리뷰) →
골든 케이스 회귀 → 최종 whole-branch 리뷰 순으로 진행했다. 상세 커밋 메시지가
1차 기록이며, 이 문서는 그 위의 요약이다.

## 무엇을 바꿨나

법령·판례 출처를 로컬 git 저장소(legalize-kr/precedent-kr) 대조에서
**korean-law-mcp**(국가법령정보센터 Open API) 대조로 전환했다. 인용 단일
진입로·독립 검증 게이트·기계 검증 가능성(재현성) 원칙은 보존했다. git 해시의
불변성은 **스냅샷 동결 하이브리드**로 대체했다: 리서치가 MCP 원문을 파일에
얼려두고, 검증자는 안정 ID(MST/판례ID)로 MCP를 재조회해 대조한다.

## 태스크 순서와 결과

| # | 태스크 | 결과 |
|---|---|---|
| 1 | `.mcp.json` 등록 + 스모크로 필드명 확정 | ✅ |
| 2 | `rules/인용규칙.md` 개정(핀·§5·§6·§7) | ✅ (리뷰 통과) |
| 3 | `legal-research` 스킬 MCP화 + 동결 스냅샷 | ✅ |
| 4 | `verify-citations` MCP 재조회 + 경로버그·현행성 정정 | ✅ |
| 5 | draft-complaint/brief | ✅ no-op (소스 비의존 설계 확인) |
| 6 | 보조 규칙·템플릿 구형 핀 정리 | ✅ |
| 8 | CLAUDE/README/.gitignore 진입점 문서 | ✅ |
| R | **도구명 정합**(핵심 정정) | ✅ |
| 7 | 골든 케이스 회귀 재베이스라인 | ✅ PASS |
| 9 | Codex 미러 재생성 + AGENTS.md | ✅ |

## 핵심 발견: CLI(97-도구) ≠ MCP(9-도구) 인터페이스

재시작 후 실제 MCP 도구를 호출해 보니, 초기 스모크에 쓴 터미널 CLI는 granular
97-도구(`search_precedents`, `applicable_law`, `cite_check` 등 단독 도구)인 반면,
Claude Code/Codex에 노출되는 것은 통합 9-도구였다. 이에 따라 태스크 R에서
전 파일의 도구 참조를 실제 MCP 인터페이스로 정합했다:

- 판례: `search_decisions(domain='precedent')` / `get_decision_text(domain='precedent')`
- 행위시법: `legal_analysis(mode='applicable_law')`
- 생사확인: `legal_analysis(mode='cite_check')`

## 골든 케이스 회귀 (실전 MCP 테스트)

`cases/2026_김민재 해고 무효`를 MCP로 재실행(legal-research → draft → verify):
- MCP 도구 호출 오류 **0건**. `search_law`/`get_law_text`/`search_decisions`/
  `get_decision_text`/`legal_analysis(applicable_law·cite_check)` 전부 정상.
- `applicable_law`가 근로자퇴직급여보장법 제9조의 실제 행위시 연혁 차이를 포착 → §7 정상.
- **소장 PASS(❌0), 준비서면 PASS(❌0)** — 준비서면은 검증 게이트가 핀 누락 1건을
  잡아내 재작성 루프로 수정 후 PASS(게이트 정상 작동 증거).
- 구 git 미러의 민법 제379조 자구 차이 ⚠️는 MCP 원문에서 재현되지 않아 해소(데이터 품질 개선).
- 회귀 3기준(형식 정상 / PASS·FAIL 불변 / 사건컨텍스트 멱등) 충족.

## 보안 처리

- API 키(OC)는 `LAW_OC` 환경변수 + 저장소 루트 `.env`(gitignore)로 분리, 커밋 금지.
- MCP 응답 `링크` 필드에 OC가 노출되므로 출처 핀은 안정 ID만 쓰고 원시 링크는
  파일에 넣지 않는 규칙을 인용규칙 §3에 명시.
- 실행 중 필드맵 노트에 실 OC 값이 예시로 들어간 것을 발견해 마스킹 처리하고,
  머지 전 히스토리 스크럽으로 과거 커밋에서도 제거.

## 후속 (2026-07-03 리뷰 세션): P0·P1 반영

- 리뷰 세션이 실측 확정한 이슈에 따라 P0(검증 게이트 정확도: cite_check
  사건번호 가드·연혁 MST efYd 병행·재조회 실패 ⚠️ 분기·CLI 표기 통일)와
  P1(판단층 인코딩: 필수 리서치 체크리스트·부기=핀 일부·부존재 단정
  3분법·draft 자체 점검)을 반영했다.
- 설계: `docs/superpowers/specs/2026-07-03-P1-품질개선-design.md`,
  계획: `docs/superpowers/plans/2026-07-03-P1-품질개선.md`.
- 골든 사본 회귀(`cases/2026_김민재_해고무효_P1회귀`, 비추적): PASS 불변 +
  새 형식 3종 정상. 골든 본체는 다음 자연 재베이스라인 때 형식 반영.
- 클린룸2 풀 파이프라인 재검증(2026-07-04, `cases/2026_김민재_해고무효_클린룸2`,
  비추적): 원자료 2개만으로 intake→research→draft→verify→brief→verify
  (실행 opus / 검증 fable). 소장 1차 FAIL(❌1 당사자 지위 사실의 컨텍스트
  우회, ⚠️1 §24 증명책임 과다인용) → intake 보강·draft 수정 → PASS(❌0/⚠️0).
  준비서면 1차 PASS(❌0/⚠️0). 대조 분석: 종전 결함 C1~C6 전부 미재발,
  개선 목표 D1~D5 전부 달성. 잔여 후보: 지연이자 청구취지 확정수준 재량(中),
  draft 사전 사실대사 강화(中), 관리감독자 판례 리콜(低), 소촉법 이율
  대통령령 우회 조회(低).
