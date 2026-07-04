### Task 3: 결정 ③+⑥ — legal-research 판례 검색전략 + 소촉법 이율 한계 메모

**Files:**
- Modify: `.claude/skills/legal-research/SKILL.md:34-38` (절차 4) 및 `## 철칙` 직전
- Modify: `.codex/skills/*` (스크립트 재생성)

**Interfaces:**
- Consumes: 없음
- Produces: 판례 미발견 시 키워드 변형 재검색 규칙 + MST:208701 재탐색 불필요 메모 — Task 5 회귀에서 legal-research 재실행이 이 규칙을 따른다.

- [ ] **Step 1: 절차 4에 키워드 변형 재검색 추가**

`.claude/skills/legal-research/SKILL.md` Edit:

old_string:
```
4. **판례 탐색.** `search_decisions`(`domain='precedent'`)로 쟁점 키워드
   검색(인용규칙 §6), `get_decision_text`(`domain='precedent'`)로 판시사항·
   판결요지를 직접 읽어 쟁점 적합성을 판단한다. 민사 외 사건종류(일반행정 등)는
   `search_decisions`(다른 `domain` 값)로 추가 검색한다. 키워드만 겹치는
   판례는 버린다. 대법원 판례 우선.
```

new_string:
```
4. **판례 탐색.** `search_decisions`(`domain='precedent'`)로 쟁점 키워드
   검색(인용규칙 §6), `get_decision_text`(`domain='precedent'`)로 판시사항·
   판결요지를 직접 읽어 쟁점 적합성을 판단한다. 민사 외 사건종류(일반행정 등)는
   `search_decisions`(다른 `domain` 값)로 추가 검색한다. 키워드만 겹치는
   판례는 버린다. 대법원 판례 우선.
   쟁점 키워드로 미발견 시 **키워드 변형·동의어로 재검색**한다 — 법률용어↔
   실무용어, 상위·하위 개념(예: 관리감독자 적용제외 → "관리·감독 업무",
   "감시·단속적 근로", "적용제외"). 2~3회 변형 후에도 미발견이면
   "판례 미발견 — 조문·해석론으로 구성"으로 정직하게 기록한다(철칙 절).
```

- [ ] **Step 2: `## 철칙` 직전에 알려진 MCP 한계 절 삽입**

`.claude/skills/legal-research/SKILL.md` Edit:

old_string:
```
## 철칙
```

new_string:
```
## 알려진 MCP 한계

- 「소송촉진 등에 관한 특례법 제3조제1항 본문의 법정이율에 관한 규정」
  (대통령령, MST:208701)은 `get_law_text` 계열 전 경로(`mst`/`lawId`/`jo`/
  `efYd`/`get_article_detail`/`get_batch_articles`)에서 본문 미반환(실측
  2026-07-04). 이율 수치를 원문 발췌할 수 없으므로 `[변호사 확인 필요]`로
  처리하고 반복 재탐색하지 않는다.

## 철칙
```

- [ ] **Step 3: 적용 확인**

Run: `grep -c "키워드 변형·동의어로 재검색" ".claude/skills/legal-research/SKILL.md"` → `1`
Run: `grep -c "MST:208701" ".claude/skills/legal-research/SKILL.md"` → `1`

- [ ] **Step 4: 미러 재생성 + 검사**

Run: `python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/legal-research/SKILL.md .codex/skills
git commit -m "feat(skills): 판례 키워드 변형 재검색 + 소촉법 이율 대통령령 본문 미반환 한계 메모 (P2 결정 ③⑥)"
```

---

