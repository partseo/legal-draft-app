# 법률문서 작성기 — 웹 앱 저장소

변호사 팀이 브라우저로 쓰는 송무서면 파이프라인 웹 앱. 실행 엔진은
Anthropic Managed Agents(베타), 데이터는 Supabase.

> **에이전트 프로젝트(스킬·rules·templates·로컬 워크플로우)는 형제 저장소
> `../litigation-writer`에 있습니다.** 이 저장소는 웹 앱 전용입니다.

## 구조

- `apps/web/` — 웹 앱 본체 (Next.js 15). 개발·배포 문서는 `apps/web/README.md`.
- `cases/` — 사건 기록 보관 (웹 앱 런타임은 사용하지 않음 · Vercel 배포 제외).
- `docs/` — 설계·계획 이력 (specs · plans · design.pen).
- 개발 지침·에이전트 번들 재생성: 루트 `CLAUDE.md` 참조.

## 빠른 시작

```bash
cd apps/web
npm install
cp .env.example .env.local   # 값 채우기 (Supabase · LAW_OC · MCP_SHARED_SECRET · ANTHROPIC_API_KEY · APP_PUBLIC_URL)
npm run dev
```

## 배포 (Vercel)

- Root Directory = `apps/web`
- 환경변수: `apps/web/.env.example`의 모든 키 등록
- 자세한 절차: `apps/web/README.md`
