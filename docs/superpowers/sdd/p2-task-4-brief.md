### Task 4: 결정 ④+⑤ — verify 3분법 헤더 한정 + 요건사실 §0 참조 병기

**Files:**
- Modify: `.claude/skills/verify-citations/SKILL.md:91-92` (4절 3분법 헤더)
- Modify: `rules/요건사실.md:22-24` (§0)
- Modify: `.codex/skills/*` (스크립트 재생성)

**Interfaces:**
- Consumes: 없음
- Produces: 3분법 판정 논리 불변(문구만 한정) — Task 5 준비서면 verify 재실행의 판정 불변 확인 대상.

- [ ] **Step 1: verify 3분법 헤더 교체**

`.claude/skills/verify-citations/SKILL.md` Edit:

old_string:
```
>    - **부존재·부작위 단정 3분법**(근거 유무 + 어투 기준 — 확인필요 태그
>      병기 여부로 판정하지 않는다):
```

new_string:
```
>    - **부존재·부작위 단정 3분법**(판정 축은 근거 유무 + 어투 — 태그
>      병기는 ③의 단정 어투를 정상으로 만들지 못한다):
```

- [ ] **Step 2: 요건사실 §0 참조 병기**

`rules/요건사실.md` Edit:

old_string:
```
**금전청구가 하나라도 포함된 사건**은 쟁점 여부와 무관하게 지연이자 법령
세트를 리서치 스코프에 포함한다(누락 시 청구취지의 이자 문구가 부정확해져
의뢰인에게 불리하다 — 클린룸 실측 C1):
```

new_string:
```
**금전청구가 하나라도 포함된 사건**은 쟁점 여부와 무관하게 지연이자 법령
세트를 리서치 스코프에 포함한다(누락 시 청구취지의 이자 문구가 부정확해져
의뢰인에게 불리하다 — 클린룸 실측 C1,
`docs/superpowers/specs/2026-07-03-P1-품질개선-design.md` §1):
```

- [ ] **Step 3: 적용 확인**

Run: `grep -c "단정 어투를 정상으로 만들지 못한다" ".claude/skills/verify-citations/SKILL.md"` → `1`
Run: `grep -c "P1-품질개선-design.md" "rules/요건사실.md"` → `1`

- [ ] **Step 4: 미러 재생성 + 검사**

Run: `python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/verify-citations/SKILL.md rules/요건사실.md .codex/skills
git commit -m "docs(rules): verify 3분법 헤더 한정 + 요건사실 §0 C1 참조에 설계문서 경로 병기 (P2 결정 ④⑤)"
```

---

