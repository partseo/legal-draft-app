### Task 5: draft 렌더 전 자체 점검 (설계 결정 ④)

**Files:**
- Modify: `.claude/skills/draft-complaint/SKILL.md`
- Modify: `.claude/skills/draft-brief/SKILL.md`
- Regenerate: `.codex/skills/{draft-complaint,draft-brief}/SKILL.md`

**Interfaces:**
- Consumes: Task 3 핀 블록 복사 규칙, Task 4 3분법.
- Produces: "렌더 전 자체 점검" 절 + 대화창 보고 1줄 형식. Task 6(회귀)이 보고 1줄 출력을 확인한다.

- [ ] **Step 1: draft-complaint에 자체 점검 절 삽입**

`## 렌더` 제목 **앞**에 삽입:

```markdown
## 렌더 전 자체 점검 (필수 — check_projection 실행 직전)

1. **핀 점검**: context JSON의 조문·판례 언급 문장 전수 — 각 문장에 출처
   핀이 있고, 핀·발췌가 리서치의 해당 항목과 일치하는가(`[행위시 확인]`
   부기 포함 — 인용규칙 §7).
2. **사실 근거 점검**: 사실 주장 전수 — 각각 사건컨텍스트.사실관계(근거
   포함)에 대응하는가.
3. **부존재 단정 스캔**: 부존재·부작위 단정이 3분법 가드를 지키는가.

세 항목을 통과할 때까지 context JSON을 수정한 뒤 렌더로 진행한다. 결과는
대화창 보고에 1줄로 기재("자체 점검: 핀 n/n · 사실근거 n/n · 부존재단정
위반 0") — **파일로는 산출하지 않는다.** /verify-citations 독립성 불변:
검증자는 자체 점검 결과를 신뢰하지 않고 전수 재검한다.
```

- [ ] **Step 2: draft-brief에 동일 절 삽입**

`## 렌더` 제목 **앞**에 동일 문구 삽입(문구 동일 — 위 Step 1 블록 그대로).

- [ ] **Step 3: 미러 재생성 + 커밋**

```bash
python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check
git add .claude/skills/draft-complaint/SKILL.md .claude/skills/draft-brief/SKILL.md .codex/skills/draft-complaint/SKILL.md .codex/skills/draft-brief/SKILL.md
git commit -m "feat(draft): 렌더 전 자체 점검 3항 신설 (P1 결정④)"
```

---

