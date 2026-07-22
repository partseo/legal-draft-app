import { describe, it, expect } from "vitest";
import { checkMcpAuth } from "@/lib/mcp/auth";
import { mcpServerUrl } from "@/lib/mcp/server-url";

const SECRET = "0123456789abcdef0123456789abcdef";

function req(headers: Record<string, string>): Request {
  return new Request("https://x.test/api/mcp/korean-law/mcp", {
    method: "POST",
    headers,
  });
}

describe("checkMcpAuth", () => {
  it("올바른 Bearer 시크릿이면 true", () => {
    expect(checkMcpAuth(req({ authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
  });

  it("시크릿 불일치면 false", () => {
    expect(checkMcpAuth(req({ authorization: "Bearer wrong" }), SECRET)).toBe(false);
  });

  it("헤더 없으면 false", () => {
    expect(checkMcpAuth(req({}), SECRET)).toBe(false);
  });
});

describe("checkMcpAuth (query secret)", () => {
  it("올바른 ?secret= 쿼리면 true", () => {
    const r = new Request(`https://x.test/api/mcp/korean-law/mcp?secret=${SECRET}`, { method: "POST" });
    expect(checkMcpAuth(r, SECRET)).toBe(true);
  });

  it("쿼리 시크릿 불일치면 false", () => {
    const r = new Request("https://x.test/api/mcp/korean-law/mcp?secret=wrong", { method: "POST" });
    expect(checkMcpAuth(r, SECRET)).toBe(false);
  });

  it("Bearer가 틀리면 쿼리가 맞아도 Bearer 우선으로 false가 아니라 — 쿼리로 통과", () => {
    const r = new Request(`https://x.test/api/mcp/korean-law/mcp?secret=${SECRET}`, {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    expect(checkMcpAuth(r, SECRET)).toBe(true);
  });
});

describe("mcpServerUrl", () => {
  it("공개 URL + 경로 + 시크릿 쿼리를 조립한다", () => {
    expect(mcpServerUrl({ APP_PUBLIC_URL: "https://ex.vercel.app", MCP_SHARED_SECRET: SECRET })).toBe(
      `https://ex.vercel.app/api/mcp/korean-law/mcp?secret=${SECRET}`,
    );
  });
});
