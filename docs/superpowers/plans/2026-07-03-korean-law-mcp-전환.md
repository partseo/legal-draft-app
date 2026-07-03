# korean-law-mcp 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 법령·판례 출처를 `legalize-kr`/`precedent-kr` git 저장소 대조에서 korean-law-mcp 도구 대조로 전환하되, 인용 단일 진입로·독립 검증·재현성 원칙을 보존한다.

**Architecture:** 리서치 단계가 MCP 원문 발췌를 리서치 파일에 **동결**하고 안정 ID(MST·판례일련번호)+조회일을 핀에 기록한다. 독립 검증 서브에이전트는 그 ID로 MCP를 **재조회**해 동결 발췌와 대조한다. `rules/인용규칙.md`가 모든 스킬의 단일 참조원이므로 최우선 개정한다.

**Tech Stack:** korean-law-mcp (로컬 stdio, Node 18+), 국가법령정보센터 Open API(`LAW_OC` 키), Markdown 스킬/규칙, Claude Code + Codex 듀얼호스트.

## Global Constraints

- 이 프로젝트는 **자동화 테스트 스위트가 없다.** 검증은 MCP 스모크 테스트·`grep` 잔재 점검·골든 케이스 서브에이전트 재실행으로 한다. (출처: CLAUDE.md "자동화 스크립트는 두지 않는다")
- **안전 원칙 불변:** 사실 생성 금지 / 근거 필수 / 인용 단일 진입로 / 독립 검증 게이트 / 기계 검증 가능성.
- **인용 단일 진입로:** 서면 인용은 `리서치/쟁점별_법리.md`에 원문 발췌가 있는 것만.
- **API 키는 커밋하지 않는다.** `LAW_OC`는 환경변수로만. `.mcp.json`은 `${LAW_OC}` 참조만 담는다.
- **`.claude/skills/`가 canonical, `.codex/skills/`는 생성 미러.** 미러 직접 수정 금지 — `python scripts/sync_codex_mirror.py`로 재생성.
- 골든 케이스: `cases/2026_김민재 해고 무효`.
- 작업 브랜치: `master` (현재 브랜치, 로컬 실작업 브랜치).
- 골든 케이스 `사건컨텍스트.json`에 **기존 미커밋 변경**이 있다 — 각 커밋에서 해당 파일을 휩쓸지 않도록 파일 단위로 `git add` 한다.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: MCP 연결 + 스모크 테스트 + 응답 스키마 확정 (게이트)

이 태스크가 이후 모든 핀·검증 로직이 쓸 **실제 ID 필드명**을 확정한다. API 키 없이는 이후 진행 불가 — 하드 게이트.

**Files:**
- Create: `.mcp.json`
- Create: `docs/superpowers/notes/2026-07-03-mcp-field-map.md` (스모크 결과·필드 매핑 기록)

**Interfaces:**
- Produces: 확정된 도구 파라미터·응답 필드명 매핑 (법령 안정 ID 필드, 판례 안정 ID 필드, 현행/연혁 상태 라벨 필드). 이후 Task 2~7이 이 매핑을 참조한다. 잠정명: 법령=`MST`+조번호, 판례=`판례일련번호`.

- [ ] **Step 1: korean-law-mcp 설치**

```bash
npm install -g korean-law-mcp
korean-law-mcp --version   # Node 18+ 필요
```
Expected: 버전 문자열 출력.

- [ ] **Step 2: 사용자 액션 — API 키 발급·환경변수 설정 안내**

`open.law.go.kr`에서 무료 키를 발급받아 `LAW_OC` 환경변수로 설정하도록 사용자에게 요청한다(세션에서 `! setx LAW_OC <키>` 또는 사용자가 직접). 키 미보유 시 이 태스크에서 중단하고 사용자에게 반환.

- [ ] **Step 3: `.mcp.json` 작성**

```json
{
  "mcpServers": {
    "korean-law": {
      "command": "korean-law-mcp",
      "args": [],
      "env": { "LAW_OC": "${LAW_OC}" }
    }
  }
}
```

- [ ] **Step 4: MCP 연결 확인**

Claude Code에서 korean-law MCP 도구가 로드되는지 확인한다(`search_law`, `get_law_text`, `search_decisions`, `get_decision_text`, `legal_analysis` 등 9종).
Expected: 도구 목록에 `mcp__korean-law__*` 노출.

- [ ] **Step 5: 스모크 테스트 — 각 핵심 도구 1회 호출**

실제 호출로 반환 구조를 확인한다(파라미터명·응답 필드명이 문서와 다를 수 있음):
- `search_law("근로기준법")` → 법령 안정 ID 필드명 확인 (`lawId`? `MST`?)
- `get_law_text(<위 ID>, 제27조)` → 원문 텍스트·`[현행]/[연혁]` 라벨 필드 확인
- `legal_analysis(mode: applicable_law, 근로기준법 제27조, 기준일 2020-05-01)` → 시점 버전·시행일자·MST 반환 확인
- `search_decisions("해고 서면통지")` + `get_decision_text(<ID>)` → 판례 안정 ID 필드명 확인 (`판례일련번호`?)
- `legal_analysis(mode: cite_check, 대법원 2010다XXXXX)` → 역인용 결과 구조 확인

- [ ] **Step 6: 필드 매핑 기록**

`docs/superpowers/notes/2026-07-03-mcp-field-map.md`에 확정 매핑을 표로 적는다:
| 용도 | 도구 | 파라미터 | 응답 안정 ID 필드 | 상태 라벨 필드 |
잠정명(MST/판례일련번호)과 실제명이 다르면 **실제명을 이후 태스크의 정본**으로 삼는다.

- [ ] **Step 7: 커밋**

```bash
git add .mcp.json docs/superpowers/notes/2026-07-03-mcp-field-map.md
git commit -m "feat: korean-law-mcp stdio 등록 + 응답 필드 매핑 확정"
```

---

### Task 2: `rules/인용규칙.md` 개정 (단일 참조원 — 최우선)

모든 스킬이 이 파일을 참조하므로 먼저 개정한다. Task 1의 확정 필드명을 사용한다.

**Files:**
- Modify: `rules/인용규칙.md`

**Interfaces:**
- Consumes: Task 1 필드 매핑 (안정 ID 필드명, 상태 라벨).
- Produces: 새 핀 문법(§1·§2), MCP 생사확인(§5), MCP 검색 규칙(§6), MCP 행위시법(§7). 이후 모든 스킬이 이 표기를 따른다.

- [ ] **Step 1: §1 법령 인용 — 핀 체계 교체**

출처 핀 예시를 파일경로에서 안정 ID로 교체:
```
[출처: 근로기준법 제27조 | MST:267581 | 시행 2021-11-19 [현행] | 조회 2026-07-03]
```
- "경로는 legalize-kr 저장소 루트 기준 실제 파일 경로" 문구 삭제.
- "현행확인 날짜는 `git -C legalize-kr log ...`" 문구를 "조회일은 MCP `get_law_text` 실행일. 상태 라벨은 MCP 반환 `[현행]/[연혁]`" 로 교체.
- 약칭 규칙(검색용, 본문은 정식명)은 유지.

- [ ] **Step 2: §2 판례 인용 — 핀 + 생사확인 라인 교체**

```
[출처: 대법원 2010. 3. 25. 선고 2009다12345 판결 | 판례일련번호:68012 | 조회 2026-07-03]
[cite_check: 2026-07-03 조회 — 역인용 추적상 변경·폐기 미발견]
```
- "경로는 precedent-kr 저장소 루트 기준 실제 파일 경로" → "판례일련번호는 MCP `get_decision_text` 반환 안정 ID".
- 생사확인 라인 라벨을 `[생사확인: … precedent-kr 수록 범위 …]` → `[cite_check: … 역인용 추적 …]` 로 교체.

- [ ] **Step 3: §3 절대 규칙 — 유지(내용 불변)**

원문 발췌 필수·핀 필수·DOCX까지 핀 유지·빨강/파랑 표시·법정값 확인 규칙은 그대로 둔다.

- [ ] **Step 4: §4 저장소 한계 고지 문구 교체**

```
> 본 리서치는 korean-law-mcp(국가법령정보센터) 조회 결과이며 조회일 기준임.
> 미공개·하급심 판례 등 조회 범위 밖은 별도 확인 필요.
```

- [ ] **Step 5: §5 생사확인 표준 절차 — cite_check로 교체**

```
## 5. 생사확인 표준 절차 (단일 출처 — 스킬은 이 절을 참조한다)

1. korean-law-mcp `legal_analysis`(mode: cite_check)에 대상 판례를 넣어
   역인용 추적 결과를 받는다.
2. 변경·폐기 선언(전원합의체 변경, 저촉 범위 폐기 등)이 있으면 리서치는
   후속 판례로 교체, 검증은 ❌. 단순 "등 참조" 원용은 변경이 아니다.
3. 결과를 §2의 생사확인 라인 형식으로 기재한다.

수행 주체별 차이:
- /legal-research: 변경·폐기 발견 시 후속 판례(현재 법리)로 교체.
  불명확하면 발췌 유지 + ⚠️ 병기.
- /verify-citations: 리서치의 생사확인 라인을 신뢰하지 말고 cite_check
  재실행(검증자 독립성).
```

- [ ] **Step 6: §6 저장소 검색 규칙 → MCP 검색 규칙으로 교체**

기존 git grep/내장 Grep 규칙을 삭제하고 MCP 검색 규칙으로 대체(번호 유지 → §7 참조 안정):
```
## 6. MCP 검색 규칙

- 법령: `search_law`로 정식 법령명·약칭 양쪽 검색 후 `get_law_text`로 원문 확인.
- 판례: `search_decisions`로 쟁점 키워드 검색, `get_decision_text`로 원문 확인.
  민사 외 사건종류(일반행정 등)도 쟁점에 따라 검색.
- 신규 도메인(행정규칙·자치법규·조약·해석례)은 쟁점 성격이 맞을 때만
  해당 검색을 추가한다(§도메인 판단은 legal-research 스킬).
- 결과가 많으면 대법원·현행 우선으로 좁힌다.
```

- [ ] **Step 7: §7 행위시법 조회 표준 절차 — applicable_law로 교체**

```
## 7. 행위시법 조회 표준 절차 (단일 출처 — 스킬은 이 절을 참조한다)

인용해야 하는 것은 기준일에 시행 중이던 조문이다.

기준일: 행위시점(계약 체결일·불법행위일·해고일 등)을 사건컨텍스트.사실관계에서
특정. 불명확하면 [변호사 확인 필요].

절차:
1. `legal_analysis`(mode: applicable_law)에 법령·조문·기준일을 넣어 기준일
   시행 버전과 경과규정을 받는다.
2. 반환된 버전의 MST·시행일자를 확인한다.
3. 현행(get_law_text 최신)과 대조:
   - 동일 → 현행 핀 + 부기 [행위시 확인: 기준일 YYYY-MM-DD 시행 버전과 조문 동일]
   - 차이 → 행위시 버전 발췌 + 연혁 핀. 경과규정(부칙 적용례)을 확인·발췌.
     적용 버전 최종 판단은 [변호사 확인 필요 — 적용 법령 버전].

연혁 핀 표기:
[출처: 근로기준법 제27조 | MST:{연혁MST} | 시행 YYYY-MM-DD [연혁] | 기준일 YYYY-MM-DD | 조회 YYYY-MM-DD]

- 검증 재현: applicable_law(법령, 기준일) 또는 get_law_text(연혁MST) 재실행으로
  같은 버전을 재현한다(기계 검증 가능성 유지).
```

- [ ] **Step 8: 잔재 점검**

Run: `grep -nE "legalize-kr|precedent-kr|git -C|git grep|git show|git log" rules/인용규칙.md`
Expected: 매칭 없음(0건). 있으면 해당 줄을 MCP 표현으로 마저 교체.

- [ ] **Step 9: 커밋**

```bash
git add rules/인용규칙.md
git commit -m "refactor(인용규칙): 출처 핀·생사확인·행위시법을 korean-law-mcp 기준으로 개정"
```

---

### Task 3: `legal-research` 스킬 개정

**Files:**
- Modify: `.claude/skills/legal-research/SKILL.md`

**Interfaces:**
- Consumes: `rules/인용규칙.md` §5·§6·§7 (Task 2), Task 1 필드 매핑.
- Produces: MCP 기반 리서치 절차 + 동결 스냅샷 산출 형식. `verify-citations`(Task 4)가 이 산출물을 대조한다.

- [ ] **Step 1: description 프론트매터 갱신**

`description`의 "legalize-kr 조문과 precedent-kr 판례를" → "korean-law-mcp로 조문·판례를".

- [ ] **Step 2: 절차 2 (조문 탐색) 교체**

`Grep(path: legalize-kr/kr)` + `Read` 를 MCP로 교체:
```
2. **조문 탐색.** `rules/법령약칭.md`로 약칭을 정식 법령명으로 확장한다.
   `search_law`로 후보 법령을 찾고 `get_law_text`로 조문 원문을 직접 확인한다.
   (검색 규칙: 인용규칙 §6)
```

- [ ] **Step 3: 절차 3 (현행성·행위시) 교체**

`git -C legalize-kr log` → MCP 라벨/applicable_law:
```
3. **현행성·행위시 확인.** `get_law_text` 반환 상태 라벨([현행]/[연혁])을
   핀에 기록한다. 행위시 조회 시점(수록본 시행일자 미래 / 기준일 이후 개정)에
   해당하면 인용규칙 §7(applicable_law)을 수행하고 결과를 기재한다.
```

- [ ] **Step 4: 절차 4 (판례 탐색) 교체**

```
4. **판례 탐색.** `search_decisions`로 쟁점 키워드 검색(인용규칙 §6),
   `get_decision_text`로 판시사항·판결요지를 직접 읽어 쟁점 적합성을 판단한다.
   키워드만 겹치는 판례는 버린다. 대법원 판례 우선.
```

- [ ] **Step 5: 절차 5 (생사확인) 교체**

```
5. **판례 생사 확인.** 선정 판례마다 인용규칙 §5(cite_check)를 수행하고
   결과를 생사확인 라인(형식: 인용규칙 §2)으로 기재한다. 변경·폐기 시 후속
   판례로 교체, 불명확하면 ⚠️ 병기.
```

- [ ] **Step 6: 도메인 적응 스윕 규칙 추가 (절차 4 뒤 또는 별도 절)**

```
4-b. **도메인 적응(쟁점 성격이 맞을 때만).**
   - 세무·조세 → 해석례(국세청)·조세심판례
   - 인허가·행정처분 → 행정규칙
   - 지방자치·조례 → 자치법규
   - 국제거래·외국 요소 → 조약
   해당 없으면 조회하지 않는다(토큰 절약). 조회분도 §2 핀·발췌 규칙 동일 적용.
```

- [ ] **Step 7: 산출 형식 — 핀 예시 + 동결 명시**

산출 예시 블록의 핀을 새 체계로 교체:
```
[출처: kr/근로기준법/법률.md | 현행확인 …]  →  [출처: 근로기준법 제27조 | MST:… | 시행 … [현행] | 조회 …]
[출처: 민사/대법원/…​.md]  →  [출처: 대법원 …선고 …판결 | 판례일련번호:… | 조회 …]
[생사확인: … precedent-kr …]  →  [cite_check: … 역인용 추적 …]
```
철칙 절 상단에 한 줄 추가: "**MCP 원문 발췌를 이 파일에 그대로 동결한다(스냅샷). 이후 검증자는 핀의 안정 ID로 재조회해 동결본과 대조한다.**"

- [ ] **Step 8: 말미 고정 문구 교체**

인용규칙 §4의 새 문구(korean-law-mcp 조회 결과 …)로 교체.

- [ ] **Step 9: 잔재 점검**

Run: `grep -nE "legalize-kr|precedent-kr|git -C|Grep\(path" ".claude/skills/legal-research/SKILL.md"`
Expected: 0건.

- [ ] **Step 10: 커밋**

```bash
git add .claude/skills/legal-research/SKILL.md
git commit -m "refactor(legal-research): MCP 조회·동결 스냅샷·도메인 적응 스윕으로 개정"
```

---

### Task 4: `verify-citations` 스킬 개정 (독립 검증 게이트)

**Files:**
- Modify: `.claude/skills/verify-citations/SKILL.md`

**Interfaces:**
- Consumes: `rules/인용규칙.md` §5·§7 (Task 2), Task 3 산출물 형식.
- Produces: MCP ID 재조회 기반 독립 검증 절차. 산출물 형식(판정표·PASS/FAIL)은 불변.

- [ ] **Step 1: 작업 디렉토리 경로 버그 정정**

서브에이전트 프롬프트의 `C:\Users\byung\Downloads\소장, 준비서면 작성 에이전트` → 실제 루트 `C:\Users\byung\WorkOS\AI Work\.side-projects\litigation-writer`.

- [ ] **Step 2: description 프론트매터 갱신**

"원본 저장소와 전수 대조" → "korean-law-mcp 재조회로 전수 대조".

- [ ] **Step 3: 법령 검증 절차(2-a~c-2) 교체**

git 기반 검증을 MCP 재조회로:
```
2. 각 법령 인용:
   (a) 핀의 안정 ID(MST)로 `get_law_text` 재조회 — 존재하는가.
   (b) 재조회 원문과 서면/리서치 동결 발췌를 문자 대조 — 의미·요건·효과 일치.
       조번호만 맞고 내용 다르면 ❌.
   (c) 재조회 상태 라벨([현행]/[연혁]) vs 핀 — 불일치·개정 정황이면 ⚠️.
   (c-2) 행위시 검증(인용규칙 §7): 연혁 핀이면 `applicable_law(법령, 기준일)`
       재실행 → 반환 MST·시행일자가 핀과 일치하는가. 기준일에 미시행 버전
       인용이면 ❌. 리서치의 [행위시 확인] 라인은 신뢰하지 말고 재수행.
```
- ❌ 수정 단서 규칙은 유지하되 근거를 MCP 재조회로: 조문 부존재 시 `get_law_text`로 실제 조 범위·인근 조문 제시, 파일 부존재 대신 "법령명 오인 시 `search_law`로 유사 법령 후보 제시".

- [ ] **Step 4: 판례 검증 절차(3-a~d) 교체**

```
3. 각 판례 인용:
   (a) 핀의 판례일련번호로 `get_decision_text` 재조회 — 존재하는가.
   (b) 재조회 본문의 법원명/선고일자/사건번호가 서면 표기와 정확히 일치하는가.
   (c) 판시 내용 재조회본과 서면 취지 일치하는가.
   (d) 생사확인 — 인용규칙 §5(cite_check)를 직접 재실행. 리서치 라인 불신.
       명시적 변경·폐기 → ❌. 정황 불명확 → ⚠️.
```
- 판례 부존재 ❌ 수정 단서: `search_decisions` 사건번호 역검색으로 후보 제시.

- [ ] **Step 5: 추가 검사(4) — 유지**

핀 없는 법률 주장 ❌ / 사실관계 미대응 ❌ / 증거 내용 단정은 `입력/` 원시자료 확인 규칙은 그대로 둔다.

- [ ] **Step 6: 산출 판정표(5·6) — 유지, 라벨만 확인**

판정표 열·PASS/FAIL·시니어 조언(대화창 전용) 불변. (c)현행성·(d)생사 열 의미가 MCP 기준으로 바뀌었는지 문구만 정합.

- [ ] **Step 7: 잔재 점검**

Run: `grep -nE "legalize-kr|precedent-kr|git -C|git show|git grep|Downloads" ".claude/skills/verify-citations/SKILL.md"`
Expected: 0건.

- [ ] **Step 8: 커밋**

```bash
git add .claude/skills/verify-citations/SKILL.md
git commit -m "refactor(verify-citations): MCP 재조회 기반 독립 검증으로 개정 + 경로 버그 정정"
```

---

### Task 5: `draft-complaint`/`draft-brief` 핀 예시 갱신

**Files:**
- Modify: `.claude/skills/draft-complaint/SKILL.md`
- Modify: `.claude/skills/draft-brief/SKILL.md`

**Interfaces:**
- Consumes: `rules/인용규칙.md` 새 핀 체계 (Task 2).
- Produces: 인용 단일 진입로 불변, 핀 예시만 새 체계.

- [ ] **Step 1: 두 스킬에서 핀 예시 문자열 교체**

파일경로형 핀(`kr/…​.md`, `민사/…​.md`)이 예시로 등장하면 새 ID형 핀으로 교체. 인용 단일 진입로("리서치에 있는 것만") 서술은 변경하지 않는다.

- [ ] **Step 2: 잔재 점검**

Run: `grep -nlE "legalize-kr|precedent-kr|kr/[가-힣]+/[가-힣]+\.md" ".claude/skills/draft-complaint/SKILL.md" ".claude/skills/draft-brief/SKILL.md"`
Expected: 0건.

- [ ] **Step 3: 커밋**

```bash
git add .claude/skills/draft-complaint/SKILL.md .claude/skills/draft-brief/SKILL.md
git commit -m "refactor(draft): 핀 예시를 MCP ID 체계로 갱신"
```

---

### Task 6: 보조 규칙 파일 정리

**Files:**
- Modify: `rules/법령약칭.md`
- Modify: `rules/요건사실.md`
- Modify: `rules/절차비용.md`

**Interfaces:**
- Consumes: Task 2 검색 규칙(§6).
- Produces: 저장소 전제 문구 제거. 약칭 목록·요건사실·절차비용 내용 자체는 유지.

- [ ] **Step 1: `법령약칭.md` — 검색 전제 교체**

"git grep / legalize-kr 검색" 전제 문구를 "`search_law` 검색어로 사용" 으로 조정. 약칭↔정식명 매핑 표는 그대로 유지.

- [ ] **Step 2: `요건사실.md`·`절차비용.md` — 저장소 참조 문구 정리**

`legalize-kr`/`precedent-kr` 언급을 "MCP 조회" 또는 인용규칙 참조로 교체. 실체 내용(요건·비용 산식)은 불변.

- [ ] **Step 3: 잔재 점검**

Run: `grep -rnE "legalize-kr|precedent-kr|git grep|git -C" rules/`
Expected: 0건.

- [ ] **Step 4: 커밋**

```bash
git add rules/법령약칭.md rules/요건사실.md rules/절차비용.md
git commit -m "refactor(rules): 보조 규칙의 저장소 전제를 MCP 기준으로 정리"
```

---

### Task 7: 골든 케이스 재베이스라인 + 회귀 점검

**Files:**
- Modify (재생성): `cases/2026_김민재 해고 무효/리서치/쟁점별_법리.md`, `산출물/검증보고_*.md` (스킬 재실행 산출)

**Interfaces:**
- Consumes: Task 2~6 (개정된 규칙·스킬), Task 1 (MCP 연결).
- Produces: MCP 기준 새 베이스라인. 회귀 기준 ① 형식 정상 ② PASS/FAIL 불변 ③ 사건컨텍스트 멱등.

- [ ] **Step 1: 변경 전 기준값 기록**

재실행 전에 현재 골든 케이스의 검증보고 PASS/FAIL과 사건컨텍스트 쟁점·사실관계 스냅샷을 메모한다(비교 기준).

- [ ] **Step 2: legal-research 서브에이전트 재실행**

새 컨텍스트 서브에이전트로 골든 케이스에 `/legal-research` 실행 → `리서치/쟁점별_법리.md`가 새 핀 체계·동결 스냅샷으로 재생성되는지 확인.
Expected: 산출 형식 정상(핀=MST/판례일련번호, cite_check 라인 존재).

- [ ] **Step 3: verify-citations 서브에이전트 재실행**

새 컨텍스트 서브에이전트로 소장·준비서면 각각 `/verify-citations` 실행.
Expected: 종합판정이 변경 전과 동일(PASS는 PASS 유지). ❌ 발생 시 원인이 (a) 스킬 개정 버그인지 (b) 실제 법 개정으로 인한 정당한 변화인지 구분해 기록.

- [ ] **Step 4: 회귀 판정**

- 형식 정상 + PASS/FAIL 불변 + 사건컨텍스트 멱등(쟁점·사실관계 불변) → 통과.
- **현행성 ⚠️ 라인이 바뀐 것은 회귀 아님**(법 개정 정상 반영). PASS/FAIL만 본다.
- 통과 실패 시 해당 태스크(2~6)로 돌아가 수정 후 재실행.

- [ ] **Step 5: 커밋 (골든 케이스 산출물만)**

주의: 기존 미커밋 `사건컨텍스트.json` 변경을 의도치 않게 포함하지 않도록 재생성된 리서치·검증보고 파일만 파일 단위로 add.
```bash
git add "cases/2026_김민재 해고 무효/리서치/쟁점별_법리.md" "cases/2026_김민재 해고 무효/산출물/검증보고_소장.md" "cases/2026_김민재 해고 무효/산출물/검증보고_준비서면.md"
git commit -m "test: 골든 케이스를 korean-law-mcp 기준으로 재베이스라인 (회귀 PASS)"
```

---

### Task 8: `CLAUDE.md`/`README.md`/`.gitignore` 정리

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 1 (`.mcp.json`, `LAW_OC`).
- Produces: 진입점 문서에서 두 저장소 제거, MCP 설치·키 절차 반영.

- [ ] **Step 1: `CLAUDE.md` — 디렉토리 지도·명령 갱신**

- `legalize-kr/`·`precedent-kr/` 항목과 "두 원본 저장소는 외부 클론 … git clone …" 문단 삭제.
- "자주 쓰는 명령"의 `git -C legalize-kr log/show` 행위시법 조회 예시 삭제 → "행위시법: 인용규칙 §7(applicable_law)" 로 교체.
- 상단 디렉토리 지도에 `.mcp.json`(korean-law-mcp 등록) 한 줄 추가.
- 전환 근거 1줄: "법령·판례 출처는 korean-law-mcp(국가법령정보센터). 구 git 저장소 방식은 2026-07 폐지."

- [ ] **Step 2: `README.md` — "최초 설정" 절 교체**

두 저장소 `git clone` 절차 → korean-law-mcp 설치 + `open.law.go.kr` 키 발급 + `LAW_OC` 설정 + `.mcp.json` 안내로 교체. `<계정명>/<저장소명>` 이 저장소 클론 안내는 유지.

- [ ] **Step 3: `.gitignore` — 저장소 무시 규칙 제거**

`legalize-kr/`·`precedent-kr/` 무시 규칙 삭제.

- [ ] **Step 4: 잔재 점검**

Run: `grep -nE "legalize-kr|precedent-kr" CLAUDE.md README.md .gitignore`
Expected: README의 무관한 예시 외 0건(있으면 정리).

- [ ] **Step 5: 커밋**

```bash
git add CLAUDE.md README.md .gitignore
git commit -m "docs: 진입점 문서를 korean-law-mcp 설치·설정 기준으로 정리"
```

---

### Task 9: Codex 미러 재생성 + AGENTS.md

**Files:**
- Modify: `AGENTS.md`
- Regenerate: `.codex/skills/*` (스크립트 산출 — 직접 수정 금지)

**Interfaces:**
- Consumes: Task 3·4·5 (개정된 `.claude/skills/`).
- Produces: 최신 Codex 미러 + Codex MCP 설정 안내.

- [ ] **Step 1: 미러 재생성**

```bash
python scripts/sync_codex_mirror.py
python scripts/sync_codex_mirror.py --check   # 최신이면 exit 0
```
Expected: `--check`가 exit 0.

- [ ] **Step 2: `AGENTS.md` — Codex MCP 설정 안내 추가**

Codex에서 korean-law MCP를 쓰도록 설정하는 안내(Codex MCP config에 `korean-law` 서버 등록, `LAW_OC` 필요)를 추가한다. 두 저장소 언급이 있으면 제거.

- [ ] **Step 3: 잔재 점검**

Run: `grep -rnE "legalize-kr|precedent-kr" AGENTS.md .codex/skills/`
Expected: 0건.

- [ ] **Step 4: 커밋**

```bash
git add AGENTS.md .codex/
git commit -m "chore(codex): 미러 재생성 + korean-law MCP 설정 안내"
```

---

## Self-Review

**Spec coverage (spec §번호 → task):**
- §3 재현성(스냅샷 동결) → Task 3 Step 7(동결 명시), Task 4 Step 3~4(재조회 대조) ✅
- §4 핀 체계 → Task 2 Step 1~2, Task 3 Step 7, Task 5 ✅
- §5 도메인 활용 → Task 2 Step 6(§6), Task 3 Step 6 ✅
- §6 파일별 변경 → Task 1~9 전부 매핑 ✅
- §7 검증 게이트 → Task 4 ✅
- §8 골든 케이스 → Task 7 ✅
- §9 롤아웃 순서 → Task 순서(1→9)가 spec §9와 일치 ✅
- §10 리스크(키 게이트·스키마 확인) → Task 1 Step 2·5~6 ✅

**Placeholder scan:** MCP 안정 ID 필드명(MST/판례일련번호)은 "잠정명"으로 명시하고 Task 1이 실제명으로 확정하는 해소 경로를 둠 — 미해소 참조 아님. 그 외 TBD/TODO 없음. ✅

**Type consistency:** 핀 문법(법령=`… | MST:… | 시행 … [현행] | 조회 …`, 판례=`… | 판례일련번호:… | 조회 …`, 생사=`[cite_check: …]`)이 Task 2·3·4·5에서 동일하게 사용됨. §5=cite_check, §7=applicable_law, §6=MCP 검색 규칙 번호 매핑이 스킬 참조와 일치. ✅

**주의:** spec §6은 §6을 "삭제"로 적었으나, 스킬들이 검색 규칙 참조처를 필요로 하고 §7 번호 안정을 위해 **"MCP 검색 규칙"으로 재작성**(삭제 대신)으로 계획에서 정련함(Task 2 Step 6).
