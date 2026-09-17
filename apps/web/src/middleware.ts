import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isPublicPath } from "@/lib/auth/public-paths";
import { isAuthBackendDown } from "@/lib/auth/login-error";

/** 인증 백엔드가 죽었을 때 보여줄 페이지. 로그인 화면으로 보내면 원인을 알 수 없다. */
function authUnavailableResponse(rawDetail: string): NextResponse {
  // 에러 문자열이 그대로 HTML에 들어가므로 안전한 문자만 남긴다
  const detail = rawDetail.replace(/[^\w .:·-]/g, "").slice(0, 120);
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>인증 서버 연결 불가 — 법률문서 작성기</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f7f8;
font-family:system-ui,"Segoe UI",sans-serif;color:#0a0a0a}main{max-width:34rem;padding:2.5rem;background:#fff;
border:1px solid #e5e5e5;border-radius:.75rem}h1{margin:0 0 .75rem;font-size:1.125rem}p{margin:0 0 .5rem;
font-size:.875rem;line-height:1.6;color:#525252}code{font-size:.75rem;color:#a3a3a3}</style></head>
<body><main><h1>인증 서버에 연결할 수 없습니다</h1>
<p>계정이나 비밀번호 문제가 아닙니다. Supabase 프로젝트가 일시정지되었거나 장애 중일 때 이 화면이 나옵니다.</p>
<p>관리자: Supabase 대시보드에서 프로젝트가 <b>paused</b> 상태인지 확인하고 resume 하세요.
상태는 <a href="/api/health">/api/health</a> 로 확인할 수 있습니다.</p>
<p><code>${detail}</code></p></main></body></html>`;
  return new NextResponse(body, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  // 백엔드 장애를 '세션 없음'으로 오인하면, 로그인해도 못 들어가는 리다이렉트만 반복된다
  if (isAuthBackendDown(error)) {
    return authUnavailableResponse(`${error?.name ?? "AuthError"} · status ${error?.status ?? "?"}`);
  }
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
