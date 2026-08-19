import { describe, it, expect, vi } from "vitest";
import { isAuthorizedCron, touchSupabase } from "@/lib/keepalive";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc-key",
};

const heartbeatRow = { id: 1, last_ping_at: "2026-08-19T03:00:00+00:00", ping_count: 42 };
const rpcOk = () => new Response(JSON.stringify(heartbeatRow), { status: 200 });
const readOk = () => new Response("[]", { status: 200 });

describe("isAuthorizedCron", () => {
  it("시크릿이 설정돼 있으면 일치할 때만 통과", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false); // Bearer 접두사 필요
  });

  it("시크릿 미설정이면 막지 않는다 — 환경변수 누락으로 keepalive가 조용히 죽는 쪽이 더 위험하다", () => {
    expect(isAuthorizedCron(null, undefined)).toBe(true);
    expect(isAuthorizedCron(null, "")).toBe(true);
  });
});

describe("touchSupabase — 쓰기 경로", () => {
  it("RPC로 하트비트를 기록하고 시각·횟수를 돌려준다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(rpcOk());
    const r = await touchSupabase(env, fetchMock);

    expect(r).toMatchObject({ ok: true, db: true, mode: "write", degraded: false });
    expect(r.lastPingAt).toBe(heartbeatRow.last_ping_at);
    expect(r.pingCount).toBe(heartbeatRow.ping_count);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proj.supabase.co/rest/v1/rpc/keepalive_ping");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apikey).toBe("svc-key");
  });

  it("RPC가 배열로 와도 첫 행을 읽는다 (PostgREST 반환 형태 차이)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([heartbeatRow]), { status: 200 }));
    const r = await touchSupabase(env, fetchMock);

    expect(r.mode).toBe("write");
    expect(r.lastPingAt).toBe(heartbeatRow.last_ping_at);
  });
});

describe("touchSupabase — 폴백 경로", () => {
  it("RPC가 없으면(마이그레이션 미적용) 읽기로 내려가되 degraded 로 표시한다", async () => {
    // 핵심: 마이그레이션이 안 올라간 상태에서도 DB 활동은 반드시 발생해야 한다.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("no function", { status: 404 }))
      .mockResolvedValueOnce(readOk());
    const r = await touchSupabase(env, fetchMock);

    expect(r).toMatchObject({ ok: true, db: true, mode: "read", degraded: true });
    expect(r.detail).toContain("404");
    expect(fetchMock.mock.calls[1][0]).toContain("/rest/v1/app_settings");
  });

  it("RPC가 네트워크에서 터져도 읽기 폴백을 시도한다", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(readOk());
    const r = await touchSupabase(env, fetchMock);

    expect(r).toMatchObject({ ok: true, db: true, mode: "read", degraded: true });
    expect(r.detail).toContain("socket hang up");
  });

  it("키가 틀려 둘 다 401이면 실패로 보고한다 — DB에 아무것도 닿지 않았다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    const r = await touchSupabase(env, fetchMock);

    expect(r).toMatchObject({ ok: false, db: false, mode: "none" });
    expect(r.detail).toContain("401");
  });

  it("네트워크가 통째로 죽어도 예외를 던지지 않는다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const r = await touchSupabase(env, fetchMock);

    expect(r).toMatchObject({ ok: false, db: false, mode: "none" });
    expect(r.detail).toContain("ENOTFOUND");
  });
});
