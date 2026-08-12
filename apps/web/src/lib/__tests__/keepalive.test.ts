import { describe, it, expect, vi } from "vitest";
import { isAuthorizedCron, touchSupabase } from "@/lib/keepalive";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc-key",
};

describe("isAuthorizedCron", () => {
  it("시크릿이 설정돼 있으면 일치할 때만 통과", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false); // Bearer 접두사 필요
  });

  it("시크릿 미설정이면 막지 않는다 (읽기 전용이라 무해)", () => {
    expect(isAuthorizedCron(null, undefined)).toBe(true);
    expect(isAuthorizedCron(null, "")).toBe(true);
  });
});

describe("touchSupabase", () => {
  it("Postgres를 실제로 조회한다 — auth 헬스만으로는 일시정지를 못 막는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    const r = await touchSupabase(env, fetchMock);

    expect(r.ok).toBe(true);
    expect(r.db).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/rest/v1/");
    expect((init.headers as Record<string, string>).apikey).toBe("svc-key");
  });

  it("DB가 응답하지 않으면 ok=false 와 상태코드를 남긴다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("down", { status: 521 }));
    const r = await touchSupabase(env, fetchMock);

    expect(r.ok).toBe(false);
    expect(r.db).toBe(false);
    expect(r.detail).toContain("521");
  });

  it("네트워크 자체가 실패해도 예외를 던지지 않는다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const r = await touchSupabase(env, fetchMock);

    expect(r.ok).toBe(false);
    expect(r.db).toBe(false);
    expect(r.detail).toContain("ENOTFOUND");
  });
});
