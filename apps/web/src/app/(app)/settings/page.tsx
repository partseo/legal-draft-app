import Link from "next/link";
import { Bot, ChevronDown, Info, Landmark, MoreHorizontal, Plug } from "lucide-react";
import { createRouteClient, createServiceClient } from "@/lib/db/clients";
import { getEnv } from "@/lib/env";
import { computeHealth } from "@/lib/health";
import { TOOL_COUNTS } from "@/lib/mcp/korean-law-registry.mjs";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

const TABS = ["멤버", "연동 상태", "사용량"] as const;
type Tab = (typeof TABS)[number];

const TAB_SUBTITLE: Record<Tab, string> = {
  멤버: "워크스페이스 멤버와 연동을 관리합니다",
  "연동 상태": "외부 서비스 연동 상태를 확인합니다",
  사용량: "이번 달 실행 비용과 토큰 사용량입니다",
};

function StatusPill({ ok, okLabel = "정상", badLabel = "미설정" }: { ok: boolean; okLabel?: string; badLabel?: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-3 py-[5px] text-xs font-semibold ${
        ok ? "bg-st-done-bg text-st-done" : "bg-st-action-bg text-st-action"
      }`}
    >
      <span className={`size-[7px] rounded-full ${ok ? "bg-st-done" : "bg-st-action"}`} />
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "멤버";

  const supabase = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const isAdmin = me?.role === "admin";

  return (
    <div className="flex flex-col gap-6 px-10 py-9">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-950">설정</h1>
        <p className="text-sm text-neutral-500">{TAB_SUBTITLE[tab]}</p>
      </div>

      <div className="flex gap-7 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/settings?tab=${encodeURIComponent(t)}`}
            className={`px-0.5 pb-3 text-sm ${
              t === tab
                ? "-mb-px border-b-2 border-app-primary font-semibold text-app-primary"
                : "font-medium text-neutral-500"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {tab === "멤버" && <MembersTab isAdmin={isAdmin} />}
      {tab === "연동 상태" && <IntegrationsTab />}
      {tab === "사용량" && <UsageTab />}
    </div>
  );
}

async function MembersTab({ isAdmin }: { isAdmin: boolean }) {
  const service = createServiceClient();
  const { data: profiles } = await service.from("profiles").select("id, display_name, role").order("created_at");
  const { data: usersData } = await service.auth.admin.listUsers();
  const emailById = new Map(usersData?.users.map((u) => [u.id, u.email ?? ""]) ?? []);

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <span className="text-base font-semibold text-neutral-950">멤버</span>
          {isAdmin && <InviteForm />}
        </div>
        <div className="flex items-center gap-4 border-b border-neutral-100 bg-neutral-50 px-5 py-2.5 text-xs font-semibold text-neutral-500">
          <span className="w-[200px]">이름</span>
          <span className="w-[300px]">이메일</span>
          <span className="w-[160px]">역할</span>
          <span className="w-[150px]">상태</span>
          <span className="flex-1" />
        </div>
        {(profiles ?? []).map((p, i) => {
          const email = emailById.get(p.id);
          const confirmed = Boolean(usersData?.users.find((u) => u.id === p.id)?.email_confirmed_at);
          return (
            <div
              key={p.id}
              className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-neutral-100" : ""}`}
            >
              <span className="w-[200px] text-sm font-medium text-neutral-950">{p.display_name}</span>
              <span className="w-[300px] text-sm text-zinc-600">{email}</span>
              <span className="flex w-[160px] items-center justify-between gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-[13px] text-neutral-950">
                {p.role === "admin" ? "관리자" : "멤버"}
                <ChevronDown className="size-3.5 text-zinc-400" />
              </span>
              <span className="w-[150px]">
                <StatusPill ok={confirmed} okLabel="활성" badLabel="초대 대기" />
              </span>
              <span className="flex flex-1 justify-end">
                <MoreHorizontal className="size-[18px] text-zinc-400" />
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-neutral-500">역할 변경과 초대는 관리자만 가능합니다.</p>
    </>
  );
}

async function IntegrationsTab() {
  const env = getEnv();
  const health = await computeHealth(env);
  const anthropicSet = Boolean(env.ANTHROPIC_API_KEY);
  const mcpOk = TOOL_COUNTS.exposed === 9;

  const rows = [
    {
      icon: Bot,
      name: "Anthropic API",
      sub: anthropicSet ? "API 키 · sk-ant-••••••••••••" : "API 키 미설정 — P2(에이전트 실행)부터 필요",
      ok: anthropicSet,
    },
    {
      icon: Landmark,
      name: "국가법령정보센터 (LAW_OC)",
      sub: health.checks.lawOc ? "OpenAPI 연동 · 키 설정됨" : "LAW_OC 미설정",
      ok: health.checks.lawOc,
    },
    {
      icon: Plug,
      name: "korean-law MCP 래퍼",
      sub: mcpOk ? `도구 ${TOOL_COUNTS.exposed}종 노출 · 등록부 정상` : "도구 등록부 이상",
      ok: mcpOk,
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white px-5 py-[18px]">
            <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
              <r.icon className="size-5 text-zinc-600" />
            </span>
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-[15px] font-semibold text-neutral-950">{r.name}</span>
              <span className="text-[13px] text-neutral-500">{r.sub}</span>
            </span>
            <StatusPill ok={r.ok} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2.5 rounded-lg bg-neutral-100 px-4 py-3.5">
        <Info className="size-4 text-neutral-500" />
        <span className="text-[13px] text-zinc-600">실행 세션 데이터는 Anthropic Managed Agents 서버에 보관됩니다.</span>
      </div>
    </>
  );
}

async function UsageTab() {
  const supabase = await createRouteClient();
  const { data: runs } = await supabase.from("runs").select("input_tokens, output_tokens, cost_usd, round_id");

  const totalCost = (runs ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  const count = runs?.length ?? 0;
  const avg = count > 0 ? totalCost / count : 0;

  return (
    <>
      <div className="flex gap-4">
        {[
          ["이번 달 비용", `$${totalCost.toFixed(2)}`],
          ["실행 횟수", `${count}회`],
          ["평균 단계 비용", `$${avg.toFixed(2)}`],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-1 flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-5">
            <span className="text-[13px] text-neutral-500">{label}</span>
            <span className="text-[28px] font-semibold text-neutral-950">{value}</span>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="flex items-center gap-4 border-b border-neutral-100 bg-neutral-50 px-5 py-3.5 text-xs font-semibold text-neutral-500">
          <span className="flex-1">사건</span>
          <span className="w-[120px] text-right">실행 수</span>
          <span className="w-[170px] text-right">토큰</span>
          <span className="w-[120px] text-right">비용</span>
        </div>
        <div className="px-5 py-10 text-center text-sm text-neutral-500">
          아직 실행 데이터가 없습니다 — 에이전트 실행(P2)부터 집계됩니다.
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-5 py-[18px]">
        <span className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold text-neutral-950">단계당 비용 상한</span>
          <span className="text-[13px] text-neutral-500">단계 실행 비용이 상한을 넘으면 자동으로 중단됩니다. (P2에서 적용)</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-[110px] rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-950">$5.00</span>
          <button className="rounded-md bg-app-primary px-[18px] py-2 text-sm font-medium text-white">저장</button>
        </span>
      </div>
    </>
  );
}
