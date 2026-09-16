import { describe, it, expect } from "vitest";
import {
  getLawTextWithFallback,
  type McpGetLawTextFn,
  type OfficialFallbackFn,
} from "@/lib/citations/law-mcp-adapter";

describe("D-05: MCP 대통령령 본문 미반환 fallback", () => {
  const emptyMcp: McpGetLawTextFn = async () => ({ text: "" });

  const workingMcp: McpGetLawTextFn = async () => ({
    text: "제1조의2(법정이율) ① 금전채무의 전부 또는 일부의 이행을 지체한 경우 연 100분의 12로 한다.",
  });

  const officialFallback: OfficialFallbackFn = async () => ({
    success: true,
    law_name: "소송촉진 등에 관한 특례법 제3조제1항 본문의 법정이율에 관한 규정",
    effective_date: "2019-06-01",
    text: "제1조의2(법정이율) ① 금전채무의 전부 또는 일부의 이행을 지체한 경우 연 100분의 12로 한다.",
  });

  const failingFallback: OfficialFallbackFn = async () => ({
    success: false,
    error: "국가법령정보센터 접속 실패",
  });

  describe("getLawTextWithFallback", () => {
    it("get_law_text(mst=208701)가 빈 본문을 반환하면 MCP 단독으로는 실패", async () => {
      const result = await getLawTextWithFallback(
        "208701",
        undefined,
        emptyMcp,
        failingFallback,
      );

      expect(result.success).toBe(false);
      expect(result.source).toBe("unavailable");
    });

    it("MCP 빈 응답 시 공식 fallback을 시도한다", async () => {
      const result = await getLawTextWithFallback(
        "208701",
        undefined,
        emptyMcp,
        officialFallback,
      );

      expect(result.source).toBe("official_fallback");
      expect(result.text).toContain("연 100분의 12");
    });

    it("MCP가 정상 응답하면 fallback 불필요", async () => {
      const result = await getLawTextWithFallback(
        "208701",
        undefined,
        workingMcp,
        failingFallback,
      );

      expect(result.success).toBe(true);
      expect(result.source).toBe("mcp");
      expect(result.text).toContain("연 100분의 12");
    });

    it("MCP·fallback 모두 실패하면 success=false, source=unavailable", async () => {
      const result = await getLawTextWithFallback(
        "208701",
        undefined,
        emptyMcp,
        failingFallback,
      );

      expect(result.success).toBe(false);
      expect(result.source).toBe("unavailable");
    });

    it("출처 없이 연 12%를 반환하면 FAIL (하드코딩 방지)", async () => {
      const result = await getLawTextWithFallback(
        "208701",
        undefined,
        emptyMcp,
        failingFallback,
      );

      expect(result.success).toBe(false);
      expect(result.text).toBeUndefined();
      expect(result.source).toBe("unavailable");
    });
  });
});
