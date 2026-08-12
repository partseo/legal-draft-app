const PUBLIC_PREFIXES = [
  "/login",
  "/api/health",
  // Vercel Cron이 로그인 없이 호출한다 (CRON_SECRET으로 보호)
  "/api/keepalive",
  "/api/mcp/",
  "/_next/",
  "/favicon.ico",
];

/** 인증 없이 접근 가능한 경로 (MCP·Cron 엔드포인트는 자체 시크릿으로 보호) */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p) || (p.endsWith("/") === false && pathname.startsWith(p + "/")),
  );
}
