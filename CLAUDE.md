# 송무서면 생성기

변호사 1인이 실제 민사사건의 소장·준비서면 초안 DOCX를 만드는 작업공간.
**모든 산출물은 초안이며, 변호사 검수 전 제출 금지.**

## 디렉토리 지도

- `사건/{연도_의뢰인_사건요지}/` — 사건 단위 작업 폴더 (입력/, 사건컨텍스트.json, 리서치/, 산출물/)
- `규칙/인용규칙.md` — 조문·판례 인용 표기 + 출처 핀 규칙 (모든 인용에 적용)
- `규칙/사건컨텍스트.schema.json` — canonical 사건컨텍스트 스키마
- `문서 양식/` — docxtpl 템플릿 2종, render_서면.py, check_projection.py
- `legalize-kr/kr/{법령명}/` — 법령 원본 (git log = 개정 이력)
- `precedent-kr/{사건종류}/{법원등급}/` — 판례 원본

## 워크플로우 (스킬 5종)

/case-intake → (검수) → /legal-research → (검수) → /draft-complaint → /verify-citations → 변호사 최종 검수
상대 답변서 도착 시 같은 사건 폴더에서 → /draft-brief → /verify-citations

각 단계 사이에 변호사가 산출 파일을 직접 검수·수정한 뒤 다음 단계로 진행한다.

## 절대 안전수칙 (모든 작업에 적용)

1. **사실 생성 금지** — 입력 자료에 없는 사실·수치·날짜를 만들지 않는다.
   모든 사실관계 항목에는 `근거`(입력 파일 출처/증거 표시)가 있어야 한다.
2. **인용 단일 진입로** — 조문·판례 인용은 `리서치/쟁점별_법리.md`에 원문 발췌가
   있는 것만 가능. 즉석 인용 금지. 규칙은 `규칙/인용규칙.md`.
3. **모르면 확인필요** — 불확실한 값(이율·관할·기간 등)은 추측하지 않고
   사건컨텍스트 `확인필요`에 적재하고 본문에 `[변호사 확인 필요]` 표기.
4. **검증 게이트** — /verify-citations에서 ❌가 하나라도 있으면 해당 서면은
   "제출 금지" 상태. 수정 후 재검증.
5. **렌더 전 키 검사** — render_서면.py 실행 전 반드시
   `python "문서 양식/check_projection.py" <소장|준비서면> <context.json>` 으로 OK 확인.

## 자주 쓰는 명령

- 렌더: `python "문서 양식/render_서면.py" <템플릿.docx> <context.json> <출력.docx>`
- 법령 현행성: `git -C legalize-kr log -1 --format=%ad --date=short -- "kr/{법령}/{파일}.md"`
- 템플릿 재생성(구조 변경 시): `문서 양식`에서 `$env:NODE_PATH = npm root -g; node make_templates.js`
