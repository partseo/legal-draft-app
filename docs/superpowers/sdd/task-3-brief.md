### Task 3: `[행위시 확인]` 부기 = 핀 블록의 일부 (설계 결정 ②)

**Files:**
- Modify: `rules/인용규칙.md` (§7)
- Modify: `.claude/skills/draft-complaint/SKILL.md`
- Modify: `.claude/skills/draft-brief/SKILL.md`
- Modify: `.claude/skills/verify-citations/SKILL.md`
- Regenerate: `.codex/skills/{draft-complaint,draft-brief,verify-citations}/SKILL.md`

**Interfaces:**
- Produces: "부기 = 핀 블록 일부" 규칙(§7). draft 복사 규칙·verify ⚠️ 판정·Task 5 자체 점검 1항이 이를 참조한다.

- [ ] **Step 1: 인용규칙 §7 — 부기의 지위 명문화**

§7의 연혁 핀 표기 블록(`[출처: 근로기준법 제27조 | MST:{연혁MST} | …]`) **아래**에 추가:

```markdown
- **부기의 지위**: `[행위시 확인: …]` 부기는 출처 핀 블록의 일부다.
  리서치의 핀을 서면에 인용할 때 부기도 함께 복사한다(이관 누락 시
  /verify-citations가 ⚠️ 처리). `[cite_check: …]` 라인은 종전대로 리서치
  파일 전용이며 서면에 넣지 않는다(§2).
```

- [ ] **Step 2: draft-complaint — 핀 블록 통째 복사 규칙**

`- 법적 주장 절은 \`리서치/쟁점별_법리.md\`의 발췌·출처 핀을 그대로 인용해 구성.` 항목의 굵은 문장(`**리서치에 없는 조문·판례가 필요해지면 …**`) **아래**에 추가:

```markdown
     핀 블록은 통째로 복사한다 — 출처 핀에 `[행위시 확인: …]` 부기가 붙어
     있으면 부기까지 함께 옮긴다(인용규칙 §7). `[cite_check: …]` 라인은
     리서치 전용이므로 서면에 넣지 않는다.
```

- [ ] **Step 3: draft-brief — 동일 규칙**

`2.~ 쟁점별 절: … 법리(리서치 발췌·출처 핀 인용). 상대방 증거에 대한 의견도 해당 절에 기재.` 줄 **아래**에 추가:

```markdown
   핀 블록은 통째로 복사한다 — `[행위시 확인: …]` 부기 포함(인용규칙 §7),
   `[cite_check: …]` 라인은 서면 제외.
```

- [ ] **Step 4: verify-citations (c-2) — 부기 이관 누락 ⚠️**

(c-2) 블록의 마지막 항목(`재실행 결과 기준일 시행 버전의 조문이 핀의 조문 내용과 다르면 → ⚠️ (적용 버전 검토).`) **아래**에 추가:

```markdown
>        - 리서치의 대응 핀에 `[행위시 확인: …]` 부기가 있는데 서면 핀에는
>          없으면 → ⚠️ (부기 이관 누락 — 인용규칙 §7).
```

- [ ] **Step 5: 미러 재생성 + 커밋**

```bash
python scripts/sync_codex_mirror.py && python scripts/sync_codex_mirror.py --check
git add "rules/인용규칙.md" .claude/skills/draft-complaint/SKILL.md .claude/skills/draft-brief/SKILL.md .claude/skills/verify-citations/SKILL.md .codex/skills/draft-complaint/SKILL.md .codex/skills/draft-brief/SKILL.md .codex/skills/verify-citations/SKILL.md
git commit -m "feat(rules/skills): [행위시 확인] 부기를 핀 블록의 일부로 명문화 (P1 결정②)"
```

---

