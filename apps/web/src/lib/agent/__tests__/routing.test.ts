import { describe, it, expect } from "vitest";
import { buildKickoffPrompt, type RoundKind } from "@/lib/agent/prompts";
import { listDocumentTypes, getDraftSkill, getVerifySkill } from "@/lib/agent/document-types";

const kick = (stage: "intake" | "research" | "draft" | "verify", roundKind: string) =>
  buildKickoffPrompt({ stage, roundKind: roundKind as RoundKind });

const ROUTING_CONTRACT: Record<string, { draft: string; verify: string }> = {
  소장: { draft: "draft-complaint", verify: "verify-citations" },
  준비서면: { draft: "draft-brief", verify: "verify-citations" },
  내용증명: { draft: "draft-demand-letter", verify: "verify-citations" },
  가압류신청서: { draft: "draft-injunction", verify: "verify-citations" },
  가처분신청서: { draft: "draft-injunction", verify: "verify-citations" },
  강제집행신청서: { draft: "draft-execution", verify: "verify-citations" },
  등기신청서_소유권이전: { draft: "draft-registration", verify: "check-registration" },
  등기신청서_근저당설정: { draft: "draft-registration", verify: "check-registration" },
  등기신청서_법인변경: { draft: "draft-registration", verify: "check-registration" },
  개인회생신청서: { draft: "draft-rehabilitation", verify: "verify-citations" },
  파산면책신청서: { draft: "draft-bankruptcy", verify: "verify-citations" },
};

const SUB_OUTPUTS = ["채권자목록", "재산목록", "수입지출목록", "변제계획안"] as const;

describe("Runtime Skill Routing", () => {
  describe("11개 최상위 문서 유형 draft 라우팅", () => {
    for (const [roundKind, expected] of Object.entries(ROUTING_CONTRACT)) {
      it(`draft ${roundKind} → ${expected.draft}`, () => {
        const prompt = kick("draft", roundKind);
        expect(prompt).toContain(`skills/${expected.draft}/SKILL.md`);
      });
    }
  });

  describe("등기 3종 verify → check-registration", () => {
    for (const id of ["등기신청서_소유권이전", "등기신청서_근저당설정", "등기신청서_법인변경"]) {
      it(`verify ${id} → check-registration`, () => {
        const prompt = kick("verify", id);
        expect(prompt).toContain("skills/check-registration/SKILL.md");
      });
    }
  });

  describe("나머지 문서 유형 verify → verify-citations", () => {
    const nonRegistration = Object.entries(ROUTING_CONTRACT)
      .filter(([, v]) => v.verify === "verify-citations")
      .map(([k]) => k);
    for (const id of nonRegistration) {
      it(`verify ${id} → verify-citations`, () => {
        const prompt = kick("verify", id);
        expect(prompt).toContain("skills/verify-citations/SKILL.md");
      });
    }
  });

  describe("intake/research 기존 매핑 보존", () => {
    it("intake → case-intake (모든 문서 유형)", () => {
      for (const roundKind of Object.keys(ROUTING_CONTRACT)) {
        const prompt = kick("intake", roundKind);
        expect(prompt).toContain("skills/case-intake/SKILL.md");
      }
    });

    it("research → legal-research (모든 문서 유형)", () => {
      for (const roundKind of Object.keys(ROUTING_CONTRACT)) {
        const prompt = kick("research", roundKind);
        expect(prompt).toContain("skills/legal-research/SKILL.md");
      }
    });
  });

  describe("알 수 없는 문서 유형 Fail-Closed", () => {
    it("draft에서 알 수 없는 roundKind → 오류", () => {
      expect(() => kick("draft", "존재하지_않는_유형")).toThrow();
    });

    it("verify에서 알 수 없는 roundKind → 오류", () => {
      expect(() => kick("verify", "존재하지_않는_유형")).toThrow();
    });
  });

  describe("하위 산출물 독립 라우팅 거부", () => {
    for (const sub of SUB_OUTPUTS) {
      it(`draft ${sub} → 오류`, () => {
        expect(() => kick("draft", sub)).toThrow();
      });

      it(`verify ${sub} → 오류`, () => {
        expect(() => kick("verify", sub)).toThrow();
      });
    }
  });

  describe("기존 소장·준비서면 prompt 회귀 없음", () => {
    it("소장 draft prompt는 draft-complaint 스킬을 참조한다", () => {
      const prompt = kick("draft", "소장");
      expect(prompt).toContain("skills/draft-complaint/SKILL.md");
      expect(prompt).toContain("서면작성 단계 실행");
      expect(prompt).toContain("tar xzf");
      expect(prompt).toContain("pip install docxtpl");
      expect(prompt).toContain("run-complete");
    });

    it("준비서면 draft prompt는 draft-brief 스킬을 참조한다", () => {
      const prompt = kick("draft", "준비서면");
      expect(prompt).toContain("skills/draft-brief/SKILL.md");
      expect(prompt).toContain("서면작성 단계 실행");
    });

    it("소장 intake prompt는 case-intake를 참조한다", () => {
      const prompt = kick("intake", "소장");
      expect(prompt).toContain("skills/case-intake/SKILL.md");
      expect(prompt).toContain("사건구성 단계 실행");
    });
  });

  describe("Registry와 런타임 테스트 매핑 간 누락 없음", () => {
    it("Registry의 모든 최상위 유형이 테스트 매핑에 포함된다", () => {
      const registryIds = listDocumentTypes().map((t) => t.id);
      const testIds = Object.keys(ROUTING_CONTRACT);
      expect(testIds.sort()).toEqual(registryIds.sort());
    });

    it("Registry draftSkill과 테스트 매핑이 일치한다", () => {
      for (const [id, expected] of Object.entries(ROUTING_CONTRACT)) {
        expect(getDraftSkill(id)).toBe(expected.draft);
      }
    });

    it("Registry verifySkill과 테스트 매핑이 일치한다", () => {
      for (const [id, expected] of Object.entries(ROUTING_CONTRACT)) {
        expect(getVerifySkill(id)).toBe(expected.verify);
      }
    });
  });
});
