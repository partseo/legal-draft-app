"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { createBrowser } from "@/lib/db/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다");
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
            <span className="text-lg font-semibold text-neutral-950">송무서면 생성기</span>
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
              error ? "border-st-block" : "border-neutral-200"
            }`}
          />
          {error && <span className="text-xs text-st-block">{error}</span>}
        </label>
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
