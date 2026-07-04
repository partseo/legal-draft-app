### Task 1: 결정 ① — draft-complaint 지연이자 청구취지 확정수준

**Files:**
- Modify: `.claude/skills/draft-complaint/SKILL.md:26-27` (작성 절차 1 청구취지)
- Modify: `.codex/skills/*` (스크립트 재생성 — 직접 수정 금지)

**Interfaces:**
- Consumes: 없음 (독립 문서 개정)
- Produces: draft-complaint 청구취지 이율 규칙 — Task 5 회귀의 판정 기준 ③-1("청구취지에 확정 기산·이율 반영")이 이 문안을 전제한다.

- [ ] **Step 1: 이율 규칙 문장 대체**

`.claude/skills/draft-complaint/SKILL.md`에서 아래 old를 new로 Edit한다(기존 문장을 남기면 새 규칙과 모순되므로 반드시 대체).

old_string:
```
   - 이행: "피고는 원고에게 …을 지급하라." 금전청구는 지연이자 문구 포함.
     이율이 `확인필요`에 있으면 "연 ○○%" + " [변호사 확인 필요 — 적용 이율]".
```

new_string:
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

- [ ] **Step 2: 적용 확인**

Run: `grep -c "지연이자 확정수준" ".claude/skills/draft-complaint/SKILL.md"`
Expected: `1`

Run: `grep -c "이율이 \`확인필요\`에 있으면" ".claude/skills/draft-complaint/SKILL.md"`
Expected: `0` (구 문장 잔존 없음 — grep은 매치 없으면 exit 1, 정상)

- [ ] **Step 3: 미러 재생성 + 검사**

Run: `python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/draft-complaint/SKILL.md .codex/skills
git commit -m "feat(skills): 지연이자 청구취지 확정수준 규칙 — 조문 확정 기산·이율은 금액 미확정과 무관하게 명시 (P2 결정 ①)"
```

---

