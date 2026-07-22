import { buildRunDeps, requireUser } from "@/lib/runs/context";
import { syncRun } from "@/lib/runs/sync";
import { toUiEvents, type UiEvent } from "@/lib/runs/ui-events";
import { estimateRunCost, estimateTokens, computeRunningMs } from "@/lib/agent/usage";
import type { RuntimeEvent } from "@/lib/agent/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 플랫폼 한도 도달 시 스트림이 닫혀도 EventSource가 자동 재접속(리플레이 dedup)

export async function GET(_request: Request, ctx: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { runId } = await ctx.params;
  const deps = buildRunDeps();
  const run = await deps.store.getRun(runId);
  if (!run.agent_session_id) return new Response("no session", { status: 404 });
  const sessionId = run.agent_session_id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: UiEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      const seen = new Set<string>();
      const allEvents: RuntimeEvent[] = [];
      const emit = (e: RuntimeEvent, live: boolean) => {
        if (seen.has(e.id)) return;
        seen.add(e.id);
        allEvents.push(e);
        for (const ui of toUiEvents(e, { live })) send(ui);
      };
      const sendCost = () => {
        const outputTokens = allEvents.reduce((n, e) => (e.type === "message" ? n + estimateTokens(e.text) : n), 0);
        const runningMs = computeRunningMs(allEvents, new Date().toISOString());
        send({ kind: "cost", usd: estimateRunCost({ outputTokens, runningMs, model: deps.model }) });
      };
      const finish = async () => {
        const { status } = await syncRun(deps, runId);
        send({ kind: "status", runStatus: status });
        controller.close();
      };

      try {
        // 종결 run: 히스토리 리플레이만 하고 종료
        if (["succeeded", "failed", "canceled"].includes(run.status)) {
          for (const e of await deps.runtime.listEvents(sessionId)) emit(e, false);
          send({ kind: "status", runStatus: run.status });
          controller.close();
          return;
        }
        // 리플레이(advice 제외) → 라이브
        for (const e of await deps.runtime.listEvents(sessionId)) emit(e, false);
        sendCost();
        // 리플레이 시점에 이미 idle이면 즉시 정산 (라이브 스트림이 조용할 수 있음)
        const last = [...allEvents].reverse().find((e) => e.type === "status_idle" || e.type === "status_running");
        if (last?.type === "status_idle") {
          await finish();
          return;
        }
        for await (const e of deps.runtime.streamEvents(sessionId)) {
          emit(e, true);
          if (e.type === "message" || e.type === "tool_use") sendCost();
          if (e.type === "status_idle" || e.type === "error") {
            await finish();
            return;
          }
        }
        // 스트림이 원격에서 끝났으면 정산 시도 후 종료
        await finish();
      } catch {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
