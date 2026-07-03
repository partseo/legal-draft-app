# korean-law-mcp 도구 인터페이스 · 응답 필드 매핑 (실측 확정)

- 확정일: 2026-07-03 (재시작 후 **실제 MCP 도구 호출**로 재검증)
- 패키지: korean-law-mcp v4.4.x
- 이 문서가 스킬·규칙의 **도구명·핀 필드명 정본**이다.

## ⚠️ 중요: MCP(9-도구) vs CLI(97-도구)는 다른 인터페이스다

Claude Code/Codex에 노출되는 것은 **통합 9-도구 MCP 인터페이스**다. 터미널 CLI
(`korean-law <tool>`)의 granular 97-도구(`search_precedents`, `applicable_law`,
`cite_check` 등 단독 도구)와 **이름·형태가 다르다.** 스킬·규칙은 반드시 아래
**MCP 도구**를 참조한다. (CLI는 사람 검증용일 뿐.)

노출 MCP 도구 9종: `search_law`, `get_law_text`, `search_decisions`,
`get_decision_text`, `legal_analysis`, `legal_research`, `get_annexes`,
`discover_tools`, `execute_tool`.

## 핵심 도구 → 용도 / 안정 ID (실측)

| 용도 | **MCP 도구 (정본)** | 필수 인자 | 응답 안정 ID / 필드 |
|---|---|---|---|
| 법령 검색 | `search_law` | `query` | **MST**(버전별), 법령ID, `[현행]`/`[연혁]`, 시행일 |
| 조문 조회 | `get_law_text` | `mst`(또는 `lawId`), `jo` 선택, `efYd` 선택 | 조문 본문, 시행일. **상태 라벨은 반환 안 함** → 현행성은 `search_law`로 현행 MST 대조 |
| 판례 검색 | `search_decisions` | `domain='precedent'`, `query` | **판례ID**(예 222729), 사건번호, 법원, 선고일 |
| 판례 전문 | `get_decision_text` | `domain='precedent'`, `id`, `full` 선택 | 판결문(판시·요지·주문은 항상 전문) |
| 행위시법(§7) | `legal_analysis` | `mode='applicable_law'`, `lawName`, `date`, `jo` 선택 | 기준일 시행 **MST** + 시점 조문 + 현행 비교 + 부칙 경과조치 |
| 생사확인(§5) | `legal_analysis` | `mode='cite_check'`, `caseNumber`, `deepScan` 선택 | 후속 인용 역추적 + 변경·폐기 판정 |
| 인용 환각검증 | `legal_analysis` | `mode='verify_citations'`, `text` | 텍스트 내 조문 인용 실존 교차검증 |
| 영향그래프 | `legal_analysis` | `mode='impact_map'`, `lawName`, `jo` | 조문 인용 역방향 그래프 |

## 도메인 확장 (쟁점별 적응 — 플랜 §5) — 전부 `search_decisions`/`get_decision_text`의 `domain` 값

`search_decisions(domain=X, query)` + `get_decision_text(domain=X, id)`. X 값(enum):
- `precedent`(판례), `interpretation`(법령해석례), `nts`(국세청 해석),
  `tax_tribunal`(조세심판), `constitutional`(헌재), `admin_appeal`(행정심판),
  `nlrc`(노동위 — 해고·부당노동행위), `ftc`(공정위), `pipc`(개인정보위),
  `acr`(권익위), `appeal_review`(소청심사), `customs`(관세), `treaty`(조약),
  `english_law`(영문법령), `school`·`public_corp`·`public_inst`.
- 자치법규 비교는 `discover_tools`/`execute_tool` 프록시 또는 `search_law` 계열 사용.

## 확정 핀 형식 (응답 필드 기준 — 값 실측)

법령 현행:

    [출처: 근로기준법 제27조 | MST:265959 | 시행 2025-10-23 [현행] | 조회 2026-07-03]

법령 행위시(연혁):

    [출처: 근로기준법 제27조 | MST:216361 | 시행 2020-03-31 [연혁] | 기준일 2020-05-01 | 조회 2026-07-03]

판례:

    [출처: 대법원 2022. 1. 14. 선고 2021두50642 판결 | 판례ID:222729 | 조회 2026-07-03]
    [cite_check: 2026-07-03 조회 — 역인용 추적상 변경·폐기 미감지]

## 실측 샘플 (재현용 — MCP 호출)

- `search_law(query="근로기준법")` → 근로기준법 [현행] 법령ID 001872 / MST 265959 / 시행 20251023
- `search_decisions(domain="precedent", query="해고 서면통지")` → [222729] 2021두50642 대법원 2022.01.14
- `legal_analysis(mode="applicable_law", lawName="근로기준법", date="2020-05-01", jo="제27조")`
  → 기준일 시행 MST 216361(시행 2020-03-31), 현행과 조문 동일, 부칙 경과조치 발췌
- `legal_analysis(mode="cite_check", caseNumber="2021두50642")` → ✅ 후속 인용 2건, 변경·폐기 미감지

## 보안 주의 (규칙 반영됨 — 인용규칙 §3)

- 판례/법령 응답의 `링크` 필드에 API 키(OC)가 노출된다: `...?OC=***&...` (실제 값 기재 금지).
  → 출처 핀에는 **안정 ID(MST/판례ID)만** 기재하고, 원시 링크 문자열은 리서치·서면·검증보고
  어떤 파일에도 넣지 않는다.

## 도구명 정정 이력 (CLI→MCP)

초기 필드맵은 CLI granular 도구명 기준이었음. 실제 MCP 인터페이스로 정정:
- 판례 검색·전문: ~~`search_precedents`/`get_precedent_text`~~ → `search_decisions`/`get_decision_text` (`domain='precedent'`)
- 행위시법: ~~단독 `applicable_law`~~ → `legal_analysis(mode='applicable_law')`
- 생사확인: ~~단독 `cite_check`~~ → `legal_analysis(mode='cite_check')`
- 도메인 전용(`search_nlrc_decisions` 등): → `search_decisions(domain='nlrc' 등)`
- 판례 안정 ID = **판례ID** (search_decisions/get_decision_text 반환), 법령 = **MST**.
