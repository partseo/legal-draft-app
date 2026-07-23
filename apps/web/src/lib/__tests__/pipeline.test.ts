import { describe, it, expect } from "vitest";
import { deriveStepStates, canStartStage, deriveCaseStatus, rerunKind, type PipelineInput } from "@/lib/pipeline";

type Run = PipelineInput["runs"][number];
type Review = PipelineInput["reviews"][number];

const run = (stage: Run["stage"], status: Run["status"], started: string): Run =>
  ({ id: `${stage}-${started}`, stage, status, started_at: started, finished_at: null }) as Run;
const review = (stage: Review["stage"], decision: Review["decision"], at: string): Review =>
  ({ stage, decision, created_at: at }) as Review;

const empty: PipelineInput = { runs: [], reviews: [], verifyHasFail: false };

describe("deriveStepStates", () => {
  it("초기: intake만 runnable, 나머지 locked", () => {
    const s = deriveStepStates(empty);
    expect(s.intake).toBe("runnable");
    expect(s.research).toBe("locked");
    expect(s.verify).toBe("locked");
  });

  it("intake succeeded 미승인 → action(검수 대기), research는 locked 유지", () => {
    const s = deriveStepStates({ ...empty, runs: [run("intake", "succeeded", "2026-07-22T00:00:00Z")] });
    expect(s.intake).toBe("action");
    expect(s.research).toBe("locked");
  });

  it("intake 승인 → done + research runnable", () => {
    const s = deriveStepStates({
      ...empty,
      runs: [run("intake", "succeeded", "2026-07-22T00:00:00Z")],
      reviews: [review("intake", "승인", "2026-07-22T01:00:00Z")],
    });
    expect(s.intake).toBe("done");
    expect(s.research).toBe("runnable");
  });

  it("승인이 run보다 과거면(재실행 후) 무효", () => {
    const s = deriveStepStates({
      ...empty,
      runs: [run("intake", "succeeded", "2026-07-22T02:00:00Z")],
      reviews: [review("intake", "승인", "2026-07-22T01:00:00Z")],
    });
    expect(s.intake).toBe("action");
  });

  it("waiting_checkpoint → action, failed → fail", () => {
    expect(deriveStepStates({ ...empty, runs: [run("intake", "waiting_checkpoint", "1")] }).intake).toBe("action");
    expect(deriveStepStates({ ...empty, runs: [run("intake", "failed", "1")] }).intake).toBe("fail");
  });

  it("verify succeeded + FAIL 보고 → fail", () => {
    const s = deriveStepStates({
      runs: [run("verify", "succeeded", "2026-07-22T00:00:00Z")],
      reviews: [],
      verifyHasFail: true,
    });
    expect(s.verify).toBe("fail");
  });
});

describe("canStartStage", () => {
  it("실행 중이면 어떤 단계도 시작 불가", () => {
    const input = { ...empty, runs: [run("intake", "running", "1")] };
    expect(canStartStage(input, "intake")).toBe(false);
    expect(canStartStage(input, "research")).toBe(false);
  });

  it("succeeded 단계는 재실행 가능(수정지시)", () => {
    const input = { ...empty, runs: [run("intake", "succeeded", "1")] };
    expect(canStartStage(input, "intake")).toBe(true);
  });

  it("locked 단계는 불가", () => {
    expect(canStartStage(empty, "draft")).toBe(false);
  });
});

describe("rerunKind", () => {
  it("startable false → 항상 null (실행 중이거나 잠김)", () => {
    expect(rerunKind("fail", false)).toBe(null);
    expect(rerunKind("done", false)).toBe(null);
    expect(rerunKind("action", false)).toBe(null);
  });

  it("fail → retry (큰 다시 시도 버튼)", () => {
    expect(rerunKind("fail", true)).toBe("retry");
  });

  it("done/action → rerun (작은 아이콘 + confirm)", () => {
    expect(rerunKind("done", true)).toBe("rerun");
    expect(rerunKind("action", true)).toBe("rerun");
  });

  it("runnable/locked/running → null (기존 실행 버튼 또는 버튼 없음)", () => {
    expect(rerunKind("runnable", true)).toBe(null);
    expect(rerunKind("locked", true)).toBe(null);
    expect(rerunKind("running", true)).toBe(null);
  });
});

describe("deriveCaseStatus", () => {
  it("우선순위: 실행중 > 응답 필요 > 제출 금지 > 완료 > 검수 대기 > 대기", () => {
    expect(deriveCaseStatus(empty)).toBe("대기");
    expect(deriveCaseStatus({ ...empty, runs: [run("intake", "running", "1")] })).toBe("실행중");
    expect(deriveCaseStatus({ ...empty, runs: [run("intake", "waiting_checkpoint", "1")] })).toBe("응답 필요");
    expect(deriveCaseStatus({ ...empty, runs: [run("intake", "succeeded", "1")] })).toBe("검수 대기");
    expect(
      deriveCaseStatus({
        runs: [run("verify", "succeeded", "1")],
        reviews: [review("verify", "승인", "2")],
        verifyHasFail: false,
      }),
    ).toBe("완료");
    expect(deriveCaseStatus({ runs: [run("verify", "succeeded", "1")], reviews: [], verifyHasFail: true })).toBe(
      "제출 금지",
    );
  });
});
