# 송무서면 생성기 — 웹 앱 (P1)

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
- 환경변수: `.env.example`의 모든 키를 Vercel 프로젝트에 등록
- MCP 엔드포인트: `https://<도메인>/api/mcp/korean-law/mcp` (Bearer MCP_SHARED_SECRET)

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
