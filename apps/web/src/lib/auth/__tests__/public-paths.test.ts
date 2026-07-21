import { describe, it, expect } from "vitest";
import { isPublicPath } from "@/lib/auth/public-paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/api/health",
    "/api/mcp/korean-law/mcp",
    "/_next/static/chunk.js",
    "/favicon.ico",
  ])("공개 경로: %s", (p) => {
    expect(isPublicPath(p)).toBe(true);
  });

  it.each(["/", "/cases", "/cases/abc", "/api/cases", "/settings"])(
    "보호 경로: %s",
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    },
  );
});
