import { describe, it, expect } from "vitest";
import { classifyAuthError, isAuthBackendDown } from "@/lib/auth/login-error";

/**
 * supabase auth-js가 실제로 만드는 에러 모양을 흉내낸다.
 * - 네트워크 도달 실패(DNS·연결거부) → AuthRetryableFetchError(status 0)
 * - 5xx·Cloudflare 520~530      → AuthRetryableFetchError(status 그대로)
 * - 자격증명 오류                → AuthApiError(400, invalid_credentials)
 */
const retryable = (status: number) => ({ name: "AuthRetryableFetchError", status, message: "Failed to fetch" });
const apiError = (status: number, code?: string) => ({ name: "AuthApiError", status, code, message: code ?? "err" });

describe("classifyAuthError", () => {
  it("에러가 없으면 null", () => {
    expect(classifyAuthError(null)).toBeNull();
    expect(classifyAuthError(undefined)).toBeNull();
  });

  it("DNS 실패(status 0)는 자격증명이 아니라 백엔드 장애로 분류한다", () => {
    const info = classifyAuthError(retryable(0));
    expect(info?.kind).toBe("unavailable");
    expect(info?.message).not.toContain("비밀번호가 올바르지");
  });

  it("Supabase 일시정지 중 Cloudflare 521도 백엔드 장애로 분류한다", () => {
    expect(classifyAuthError(retryable(521))?.kind).toBe("unavailable");
  });

  it("5xx는 백엔드 장애로 분류한다", () => {
    expect(classifyAuthError(apiError(500))?.kind).toBe("unavailable");
    expect(classifyAuthError(apiError(503))?.kind).toBe("unavailable");
  });

  it("백엔드 장애 문구는 비밀번호 탓이 아님을 명시하고 상태코드를 남긴다", () => {
    const info = classifyAuthError(retryable(521));
    expect(info?.message).toContain("인증 서버");
    expect(info?.detail).toContain("521");
  });

  it("400 invalid_credentials는 자격증명 오류", () => {
    const info = classifyAuthError(apiError(400, "invalid_credentials"));
    expect(info?.kind).toBe("credentials");
    expect(info?.message).toBe("이메일 또는 비밀번호가 올바르지 않습니다");
  });

  it("401·403도 자격증명 오류", () => {
    expect(classifyAuthError(apiError(401))?.kind).toBe("credentials");
    expect(classifyAuthError(apiError(403))?.kind).toBe("credentials");
  });

  it("429는 요청 과다로 구분한다", () => {
    const info = classifyAuthError(apiError(429, "over_request_rate_limit"));
    expect(info?.kind).toBe("rate_limited");
    expect(info?.message).toContain("잠시 후");
  });

  it("분류 불가는 unknown", () => {
    expect(classifyAuthError({ name: "AuthUnknownError", message: "?" })?.kind).toBe("unknown");
  });
});

describe("isAuthBackendDown", () => {
  it("미들웨어가 '세션 없음'과 '백엔드 장애'를 구분할 수 있다", () => {
    expect(isAuthBackendDown(retryable(0))).toBe(true);
    expect(isAuthBackendDown(retryable(521))).toBe(true);
    expect(isAuthBackendDown(apiError(500))).toBe(true);
    // 로그인 안 한 평범한 방문자 — 리다이렉트가 맞다
    expect(isAuthBackendDown(null)).toBe(false);
    expect(isAuthBackendDown({ name: "AuthSessionMissingError", status: 400 })).toBe(false);
    expect(isAuthBackendDown(apiError(400, "invalid_credentials"))).toBe(false);
  });
});
