import { describe, it, expect } from "vitest";
import { deriveStepStates, canStartStage, type PipelineInput } from "@/lib/pipeline";

// P5.5-5D — Stage Policy pipeline tests

type Run = PipelineInput["runs"][number];
type Review = PipelineInput["reviews"][number];

const run = (stage: Run["stage"], status: Run["status"], started: string): Run =>
  ({ id: `${stage}-${started}`, stage, status, started_at: started, finished_at: null }) as Run;
const review = (stage: Review["stage"], decision: Review["decision"], at: string): Review =>
  ({ stage, decision, created_at: at }) as Review;

const empty: PipelineInput = { runs: [], reviews: [], verifyHasFail: false };

describe("P5.5-5D: Stage Policy — skipped", () => {
  const withSkippedResearch: PipelineInput = {
    ...empty,
    stagePolicy: { research: "skipped" },
  };

  it("skipped stage auto-resolves to done", () => {
    const states = deriveStepStates(withSkippedResearch);
    expect(states.research).toBe("done");
  });

  it("skipped research → draft is runnable after intake approved", () => {
    const input: PipelineInput = {
      ...withSkippedResearch,
      runs: [run("intake", "succeeded", "2026-07-22T00:00:00Z")],
      reviews: [review("intake", "승인", "2026-07-22T01:00:00Z")],
    };
    const states = deriveStepStates(input);
    expect(states.intake).toBe("done");
    expect(states.research).toBe("done");
    expect(states.draft).toBe("runnable");
  });

  it("skipped stage cannot be started", () => {
    const input: PipelineInput = {
      ...withSkippedResearch,
      runs: [run("intake", "succeeded", "2026-07-22T00:00:00Z")],
      reviews: [review("intake", "승인", "2026-07-22T01:00:00Z")],
    };
    expect(canStartStage(input, "research")).toBe(false);
  });
});

describe("P5.5-5D: Stage Policy — optional", () => {
  const withOptionalResearch: PipelineInput = {
    ...empty,
    stagePolicy: { research: "optional" },
  };

  it("optional stage with no run → next stage is runnable (bypass)", () => {
    const input: PipelineInput = {
      ...withOptionalResearch,
      runs: [run("intake", "succeeded", "2026-07-22T00:00:00Z")],
      reviews: [review("intake", "승인", "2026-07-22T01:00:00Z")],
    };
    const states = deriveStepStates(input);
    expect(states.research).toBe("runnable");
    expect(states.draft).toBe("runnable");
  });

  it("optional stage that was run → must be approved to unlock next", () => {
    const input: PipelineInput = {
      ...withOptionalResearch,
      runs: [
        run("intake", "succeeded", "2026-07-22T00:00:00Z"),
        run("research", "succeeded", "2026-07-22T02:00:00Z"),
      ],
      reviews: [review("intake", "승인", "2026-07-22T01:00:00Z")],
    };
    const states = deriveStepStates(input);
    expect(states.research).toBe("action");
    expect(states.draft).toBe("locked");
  });
});

describe("P5.5-5D: Stage Policy — conditional verify", () => {
  const withConditionalVerify: PipelineInput = {
    ...empty,
    stagePolicy: { verify: "conditional" },
  };

  it("conditional verify with no run → bypass allowed", () => {
    const input: PipelineInput = {
      ...withConditionalVerify,
      runs: [
        run("intake", "succeeded", "1"),
        run("research", "succeeded", "2"),
        run("draft", "succeeded", "3"),
      ],
      reviews: [
        review("intake", "승인", "1.5"),
        review("research", "승인", "2.5"),
        review("draft", "승인", "3.5"),
      ],
    };
    expect(canStartStage(input, "verify")).toBe(true);
  });
});

describe("P5.5-5D: Stage Policy — no policy (backward compat)", () => {
  it("no stagePolicy → all stages required (existing behavior)", () => {
    const states = deriveStepStates(empty);
    expect(states.intake).toBe("runnable");
    expect(states.research).toBe("locked");
    expect(states.draft).toBe("locked");
    expect(states.verify).toBe("locked");
  });

  it("소장/준비서면 regression — standard pipeline unaffected", () => {
    const input: PipelineInput = {
      ...empty,
      runs: [run("intake", "succeeded", "2026-07-22T00:00:00Z")],
      reviews: [review("intake", "승인", "2026-07-22T01:00:00Z")],
    };
    const states = deriveStepStates(input);
    expect(states.intake).toBe("done");
    expect(states.research).toBe("runnable");
    expect(states.draft).toBe("locked");
  });
});
