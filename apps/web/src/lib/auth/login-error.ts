/**
 * Supabase 인증 에러를 "자격증명 문제"와 "인증 백엔드 장애"로 구분한다.
 *
 * 구분이 필요한 이유: 모든 실패를 "비밀번호가 틀렸다"로 표시하면, 실제로는
 * Supabase 프로젝트가 멈춰 로그인 자체가 불가능한 상황에서도 화면에는
 * 비밀번호 오류만 뜬다. 원인 진단이 불가능해진다.
 *
 * auth-js가 만드는 에러 모양:
 * - 도달 실패(DNS·연결거부) → AuthRetryableFetchError, status 0
 * - 5xx·Cloudflare 520~530  → AuthRetryableFetchError, status 그대로
 * - 자격증명 오류            → AuthApiError, status 400 (code invalid_credentials)
 */

export type AuthErrorKind = "credentials" | "unavailable" | "rate_limited" | "unknown";

export type AuthErrorInfo = {
  kind: AuthErrorKind;
  /** 사용자에게 보여줄 문구 */
  message: string;
  /** 진단용 부가 정보 (상태코드·에러코드) */
  detail?: string;
};

/** auth-js 에러에서 우리가 읽는 부분만 추린 모양 */
export type AuthErrorLike = {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
};

const MESSAGES: Record<AuthErrorKind, string> = {
  credentials: "이메일 또는 비밀번호가 올바르지 않습니다",
  unavailable: "인증 서버에 연결할 수 없습니다 — 비밀번호 문제가 아닙니다. 잠시 후 다시 시도하고, 계속되면 관리자에게 알려주세요",
  rate_limited: "로그인 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요",
  unknown: "로그인에 실패했습니다",
};

function kindOf(error: AuthErrorLike): AuthErrorKind {
  const status = error.status;
  // 도달 실패·서버 장애는 재시도 가능 에러로 온다 (status 0 = 네트워크 자체 실패)
  if (error.name === "AuthRetryableFetchError") return "unavailable";
  if (typeof status === "number" && status >= 500) return "unavailable";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 401 || status === 403) return "credentials";
  return "unknown";
}

/** 인증 에러를 분류한다. 에러가 없으면 null. */
export function classifyAuthError(error: AuthErrorLike | null | undefined): AuthErrorInfo | null {
  if (!error) return null;
  const kind = kindOf(error);
  const parts = [error.status !== undefined ? `status ${error.status}` : null, error.code ?? error.name ?? null].filter(
    Boolean,
  );
  return { kind, message: MESSAGES[kind], detail: parts.length ? parts.join(" · ") : undefined };
}

/**
 * 미들웨어용 — "로그인 안 한 방문자"와 "인증 백엔드가 죽어서 확인 불가"를 구분한다.
 * 후자를 세션 없음으로 오인하면 로그인해도 못 들어가는 리다이렉트만 반복된다.
 */
export function isAuthBackendDown(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  return kindOf(error) === "unavailable";
}
