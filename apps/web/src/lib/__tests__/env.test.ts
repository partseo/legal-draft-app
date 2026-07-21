import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

const REQUIRED = {
  LAW_OC: "test-oc",
  MCP_SHARED_SECRET: "0123456789abcdef0123456789abcdef",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

describe("getEnv", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetEnvCache();
    for (const k of Object.keys(REQUIRED)) {
      saved[k] = process.env[k];
      process.env[k] = REQUIRED[k as keyof typeof REQUIRED];
    }
  });

  afterEach(() => {
    resetEnvCache();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("필수 변수가 모두 있으면 파싱된다", () => {
    const env = getEnv();
    expect(env.LAW_OC).toBe("test-oc");
  });

  it("MCP_SHARED_SECRET이 16자 미만이면 던진다", () => {
    process.env.MCP_SHARED_SECRET = "short";
    expect(() => getEnv()).toThrow();
  });

  it("LAW_OC 누락 시 던진다", () => {
    delete process.env.LAW_OC;
    expect(() => getEnv()).toThrow();
  });
});
