import { describe, it, expect } from "vitest";
import { checkMcpAuth } from "@/lib/mcp/auth";

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
