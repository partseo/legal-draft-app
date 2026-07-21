const PUBLIC_PREFIXES = ["/login", "/api/health", "/api/mcp/", "/_next/", "/favicon.ico"];

/** 인증 없이 접근 가능한 경로 (MCP 엔드포인트는 자체 시크릿으로 보호) */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p) || (p.endsWith("/") === false && pathname.startsWith(p + "/")),
  );
}
