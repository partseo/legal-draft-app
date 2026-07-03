### Task 2: `legal-research` 스킬 — 스코프 고정 단계 + 커버리지 절 (설계 결정 ①)

**Files:**
- Modify: `.claude/skills/legal-research/SKILL.md`
- Regenerate: `.codex/skills/legal-research/SKILL.md` (스크립트 산출)

**Interfaces:**
- Consumes: Task 1의 요건사실.md §0·유형별 "필수 리서치".
- Produces: 리서치 산출물 말미의 "필수 리서치 커버리지" 절 형식. Task 6(회귀)이 이 형식의 생성 여부를 확인한다.

- [ ] **Step 1: 절차 1 뒤에 스코프 고정 단계 삽입**

절차 1(`쟁점이 비어 있으면 /case-intake 먼저 하라고 안내 후 중단.`) 바로 **아래**에 삽입:

```markdown
1-b. **스코프 고정(필수 리서치).** `사건컨텍스트.청구[]`의 유형을
   `rules/요건사실.md` §0(공통)·유형별 "필수 리서치" 항목과 대조해, 쟁점과
   별개로 조회할 필수 항목 목록을 만든다. 각 항목을 절차 2~6과 동일
   규칙(핀·현행성·생사확인·발췌)으로 리서치한다. 미발견은 정직하게 기록.
```

- [ ] **Step 2: 산출 형식에 커버리지 절 추가**

`말미 고정 문구(인용규칙 §4): …` 문단 **앞**에 삽입:

```markdown
말미 고정 문구 **앞**에 필수 리서치 커버리지 절을 기재한다:

    ### 필수 리서치 커버리지 (rules/요건사실.md §0·유형별 대조)

    | 항목 | 커버 | 위치 / 미커버 사유 |
    |---|---|---|
    | 지연이자 법령 세트 | ✅ | 쟁점 공통 절 |
    | 해고예고수당 병합 법리 | ✅ | 쟁점5 |

    (변호사 검수용 — /verify-citations 판정 대상 아님)
```

- [ ] **Step 3: 미러 재생성 + 확인**

```bash
python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check
```
Expected: exit 0.

- [ ] **Step 4: 커밋**

```bash
git add .claude/skills/legal-research/SKILL.md .codex/skills/legal-research/SKILL.md
git commit -m "feat(legal-research): 필수 리서치 스코프 고정 단계 + 커버리지 절 (P1 결정①)"
```

---

