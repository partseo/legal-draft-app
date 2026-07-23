# 사건 리스트에서 사건 완전 삭제 — 설계

- 날짜: 2026-07-23
- 범위: `apps/web` (사건 목록 화면 `/`)

## 목표

사건 목록에서 팀원이 사건을 **완전 삭제(hard delete)** 할 수 있게 한다. 확인 모달로
실수를 방지하고, 사건에 딸린 DB 레코드와 스토리지 파일을 모두 정리한다.

## 결정 사항

- **삭제 방식**: 완전 삭제. 소프트 삭제/복구 없음.
- **권한**: 팀원 전원 (별도 관리자 게이트 없음). 현재 RLS `team all cases`가 인증
  사용자 전원의 삭제를 허용하므로 그대로 사용.
- **확인 UX**: 휴지통 아이콘 → 사건명을 보여주는 확인 모달 → [삭제] 재확인.

## 데이터 영향

`cases` 행 하나 삭제 시 FK `on delete cascade`로 다음이 자동 삭제된다:
`rounds → runs → checkpoints`, `reviews`, `case_files`(메타).

**스토리지 blob은 cascade 대상이 아니다.** `case-files` 버킷의 실제 파일은
`${caseId}/input/…`, `${caseId}/artifacts/…` 경로에 있으며, 이 버킷에는 **delete
RLS 정책이 없다**. 따라서 파일 삭제는 **service-role 클라이언트**로 수행한다
(`createServiceClient`).

## 컴포넌트

### 1. `deleteCase(caseId)` 서버 액션 — `apps/web/src/app/(app)/cases/actions.ts`에 추가

반환 타입: `{ ok: true } | { error: string }`.

1. `auth.getUser()` — 미로그인 시 `{ error }` 반환.
2. 라우트 클라이언트로 `case_files.storage_path`(where `case_id = caseId`) 목록 조회
   — **행 삭제 전에** 경로를 확보한다.
3. 경로가 있으면 **service-role 클라이언트**로
   `storage.from("case-files").remove(paths)`. 실패 시 `{ error }` 반환(행은 남김 →
   재시도 가능).
4. 라우트 클라이언트로 `cases` 행 삭제(`.delete().eq("id", caseId)`) → DB cascade.
   실패 시 `{ error }`.
5. `revalidatePath("/")` 후 `{ ok: true }`.

### 2. `CaseRow` 클라이언트 컴포넌트 — 신규 `apps/web/src/components/case-row.tsx`

현재 `page.tsx`의 각 행은 통째로 `<Link>`다. `<a>` 안에 `<button>`을 둘 수 없으므로
행을 클라이언트 컴포넌트로 분리한다.

- 컨테이너: `relative group flex items-center …` (기존 행 스타일 유지: hover 배경,
  상단 구분선, 좌측 attention 보더).
- 네비게이션 `<Link href={/cases/${id}} className="absolute inset-0">` 오버레이 —
  행 전체 클릭 시 상세로 이동(기존 동작 유지). `aria-label`에 사건명.
- 셀 콘텐츠(사건명/담당/진행/상태/최근활동)는 Link 위에 `relative pointer-events-none`
  로 얹어 클릭이 Link로 통과되게 한다.
- 오른쪽 끝 **휴지통 버튼**: `group-hover`에 나타남, `pointer-events-auto z-10`.
  `onClick`에서 `preventDefault`/`stopPropagation` 후 확인 모달 오픈.
- 확인 모달: `senior-advice-modal` 스타일 재사용(고정 오버레이 + 흰 카드). 문구:
  "**{사건명}** 사건을 완전히 삭제할까요? 라운드·서면·검증·업로드 파일이 모두
  삭제되며 되돌릴 수 없습니다." 버튼 [취소] / [삭제](red = `st-block`).
- `useTransition`으로 진행 상태 표시, 액션이 `{ error }` 반환 시 모달 내 에러 노출.
  성공 시 모달 닫힘(서버 `revalidatePath("/")`로 행이 사라짐).

### 3. `page.tsx` — `apps/web/src/app/(app)/page.tsx`

행 렌더링을 `<CaseRow key={c.id} c={...} index={i} />`로 교체. 헤더/필터/빈 상태/쿼리는
그대로. 서버 컴포넌트는 액션을 import해 CaseRow에 넘기거나, CaseRow가 직접 액션을
import한다(서버 액션은 클라이언트에서 직접 호출 가능하므로 CaseRow에서 import).

## 스타일 토큰

- 삭제 버튼: `st-block`(#dc2626) 텍스트/보더, hover 시 `st-block-bg`(#fef2f2).
- 나머지: 기존 `app-primary`, `neutral-*` 재사용.

## 범위 밖

- **실행 중(running/waiting_checkpoint) 사건 삭제 차단 없음.** 삭제 시 run 행이
  cascade로 지워지면 매니지드 에이전트 세션이 고아가 될 수 있으나 현 규모에선 허용.
  필요 시 후속.
- 소프트 삭제/복구, 대량 선택 삭제, 담당자 필터/검색 기능(현재도 미구현 표시용).

## 검증

- `npm run build`(타입체크 통과).
- dev 서버 수동 확인: 행 hover → 휴지통 → 모달 → 삭제 → 목록에서 사라짐.
- 스토리지에 파일이 있던 사건 삭제 시 `${caseId}/` 이하 오브젝트 제거 확인.
