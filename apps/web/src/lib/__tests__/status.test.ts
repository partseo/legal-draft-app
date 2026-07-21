import { describe, it, expect } from "vitest";
import { caseStatusTone, progressFromStatus } from "@/lib/status";

describe("caseStatusTone", () => {
  it.each([
    ["대기", "wait"],
    ["실행중", "run"],
    ["응답 필요", "action"],
    ["검수 대기", "action"],
    ["제출 금지", "block"],
    ["완료", "done"],
  ] as const)("%s → %s", (status, tone) => {
    expect(caseStatusTone(status)).toBe(tone);
  });

  it("알 수 없는 상태는 wait", () => {
    expect(caseStatusTone("이상한값")).toBe("wait");
  });
});

describe("progressFromStatus", () => {
  it("완료·제출금지는 4, 대기는 0", () => {
    expect(progressFromStatus("완료")).toBe(4);
    expect(progressFromStatus("제출 금지")).toBe(4);
    expect(progressFromStatus("대기")).toBe(0);
  });
});
