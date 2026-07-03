### Task 4: 부존재 사실 단정 3분법 (설계 결정 ③)

**Files:**
- Modify: `CLAUDE.md` (안전수칙 1)
- Modify: `.claude/skills/verify-citations/SKILL.md` (4절)
- Modify: `.claude/skills/draft-complaint/SKILL.md`
- Modify: `.claude/skills/draft-brief/SKILL.md`
- Regenerate: `.codex/skills/*` 해당 3종

**Interfaces:**
- Produces: 3분법 기준 문구(verify 4절이 판정 정본). Task 5 자체 점검 3항이 참조.

- [ ] **Step 1: CLAUDE.md 안전수칙 1 보강**

```markdown
1. **사실 생성 금지** — 입력 자료에 없는 사실·수치·날짜를 만들지 않는다.
   모든 사실관계 항목에는 `근거`(입력 파일 출처/증거 표시)가 있어야 한다.
   부존재·부작위의 단정도 사실 생성이다 — 입력이 명시적으로 뒷받침하지
   않으면 단정하지 않고 완화 어투 + `확인필요`로 기재한다.
```
(기존 1항의 두 문장 뒤에 셋째 문장 추가.)

- [ ] **Step 2: verify-citations 4절에 3분법 판정 기준 추가**

`>    - 서면의 사실 주장 중 사건컨텍스트.사실관계(근거 포함)에 대응하지 않는 것 → ❌` 줄 **아래**에 추가:

```markdown
>    - **부존재·부작위 단정 3분법**(근거 유무 + 어투 기준 — 확인필요 태그
>      병기 여부로 판정하지 않는다):
>      ① 입력 자료가 명시적으로 뒷받침(의뢰인 진술 문장 포함)하는 부존재
>         단정 → 정상(근거 표기 필수).
>      ② 입력 근거 없음 + 완화 어투("…한 사실이 확인되지 않습니다") +
>         [변호사 확인 필요] → 정상(표준 작법).
>      ③ 입력 근거 없음 + 단정 어투("…한 사실이 전혀 없습니다") → ❌
>         (사실 생성 — 태그가 병기돼 있어도 ❌).
```

- [ ] **Step 3: draft-complaint·draft-brief에 작성 가드 추가**

draft-complaint "작성" 절 끝(3항 뒤)과 draft-brief "본문 구성" 절 끝(결론 항목 뒤)에 각각 동일 문구 추가:

```markdown
- **부존재·부작위 단정 가드**: 입력 자료가 명시적으로 확인해주지 않는
  부존재·부작위는 단정하지 않는다("…한 사실이 전혀 없습니다" 금지).
  완화 어투("…한 사실이 확인되지 않습니다")로 쓰고 `[변호사 확인 필요]`
  표기 + 사건컨텍스트 `확인필요`에 적재한다. 의뢰인이 입력에서 명시적으로
  진술한 부존재는 단정 가능(근거 표기 필수).
```

- [ ] **Step 4: 미러 재생성 + 커밋**

```bash
python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check
git add CLAUDE.md .claude/skills/verify-citations/SKILL.md .claude/skills/draft-complaint/SKILL.md .claude/skills/draft-brief/SKILL.md .codex/skills/verify-citations/SKILL.md .codex/skills/draft-complaint/SKILL.md .codex/skills/draft-brief/SKILL.md
git commit -m "feat(rules/skills): 부존재 사실 단정 3분법 — 근거+어투 기준 (P1 결정③)"
```

---

