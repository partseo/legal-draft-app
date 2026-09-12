import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { computeHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let health;
  try {
    health = await computeHealth(getEnv());
  } catch {
    health = { ok: false, checks: { env: false, supabase: false, lawOc: false } };
  }
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
