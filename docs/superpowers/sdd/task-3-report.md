# Task 3 Report: `[행위시 확인]` 부기 = 핀 블록의 일부

## Status
완료 (COMPLETE)

## 작업 내역

### Step 1: `rules/인용규칙.md` §7
연혁 핀 표기 블록(`[출처: 근로기준법 제27조 | MST:{연혁MST} | …]`, 113행) 바로 아래,
기존 "검증 재현" 불릿(직전 P0 커밋에서 추가된 `efYd` 관련 불릿) **위**에 "부기의 지위"
불릿을 신규 삽입. 기존 "검증 재현" 불릿·연혁 MST NOT_FOUND 실측 불릿은 그대로 보존.

### Step 2: `.claude/skills/draft-complaint/SKILL.md`
"법적 주장 절은 …" 항목의 굵은 문장(`**리서치에 없는 조문·판례가 필요해지면 …**`)
바로 아래에 "핀 블록은 통째로 복사한다 …" 문단 삽입. 이후 "마지막 절은 결론…" 항목은
그대로 유지.

### Step 3: `.claude/skills/draft-brief/SKILL.md`
"2.~ 쟁점별 절: … 법리(리서치 발췌·출처 핀 인용). 상대방 증거에 대한 의견도 해당 절에
기재." 줄 바로 아래에 "핀 블록은 통째로 복사한다 …" 문단 삽입. 이후 "소장 중복 기재
금지" 불릿은 그대로 유지.

### Step 4: `.claude/skills/verify-citations/SKILL.md`
(c-2) 행위시 검증 블록의 마지막 항목(`재실행 결과 기준일 시행 버전의 조문이 핀의
조문 내용과 다르면 → ⚠️ (적용 버전 검토).`) 바로 아래에 "부기 이관 누락 ⚠️" 항목 삽입.
이후 "재조회 기술 실패 분기 (❌ 아님)" 블록은 그대로 유지.

### Step 5: 미러 재생성 + 커밋
```
python scripts/sync_codex_mirror.py       # regenerated
python scripts/sync_codex_mirror.py --check  # exit 0
```
`.codex/skills/{draft-complaint,draft-brief,verify-citations}/SKILL.md`가
`.claude/skills/` 대응 파일과 byte-identical(CRLF/LF 차이 무시, diff 확인 완료).

커밋: `be02456` (브랜치 `feat/p1-quality`)
```
feat(rules/skills): [행위시 확인] 부기를 핀 블록의 일부로 명문화 (P1 결정②)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
7 files changed, 18 insertions(+) — canonical 4 + mirror 3.

## Self-review 결과
1. **Verbatim**: 브리프에 명시된 삽입 문구를 4곳 모두 그대로 사용(문자 단위 대조 완료).
2. **앵커 위치**: `git diff`로 각 삽입이 브리프가 지정한 정확한 줄(§7 연혁 핀 블록 아래,
   draft-complaint 굵은 문장 아래, draft-brief 법리 인용 줄 아래, verify-citations
   (c-2) 마지막 항목 아래) 바로 다음에 위치함을 확인.
3. **기존 내용 무손상**: §7의 기존 `efYd` 관련 불릿(직전 P0 커밋분), verify-citations의
   기존 "재조회 기술 실패 분기" 블록 등 인접 텍스트가 diff상 컨텍스트 라인으로만
   나타나고 변경/삭제되지 않음.
4. **미러 blob 동일**: `diff` 3파일 모두 `IDENTICAL_*` 확인(개행 정규화 후 완전 일치).
   `sync_codex_mirror.py --check` exit 0.
5. **범위 준수**: `cases/` 미접근. 스테이징된 파일은 브리프가 지정한 7개 파일뿐
   (`git status --porcelain` 확인).

## Concerns
없음.
