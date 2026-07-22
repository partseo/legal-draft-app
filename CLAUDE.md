# 송무서면 생성기 — 웹 앱

변호사 팀이 브라우저로 쓰는 송무서면 파이프라인(사건구성→리서치→서면작성→인용검증)
웹 앱. 실행 엔진은 Anthropic Managed Agents(베타). **모든 산출물은 초안이며 변호사
검수 전 제출 금지.**

## 이 저장소의 범위 (웹앱 전용)

- 웹 앱 본체는 전부 `apps/web/` (Next.js 15 App Router + Tailwind v4 + Supabase).
- **에이전트 프로젝트(스킬·rules·templates·로컬 워크플로우)는 별도 저장소** —
  형제 폴더 `../litigation-writer`가 canonical이다. 이 저장소에는 그 소스를 두지 않는다.
- `cases/` 는 사건 기록 보관용이며 웹 앱 런타임은 이를 읽지 않는다(진실의 원천은 Supabase).
  Vercel 배포는 Root Directory=`apps/web`이라 `cases/`는 배포에 포함되지 않는다.
- `docs/` 는 웹 앱 설계·계획 이력(specs·plans·design.pen).

## 에이전트 번들 (중요)

에이전트가 세션에서 쓰는 스킬 5종+rules+templates는 빌드 산출물
`apps/web/src/lib/agent/bundle-data.json`(git에 커밋됨)에 tar.gz로 담겨 있다.
Vercel 등 소스가 없는 체크아웃에서는 이 커밋된 번들을 그대로 사용한다.

형제 `litigation-writer`에서 스킬·rules·templates를 수정했다면 번들을 재생성해 커밋한다:

```bash
cd apps/web
AGENT_SRC_DIR="../../../litigation-writer" npm run bundle   # 경로는 실제 형제 폴더로
git add src/lib/agent/bundle-data.json
```

(소스가 없으면 `npm run bundle`/`prebuild`는 재생성을 건너뛰고 커밋된 번들을 쓴다.)

## 자주 쓰는 명령 (apps/web 에서)

- `npm run dev` — 개발 서버 (포트 3000, 점유 시 3001)
- `npm run build` / `npm run test` — 빌드 / vitest
- 배포: `apps/web/README.md` 참조 (Vercel Root Directory=`apps/web`)

## 안전수칙 (웹 실행 에이전트의 시스템 프롬프트에 반영됨)

사실 생성 금지 · 인용 단일 진입로 · 모르면 확인필요 · 검증 게이트(❌ 시 제출 금지) ·
시니어 조언은 저장 금지. 원문 규칙은 형제 `litigation-writer/CLAUDE.md` 및
`apps/web/src/lib/agent/prompts.ts`(SYSTEM_PROMPT)에 있다.
