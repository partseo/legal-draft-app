### Task 6: `render_서면.py` — `[행위시 확인]` 마킹 + 렌더 스모크 (설계 결정 ②)

**Files:**
- Modify: `templates/render_서면.py:20,34,62-63`

**Interfaces:**
- Consumes: Task 3의 "부기 = 핀 블록 일부"(서면에 부기가 실제로 등장하게 됨).
- Produces: `[행위시 확인: …]` 빨간색 마킹.

- [ ] **Step 1: MARK_RE·색상 분기·독스트링 수정**

`templates/render_서면.py` 세 곳:

```python
# 독스트링 (기존 "- [출처: …] → 빨간색 …" 줄을 교체)
    - [출처: …], [행위시 확인: …] → 빨간색 (핀 블록 — 최종 제출본에서 변호사가 제거)

# MARK_RE (기존 정규식 교체)
MARK_RE = re.compile(r"(\[변호사 확인 필요[^\]]*\]|\[출처:[^\]]*\]|\[행위시 확인[^\]]*\])")

# _colorize_paragraph 분기 (기존 elif 뒤에 추가)
            elif part.startswith("[출처:"):
                new_run.font.color.rgb = RED
            elif part.startswith("[행위시 확인"):
                new_run.font.color.rgb = RED
```

- [ ] **Step 2: 정규식 단위 확인**

Run:
```bash
python -c "import re; MARK_RE=re.compile(r'(\[변호사 확인 필요[^\]]*\]|\[출처:[^\]]*\]|\[행위시 확인[^\]]*\])'); s='본문 [출처: X | MST:1] [행위시 확인: 기준일 2025-11-30 시행 버전과 조문 동일] [변호사 확인 필요 — 이율] 끝'; print(MARK_RE.findall(s))"
```
Expected: 3개 토큰 모두 매칭(리스트 길이 3).

- [ ] **Step 3: 렌더 스모크 (골든 context — 읽기만, 출력은 스크래치)**

```bash
python "templates/render_서면.py" "templates/소장_템플릿_docxtpl.docx" "cases/2026_김민재 해고 무효/산출물/context_소장.json" "$SCRATCHPAD/스모크_소장.docx"
```
Expected: exit 0, 출력 파일 생성(착색 단락 수 출력 정상). `$SCRATCHPAD`는 세션 스크래치 디렉토리.

- [ ] **Step 4: 커밋**

```bash
git add templates/render_서면.py
git commit -m "feat(render): [행위시 확인] 부기 빨간색 마킹 추가 (P1 결정②)"
```

---

