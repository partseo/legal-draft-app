import { describe, it, expect } from "vitest";
import { toUiEvents } from "@/lib/runs/ui-events";
import type { RuntimeEvent } from "@/lib/agent/adapter";

const ADVICE_MSG: RuntimeEvent = {
  id: "e1",
  at: null,
  type: "message",
  text: '검증 완료.\n```senior-advice\n조언 한 줄.\n```\n```run-complete\n{"files":[]}\n```',
};

describe("toUiEvents", () => {
  it("message → timeline(조언 제거된 텍스트)", () => {
    const evs = toUiEvents(ADVICE_MSG, { live: false });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ kind: "timeline", state: "done" });
    expect((evs[0] as { text: string }).text).not.toContain("조언 한 줄");
  });

  it("live에서만 advice 이벤트 추가", () => {
    const evs = toUiEvents(ADVICE_MSG, { live: true });
    expect(evs.some((e) => e.kind === "advice")).toBe(true);
    const replay = toUiEvents(ADVICE_MSG, { live: false });
    expect(replay.some((e) => e.kind === "advice")).toBe(false);
  });

  it("tool_use → timeline running 표기", () => {
    const evs = toUiEvents({ id: "e2", at: null, type: "tool_use", name: "bash", inputSummary: "{}" }, { live: true });
    expect(evs[0]).toMatchObject({ kind: "timeline", text: "도구 실행: bash" });
  });

  it("status/checkpoint 계열은 timeline 생성 안 함", () => {
    expect(toUiEvents({ id: "e3", at: null, type: "status_idle" }, { live: true })).toEqual([]);
  });
});
