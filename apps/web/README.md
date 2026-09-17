# 법률문서 작성기 — 웹 앱 (P1)

스펙: `../../docs/superpowers/specs/2026-07-21-웹앱-배포-design.md`

## 셋업

1. Supabase 프로젝트 생성 → `npx supabase link --project-ref <REF>` → `npx supabase db push`
   (현재 연결된 프로젝트: `wphzivtevqhdgjmqmfey`, 서울 리전)
2. `.env.example`을 `.env.local`로 복사해 값 채우기
3. `npm install && npm run dev`
4. 검증: `node scripts/test-mcp-endpoint.mjs http://localhost:3000 <MCP_SHARED_SECRET>`
   (3000 포트가 사용 중이면 dev 서버가 안내하는 포트로 변경)

## Vercel 배포

- 프로젝트 Root Directory를 `apps/web`으로 설정 (리포의 cases/ 등은 배포에 포함되지 않음)
- GitHub 연동됨 — `main`에 push하면 프로덕션 자동 배포. 수동 배포는 `vercel deploy --prod`
- 환경변수: `.env.example`의 모든 키를 Vercel 프로젝트에 등록. 추가로 `CRON_SECRET`(Cron 보호용)
- MCP 엔드포인트: `https://<도메인>/api/mcp/korean-law/mcp` (Bearer MCP_SHARED_SECRET)

### Supabase 일시정지 방지

무료 플랜은 무활동이 이어지면 프로젝트를 pause 하고 서브도메인을 DNS에서 회수한다
(NXDOMAIN → 앱 전체가 로그인 불가). Supabase 는 임계값을 공개하지 않고
["매일 몇 건의 요청"이면 충분하다](https://supabase.com/docs/guides/platform/free-project-pausing)고만 안내한다.

**스케줄러 2중화** — 둘 다 `/api/keepalive` 를 호출한다.

| 경로 | 주기 | 비고 |
|---|---|---|
| `.github/workflows/supabase-keepalive.yml` | 하루 3회 (01·09·17 UTC) + `main` push | 주 경로. 실제 발화는 1~5시간 밀린다 — GitHub 스케줄은 보장이 아니다 |
| `vercel.json` 의 Cron | 하루 1회 (03 UTC) | 이중화. Hobby 는 하루 1회가 상한이고 발화 시각·성공이 보장되지 않는다 |

GitHub Actions 에 시크릿 2개가 필요하다 —
`KEEPALIVE_URL`(`https://<도메인>/api/keepalive`)과 `CRON_SECRET`(Vercel 것과 동일한 값).

**엔드포인트는 읽지 않고 쓴다.** `keepalive_ping()` 이 `keepalive_heartbeat` 행의
`last_ping_at`·`ping_count` 를 갱신한다. 읽기 전용이던 이전 구현은 흔적을 남기지 않아
2026-08 에 일시정지 경고를 받았을 때 "안 돌았는지 / 돌았는데 부족했는지"를 구분할 수
없었다. 이제는 응답만 보면 된다:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/keepalive
# {"ok":true,"db":true,"mode":"write","degraded":false,
#  "lastPingAt":"2026-08-19T01:00:04+00:00","pingCount":37}
```

| 응답 | 뜻 | 할 일 |
|---|---|---|
| `mode: "write"` | 정상 | — |
| `mode: "read"`, `degraded: true` | DB 활동은 했지만 하트비트 기록 실패 | 마이그레이션 미적용 → `npx supabase db push` |
| HTTP 503, `mode: "none"` | DB 에 아무것도 못 닿음 | `detail` 의 상태코드 확인 (401=service_role 키, 404=경로) |

> ⚠️ `degraded: true` 는 워크플로우를 **실패시키지 않는다** — `::warning` 주석만 남고
> 실행은 초록불로 끝나 메일이 오지 않는다. 강등은 Actions 탭 주석이나 위 curl 로만 보인다.

**이중화가 실제로 살아 있는지** — Vercel Hobby 는 런타임 로그를 1시간만 보관해서 Cron
발화 여부를 사후에 로그로 확인할 수 없다. 대신 `ping_count` 증가분에서 역산한다.

```bash
gh run list --workflow=supabase-keepalive.yml --limit 100 --json databaseId,createdAt
gh run view <ID> --log | grep -o '{"ok".*}'   # 두 시점의 pingCount 를 뽑는다
```

`(카운트 증가분) - (그 사이 GitHub 실행 수)` 가 Vercel Cron 발화 수다. 하루 1회에
가까우면 이중화가 산다. 2026-09-07 실측: 18.06일간 72회 증가, GitHub 54회 → 차액
18회로 하루 정확히 1회. 두 경로 합쳐 하루 4회, 핑 사이 최대 공백 약 11시간.

> ⚠️ GitHub 은 **저장소가 60일간 무활동이면 스케줄 워크플로우를 자동 비활성화**한다.
> 워크플로우가 `push` 에도 걸려 있지만 커밋 자체가 없으면 소용없다 — 두 달 넘게
> 손대지 않을 것 같으면 Actions 탭에서 활성 상태를 한 번 확인한다.

이미 멈췄다면 Supabase 대시보드에서 resume 하고, SQL Editor 에서 아무 쿼리나 실행해
타이머를 리셋한 뒤 위 curl 로 `mode: "write"` 를 확인한다.

## 구조

- `src/app/api/mcp/korean-law/[transport]/` — HTTP MCP (stateless, 요청마다 fresh server)
- `src/lib/mcp/korean-law-registry.mjs` — 벤더링 산출물. 직접 수정 금지,
  `node scripts/vendor-korean-law-registry.mjs`로만 재생성 (korean-law-mcp 버전 고정 4.4.4)
- `supabase/migrations/` — 스키마. 변경은 새 마이그레이션 파일로만
  (주의: 마이그레이션 파일명에 `init`을 쓰면 CLI가 건너뛴다)
- `src/app/api/health` — 연동 상태 점검 (env·Supabase·LAW_OC)
- 최초 관리자 승격: Supabase SQL Editor에서
  `update profiles set role='admin' where id='<USER_UUID>';`

## 운영 메모

- DB 비밀번호는 대시보드 Settings → Database에서 재설정 후 안전한 곳에 보관
  (앱 런타임은 DB 비밀번호를 쓰지 않는다 — supabase CLI의 db push에만 필요)
