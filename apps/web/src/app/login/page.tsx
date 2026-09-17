"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale, TriangleAlert } from "lucide-react";
import { createBrowser } from "@/lib/db/browser";
import { classifyAuthError, type AuthErrorInfo } from "@/lib/auth/login-error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthErrorInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const badCredentials = error?.kind === "credentials";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(classifyAuthError(error));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-page">
      <form
        onSubmit={onSubmit}
        className="flex w-[420px] flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-10"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Scale className="size-[22px] text-app-primary" />
            <span className="text-lg font-semibold text-neutral-950">법률문서 작성기</span>
          </div>
          <p className="text-[13px] leading-normal text-neutral-500">
            AI가 작성한 초안 — 변호사 검수 전 제출 금지
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-950">이메일</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@firm.co.kr"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-app-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-950">비밀번호</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`rounded-md border bg-white px-3 py-2.5 text-sm outline-none focus:border-app-primary ${
              badCredentials ? "border-st-block" : "border-neutral-200"
            }`}
          />
          {badCredentials && <span className="text-xs text-st-block">{error.message}</span>}
        </label>
        {error && !badCredentials && (
          <div className="flex gap-2 rounded-md bg-st-action-bg p-3 text-st-action">
            <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <span className="text-xs leading-normal">{error.message}</span>
              {error.detail && <span className="text-[11px] opacity-70">{error.detail}</span>}
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-app-primary px-3 py-[11px] text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "로그인 중…" : "로그인"}
        </button>
        <p className="text-center text-xs text-neutral-500">계정은 관리자 초대로만 생성됩니다</p>
      </form>
    </div>
  );
}
