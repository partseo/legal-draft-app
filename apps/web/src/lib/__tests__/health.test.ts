import { describe, it, expect, vi } from "vitest";
import { computeHealth } from "@/lib/health";

describe("computeHealth", () => {
  it("모든 체크 성공 시 ok=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    const result = await computeHealth(
      { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", LAW_OC: "oc" },
      fetchMock,
    );
    expect(result).toEqual({ ok: true, checks: { env: true, supabase: true, lawOc: true } });
  });

  it("supabase 응답 실패 시 ok=false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    const result = await computeHealth(
      { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", LAW_OC: "oc" },
      fetchMock,
    );
    expect(result.ok).toBe(false);
    expect(result.checks.supabase).toBe(false);
  });

  it("fetch가 던져도 예외 없이 supabase=false", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    const result = await computeHealth(
      { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", LAW_OC: "oc" },
      fetchMock,
    );
    expect(result.checks.supabase).toBe(false);
  });
});
