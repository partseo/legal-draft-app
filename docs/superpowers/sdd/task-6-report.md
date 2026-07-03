# Task 6 실행 보고: render_서면.py — `[행위시 확인]` 빨간색 마킹 + 렌더 스모크

## Status: DONE

## 변경 내역

`templates/render_서면.py` 3곳 수정 (브리프 그대로 반영):

1. 독스트링(17-20행) — 검토 표시 후처리 목록에 `[행위시 확인: …] → 빨간색` 추가,
   `[출처: …]`와 병기해 "핀 블록"으로 통합 서술.
2. `MARK_RE`(34행) — `\[행위시 확인[^\]]*\]` 대안 추가.
3. `_colorize_paragraph`(62-65행) — `elif part.startswith("[행위시 확인")` 분기 추가,
   `RED` 적용.

diff:
```diff
-    - [출처: …]            → 빨간색 (출처 핀 — 최종 제출본에서 변호사가 제거)
+    - [출처: …], [행위시 확인: …] → 빨간색 (핀 블록 — 최종 제출본에서 변호사가 제거)

-MARK_RE = re.compile(r"(\[변호사 확인 필요[^\]]*\]|\[출처:[^\]]*\])")
+MARK_RE = re.compile(r"(\[변호사 확인 필요[^\]]*\]|\[출처:[^\]]*\]|\[행위시 확인[^\]]*\])")

             elif part.startswith("[출처:"):
                 new_run.font.color.rgb = RED
+            elif part.startswith("[행위시 확인"):
+                new_run.font.color.rgb = RED
```

## Step 2: 정규식 단위 확인

Windows git-bash 기본 python 실행은 cp949 인코딩으로 한글 소스 인자를 못 받아
`UnicodeEncodeError`가 발생했다 — `PYTHONUTF8=1 PYTHONIOENCODING=utf-8`을 붙여 재실행.

```
python -c "import re; MARK_RE=re.compile(r'(\[변호사 확인 필요[^\]]*\]|\[출처:[^\]]*\]|\[행위시 확인[^\]]*\])'); s='본문 [출처: X | MST:1] [행위시 확인: 기준일 2025-11-30 시행 버전과 조문 동일] [변호사 확인 필요 — 이율] 끝'; print(MARK_RE.findall(s))"
```
결과:
```
['[출처: X | MST:1]', '[행위시 확인: 기준일 2025-11-30 시행 버전과 조문 동일]', '[변호사 확인 필요 — 이율]']
```
3개 토큰 모두 매칭 — 기대값과 일치.

## Step 3: 렌더 스모크

환경 확인: `python -c "import docxtpl"` 정상 (Python 3.14, site-packages에 설치돼 있음) — pip install 불필요.

실행 (골든 컨텍스트는 읽기만, 출력은 스크래치패드):
```
python "templates/render_서면.py" "templates/소장_템플릿_docxtpl.docx" "cases/2026_김민재 해고 무효/산출물/context_소장.json" "<scratch>/스모크_소장.docx"
```
결과: `EXIT_CODE=0`, 출력:
```
렌더링 완료: <scratch>/스모크_소장.docx (검토 표시 착색 단락 35개)
```
출력 파일 생성 확인(16,923 bytes). `git status --porcelain` 확인 결과 `cases/` 아래 어떤 파일도 변경되지 않음 — 읽기 전용 준수.

## Self-review: 기존 동작 비파괴 확인

생성된 스모크 docx를 python-docx로 열어 색상별 run 개수·샘플 확인:
```
{'0000FF': 28, 'FF0000': 34}
샘플: 0000FF -> '[변호사 확인 필요]', FF0000 -> '[출처: 근로기준법 제37조 | MST:265959 | 시행 2025-1...'
```
- 파란색(변호사 확인 필요) 28개, 빨간색(출처) 34개 — 기존 마킹 로직 정상 동작(회귀 없음).
- 다만 골든 케이스 `context_소장.json`에는 `[행위시 확인` 문자열이 아직 없어(Task 3 산출물이
  이 케이스 리서치에 아직 반영되지 않음), 이번 스모크에서 신규 빨간색 분기가 실제 데이터로는
  트리거되지 않았다. 정규식·색상 분기 자체는 Step 2 유닛 테스트로 별도 검증 완료.

## 커밋

`0f4b6cc feat(render): [행위시 확인] 부기 빨간색 마킹 추가 (P1 결정②)` — `templates/render_서면.py` 1개 파일만 변경(4 insertions, 2 deletions).

## Concerns

- Windows git-bash 기본 python 호출은 한글 인자 포함 시 cp949 인코딩 오류가 남 —
  향후 이 스크립트를 커맨드라인에서 재현할 때는 `PYTHONUTF8=1`을 앞에 붙일 것
  (render_서면.py 자체는 UTF-8로 파일을 열므로 영향 없음; 문제는 `-c` 인자 전달 시에만 발생).
- 골든 케이스 데이터에 `[행위시 확인]` 실사례가 없어 end-to-end 시각 확인은
  유닛 테스트(Step 2)로 대체됨 — Task 3이 실제 리서치 파일에 부기를 넣는 후속 케이스가
  생기면 렌더 스모크로 다시 한번 실물 확인 권장.
