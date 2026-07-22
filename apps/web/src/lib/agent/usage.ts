import type { RuntimeEvent } from "@/lib/agent/adapter";

/** USD per 1M tokens. 요율 개정 시 여기만 수정. */
export const MODEL_RATES: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  "claude-sonnet-5": { inPerMTok: 3, outPerMTok: 15 },
  "claude-opus-4-8": { inPerMTok: 15, outPerMTok: 75 },
};
const COMPUTE_USD_PER_HOUR = 0.08;
/** 입력측(히스토리 재전송 등)을 계측할 수 없어 출력 비용에 2배 마진 */
const UNMEASURED_INPUT_MARGIN = 2;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/** status_running→status_idle 구간(ms) 합산. 열린 구간은 now까지. at 없는 이벤트 무시. */
export function computeRunningMs(events: RuntimeEvent[], nowIso: string): number {
  let total = 0;
  let openStart: number | null = null;
  for (const e of events) {
    if (!e.at) continue;
    const t = Date.parse(e.at);
    if (e.type === "status_running" && openStart === null) openStart = t;
    if (e.type === "status_idle" && openStart !== null) {
      total += Math.max(0, t - openStart);
      openStart = null;
    }
  }
  if (openStart !== null) total += Math.max(0, Date.parse(nowIso) - openStart);
  return total;
}

export function estimateRunCost(i: { outputTokens: number; runningMs: number; model: string }): number {
  const rates = MODEL_RATES[i.model] ?? MODEL_RATES["claude-opus-4-8"];
  const tokenCost = (i.outputTokens / 1_000_000) * rates.outPerMTok * UNMEASURED_INPUT_MARGIN;
  const computeCost = (i.runningMs / 3_600_000) * COMPUTE_USD_PER_HOUR;
  return Math.round((tokenCost + computeCost) * 10_000) / 10_000;
}
