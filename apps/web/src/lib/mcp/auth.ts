import { timingSafeEqual } from "node:crypto";

function safeEqual(token: string, secret: string): boolean {
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * MCP 엔드포인트 인증. Bearer 헤더 또는 ?secret= 쿼리 중 하나라도 일치하면 통과.
 * (Managed Agents mcp_servers는 커스텀 헤더 미지원 — 쿼리 방식이 그쪽 전용 경로)
 */
export function checkMcpAuth(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  if (bearer && safeEqual(bearer, secret)) return true;
  const query = new URL(request.url).searchParams.get("secret") ?? "";
  return query.length > 0 && safeEqual(query, secret);
}
