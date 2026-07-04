# Task 1 Report: draft-complaint 지연이자 청구취지 확정수준 (P2 결정 ①)

## Changes Applied

**File:** `.claude/skills/draft-complaint/SKILL.md` (lines 26-36)

### Old Text (Removed)
```
   - 이행: "피고는 원고에게 …을 지급하라." 금전청구는 지연이자 문구 포함.
     이율이 `확인필요`에 있으면 "연 ○○%" + " [변호사 확인 필요 — 적용 이율]".
```

### New Text (Added)
```
   - 이행: "피고는 원고에게 …을 지급하라." 금전청구는 지연이자 문구 포함.
   - **지연이자 확정수준**: 기산일·이율 중 ⓐ 리서치에 원문 발췌된 조문으로
     뒷받침되고(적용 대상·요건이 조문 문언상 명확한 경우에 한한다) ⓑ 기산
     기준일이 사건컨텍스트.사실관계에서 도출되는 것은 **금액 미확정과
     무관하게 청구취지에 명시**한다(핀 병기). 예: 임금·퇴직금 → 근로기준법
     제37조·같은 법 시행령 제17조에 따라 "지급사유 발생일부터 14일이 되는
     날의 다음 날부터 다 갚는 날까지 연 20%". ⓐ·ⓑ 미충족 부분(금액, 원문
     미반환 대통령령 이율, 적용 대상이 문언상 불명확한 항목 등)만
     "연 ○○%" + " [변호사 확인 필요 — 적용 이율]"로 남긴다. 확정 반영한
     이율에 대응하는 `확인필요` 항목은 삭제하지 않고 미확정 잔여(적용 범위
     등)로 좁혀 갱신한다.
```

## Verification Results

### Step 2: Grep Verification
```bash
$ grep -c "지연이자 확정수준" ".claude/skills/draft-complaint/SKILL.md"
1

$ grep -c "이율이 \`확인필요\`에 있으면" ".claude/skills/draft-complaint/SKILL.md"
0
```
✓ New rule text present (count=1)
✓ Old rule text removed (count=0)

### Step 3: Mirror Regeneration
```
[sync_codex_mirror] regenerated .codex\skills from .claude\skills
✓ Regeneration successful
✓ Check passed (exit 0)
```

## Commit Information

**SHA:** `6d7b455`
**Message:** `feat(skills): 지연이자 청구취지 확정수준 규칙 — 조문 확정 기산·이율은 금액 미확정과 무관하게 명시 (P2 결정 ①)`
**Files Changed:** 2 (`.claude/skills/draft-complaint/SKILL.md`, `.codex/skills/*`)
**Insertions:** 20
**Deletions:** 2

## Self-Review Findings

✓ Old sentence completely replaced (not merely appended)
✓ New text matches brief specification character-for-character
✓ Korean characters, emphasis markers (**), and symbols (ⓐ, ⓑ, —) all intact
✓ Indentation and structure maintained per Markdown convention
✓ No unintended modifications to adjacent lines
✓ Codex mirror correctly regenerated and verified

## Conclusion

Task completed successfully. The new "지연이자 확정수준" rule replaces the legacy simplified rule, establishing a three-tier framework:
1. **ⓐ Statutory Support:** Research excerpt of applicable provision required
2. **ⓑ Factual Grounding:** Start date derivable from context facts
3. **Result:** Confirmed rate/start date stated in complaint regardless of damage amount

Legacy placeholder "(연 ○○% + [변호사 확인 필요 — 적용 이율])" retained only for unsupported elements.
