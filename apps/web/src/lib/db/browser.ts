"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/database.types";

/** 브라우저 전용 Supabase 클라이언트 (anon 키, 세션 쿠키 관리) */
export function createBrowser() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
