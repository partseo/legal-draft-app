# 워드 양식 — 소장·준비서면 (docx 샘플 + docxtpl 템플릿)

`법원표준양식_소장.md` / `법원표준양식_준비서면.md`(같은 데이터 폴더, 출처 전수 표기)의 골격을
실제 워드 파일로 구현한 것. A4 · 법원 권장 여백(상 45mm / 좌우 20mm / 하 30mm) · 바탕체 12pt ·
1.5줄 간격, 푸터에 "실습용 가상 사건 [초안] — 대외 제출 금지" 워터마크 고정.

## 파일 구성

| 파일 | 설명 |
|---|---|
| `complaint_template_docxtpl.docx` | docxtpl(Jinja2) 템플릿 — `{{변수}}` + `{%p for %}` 루프 내장 |
| `brief_template_docxtpl.docx` | 〃 |
| `context_complaint_example.json` | 가상 동해물류 사건으로 채운 컨텍스트 예시 |
| `context_brief_example.json` | 〃 |
| `complaint_sample.docx` | 위 템플릿 + 예시 컨텍스트의 **렌더링 결과물** (완성 모습 확인용) |
| `brief_sample.docx` | 〃 |
| `render_document.py` | 렌더 스크립트 (`pip install docxtpl`) |
| `make_templates.js` | 템플릿 재생성기 (`npm i -g docx` 후 `NODE_PATH=$(npm root -g) node make_templates.js`) |

## 사용법

```bash
pip install docxtpl
python3 render_document.py complaint_template_docxtpl.docx context_complaint_example.json complaint_sample.docx
python3 render_document.py brief_template_docxtpl.docx context_brief_example.json brief_sample.docx
```

## 템플릿 변수 스키마 (요약)

- **소장**: `원고_성명/주민번호/주소/우편번호/전화/이메일`, `소송대리인`, `소송대리인_주소`,
  `피고_명칭/주소/우편번호/대표자`, `사건명`, `청구취지`(문자열 배열 — 번호 자동),
  `청구원인`(배열: `{번호, 제목, 문단[]}`), `입증방법`(배열: `{호증, 문서명}`),
  `첨부서류`(배열: `{명칭, 통수}`), `작성일`, `제출법원`
- **준비서면**: `사건번호`, `사건명`, `원고_성명`, `피고_명칭`, `제출자_표시`,
  `본문`(배열: `{번호, 제목, 문단[]}`), `입증방법`, `첨부서류`, `작성일`,
  `제출자_말미표시`, `제출법원_표시`

## 실습 연계 (AGENT-002 STEP 5-C)

에이전트가 legalize-kr에서 검증한 '관계 법령'·'법리' 섹션(`output/complaint_legal_analysis.md`)을
context JSON의 `청구원인`(소장) 또는 `본문`(준비서면) 배열에 채워 넣고 `render_document.py`를
실행하면, **마크다운 초안 → 법원 양식 워드 파일**까지 한 번에 이어진다.
"에이전트 산출물이 회사 양식의 실제 문서 파일로 떨어진다"는 하네스 효과를 체감하는 단계.

## 주의

- 모든 인명·주소·금액은 가상이다. 지연이자 이율 등 `[변호사 확인 필요]` 표기는 렌더링 후에도
  유지하여 변호사 최종 검수 단계에서 처리한다.
- Jinja 태그를 워드에서 직접 수정할 때는 태그가 중간에서 줄바꿈·서식 분할되지 않게 주의
  (분할되면 docxtpl 파싱 오류). 구조 변경은 `make_templates.js` 수정 → 재생성을 권장.
