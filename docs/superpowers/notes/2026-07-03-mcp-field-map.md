# korean-law-mcp 응답 필드 매핑 (스모크 테스트 확정)

- 확정일: 2026-07-03
- 패키지: korean-law-mcp v4.4.4 (CLI `korean-law`, 97개 도구)
- 검증 방법: `korean-law <도구> --옵션` CLI 실호출(키 `LAW_OC` 유효 확인)
- 이 문서가 Task 2~7의 **핀 필드명 정본**이다.

## 핵심 도구 → 안정 ID / 필드

| 용도 | 도구 | 필수 파라미터 | 응답 안정 ID | 상태·부가 필드 |
|---|---|---|---|---|
| 법령 검색 | `search_law` | `--query` | **MST**(버전별), 법령ID | `[현행]`/`[연혁]`, 공포일, 시행일, 구분 |
| 조문 조회 | `get_law_text` | `--mst`, (`--jo`) | MST + jo(조번호) | 시행일, 조회기준일, 조문 본문 |
| 항·호·목 조회 | `get_article_detail` | `--mst`, `--jo`, (`--hang`/`--ho`/`--mok`) | MST + jo/hang/ho/mok | 세부 단위 본문 |
| 행위시법(§7) | `applicable_law` | `--lawName`, `--date`, (`--jo`) | 기준일 시행 **MST** | 시점 본문 + 현행 비교 + 부칙 경과조치 |
| 조문 개정이력 | `get_article_history` | `--mst`/`--lawName`, `--jo` | — | 개정 연혁 |
| 판례 검색 | `search_precedents` | `--query` | **판례ID**(예 222729) | 사건번호, 법원, 선고일, 판결유형 |
| 판례 전문 | `get_precedent_text` | `--id`, (`--full true`) | 판례ID | 판결문 전문 |
| 생사확인(§5) | `cite_check` | `--caseNumber`, (`--deepScan`) | 사건번호 | 후속 인용 역추적 + 변경·폐기 판정 |
| 통합 판례/결정 | `search_decisions` | `--domain`, `--query` | 도메인별 ID | 18개 도메인 |

## 도메인 확장 도구 (쟁점별 적응 — 플랜 §5)

- 노동위: `search_nlrc_decisions` / `get_nlrc_decision_text` (해고·부당노동행위)
- 조세심판: `search_tax_tribunal_decisions` / `get_tax_tribunal_decision_text`
- 헌재: `search_constitutional_decisions` / `get_constitutional_decision_text`
- 행정심판: `search_admin_appeals` / `get_admin_appeal_text`
- 공정위/개인정보위/권익위/소청심사: `search_*_decisions` / `get_*_decision_text`
- 자치법규 비교: `chain_ordinance_compare`, 통합검색 `search_all`
- 국세청 해석: `search_decisions --domain nts`

## 확정 핀 형식 (실측 값 기준)

법령 현행:

    [출처: 근로기준법 제27조 | MST:265959 | 시행 2025-10-23 [현행] | 조회 2026-07-03]

법령 행위시(연혁):

    [출처: 근로기준법 제27조 | MST:{연혁MST} | 시행 YYYY-MM-DD [연혁] | 기준일 YYYY-MM-DD | 조회 2026-07-03]

판례:

    [출처: 대법원 2022. 1. 14. 선고 2021두50642 판결 | 판례ID:222729 | 조회 2026-07-03]
    [cite_check: 2026-07-03 조회 — 역인용 추적상 변경·폐기 미발견]

## 실측 샘플 (재현용)

- `search_law --query "근로기준법"` → 근로기준법 [현행] 법령ID 001872 / MST 265959 / 시행 20251023
- `get_law_text --mst 265959 --jo "제27조"` → 제27조(해고사유 등의 서면통지) 본문 3개 항 정상 반환
- `search_precedents --query "해고 서면통지"` → [222729] 2021두50642 대법원 2022.01.14 판결

## 보안 주의 (규칙 반영 필요)

- 판례/법령 응답의 `링크` 필드에 API 키가 노출된다: `...?OC=***&...`.
  → 출처 핀에는 **ID(MST/판례ID)만** 기재하고, 원시 링크 문자열은 리서치·서면·검증보고
  어떤 커밋 파일에도 넣지 않는다. (인용규칙에 명시)

## 잠정명 → 실제명 정정

- 스펙/플랜의 판례 안정 ID "판례일련번호" → 실제 `판례ID`(get_precedent_text `--id`).
- 법령 안정 ID "MST" → 확정(버전별 식별자, 현행/연혁 구분).
