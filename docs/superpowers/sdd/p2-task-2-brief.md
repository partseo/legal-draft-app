### Task 2: 결정 ② — 당사자 지위 절 사각지대 (데이터+탐지, 4파일)

**Files:**
- Modify: `.claude/skills/case-intake/SKILL.md:21-22` (절차 4 사실관계)
- Modify: `.claude/skills/draft-complaint/SKILL.md` (작성 절차 2 + 자체 점검 2항)
- Modify: `.claude/skills/draft-brief/SKILL.md:50-51` (자체 점검 2항)
- Modify: `.claude/skills/verify-citations/SKILL.md:90` (4절 사실 주장 검사)
- Modify: `.codex/skills/*` (스크립트 재생성)

**Interfaces:**
- Consumes: 없음
- Produces: 사실 주장 대응 소스 = "사건컨텍스트.사실관계(근거 포함) 또는 당사자 필드" — draft 자체 점검과 verify 판정이 같은 소스 정의를 공유한다(비결정성 제거). Task 5 판정 기준 ②·③-2가 이를 전제.

- [ ] **Step 1: case-intake — 배경사실 등재 규칙**

`.claude/skills/case-intake/SKILL.md` Edit:

old_string:
```
   - `사실관계`: 입력에 명시된 사실만, 시간순. 각 항목에 `근거` 필수
     (예: "상담메모.md §2" 또는 "갑2"). 일자는 `YYYY.MM.DD.`, 불명확하면 `YYYY.MM.경`.
```

new_string:
```
   - `사실관계`: 입력에 명시된 사실만, 시간순. 각 항목에 `근거` 필수
     (예: "상담메모.md §2" 또는 "갑2"). 일자는 `YYYY.MM.DD.`, 불명확하면 `YYYY.MM.경`.
     당사자의 지위·배경으로 서면에 진술될 사실(업종·규모·직위·근속 등)도
     입력에 명시된 것에 한해 근거와 함께 등재한다 — 입력 근거가 없으면
     등재하지 않고 `확인필요`로. 이런 배경사실의 일자는 그 사실이 법적
     의미를 갖는 기준 시점(예: 해고 무렵 상시근로자수 → "2025.11.경") 또는
     입력 자료 기준 시점의 `YYYY.MM.경`으로 기재한다.
```

- [ ] **Step 2: draft-complaint — 당사자의 지위 절 출처 규칙**

`.claude/skills/draft-complaint/SKILL.md` Edit:

old_string:
```
   - 1. 당사자의 지위 → 2. 사실관계(사건컨텍스트.사실관계 시간순, 각 사실 끝에
     호증 표시 "(갑n)") → 3.~ 쟁점별 법적 주장 → 마지막-1. 결론.
```

new_string:
```
   - 1. 당사자의 지위 → 2. 사실관계(사건컨텍스트.사실관계 시간순, 각 사실 끝에
     호증 표시 "(갑n)") → 3.~ 쟁점별 법적 주장 → 마지막-1. 결론.
   - "당사자의 지위" 절의 각 사실 진술은 당사자 필드(성명·명칭·대표자 등
     신원 정보) 또는 사실관계(근거 포함)에서만 가져온다. 어느 쪽에도 없는
     배경사실은 쓰지 않는다(필요하면 `확인필요` 적재).
```

- [ ] **Step 3: draft-complaint — 자체 점검 2항 개정**

`.claude/skills/draft-complaint/SKILL.md` Edit:

old_string:
```
2. **사실 근거 점검**: 사실 주장 전수 — 각각 사건컨텍스트.사실관계(근거
   포함)에 대응하는가.
```

new_string:
```
2. **사실 근거 점검**: 사실 주장 전수(당사자의 지위 절 포함) — 각각
   사건컨텍스트.사실관계(근거 포함) 또는 당사자 필드에 대응하는가.
```

- [ ] **Step 4: draft-brief — 자체 점검 2항 대칭 동기화**

`.claude/skills/draft-brief/SKILL.md` Edit:

old_string:
```
2. **사실 근거 점검**: 사실 주장 전수 — 각각 사건컨텍스트.사실관계(근거
   포함)에 대응하는가.
```

new_string:
```
2. **사실 근거 점검**: 사실 주장 전수(당사자 배경 진술 포함) — 각각
   사건컨텍스트.사실관계(근거 포함) 또는 당사자 필드에 대응하는가.
```

- [ ] **Step 5: verify-citations — 사실 주장 검사 대응 소스·전수 범위**

`.claude/skills/verify-citations/SKILL.md` Edit:

old_string:
```
>    - 서면의 사실 주장 중 사건컨텍스트.사실관계(근거 포함)에 대응하지 않는 것 → ❌
```

new_string:
```
>    - 서면의 사실 주장 중(당사자의 지위 절 포함 전수) 사건컨텍스트.
>      사실관계(근거 포함) 또는 당사자 필드(성명·명칭·대표자 등 신원
>      정보)에 대응하지 않는 것 → ❌
```

- [ ] **Step 6: 적용 확인**

Run: `grep -c "당사자 필드" ".claude/skills/case-intake/SKILL.md" ".claude/skills/draft-complaint/SKILL.md" ".claude/skills/draft-brief/SKILL.md" ".claude/skills/verify-citations/SKILL.md"`
Expected: case-intake는 0이어도 됨(등재 규칙만), draft-complaint ≥ 2, draft-brief ≥ 1, verify-citations ≥ 1.
(정확 확인: `grep -c "당사자의 지위 절 포함" ".claude/skills/draft-complaint/SKILL.md"` → `1`, `grep -c "당사자 배경 진술 포함" ".claude/skills/draft-brief/SKILL.md"` → `1`, `grep -c "당사자의 지위 절 포함 전수" ".claude/skills/verify-citations/SKILL.md"` → `1`, `grep -c "배경으로 서면에 진술될 사실" ".claude/skills/case-intake/SKILL.md"` → `1`)

- [ ] **Step 7: 미러 재생성 + 검사**

Run: `python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/case-intake/SKILL.md .claude/skills/draft-complaint/SKILL.md .claude/skills/draft-brief/SKILL.md .claude/skills/verify-citations/SKILL.md .codex/skills
git commit -m "feat(skills): 당사자 지위 절 사실대사 — intake 배경사실 등재 + draft/verify 대응 소스 명시 (P2 결정 ②)"
```

---

