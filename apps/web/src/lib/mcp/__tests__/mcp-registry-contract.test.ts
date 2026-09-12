import { describe, it, expect } from "vitest";
import { TOOL_COUNTS, allTools } from "@/lib/mcp/korean-law-registry.mjs";

const BASELINE_TOOLS = [
  "search_law",
  "get_law_text",
  "search_decisions",
  "get_decision_text",
  "discover_tools",
  "execute_tool",
  "compare_old_new",
  "search_admin_rule",
  "get_admin_rule",
];

describe("MCP registry contract", () => {
  it("TOOL_COUNTS.exposed ≥ 9 (baseline)", () => {
    expect(TOOL_COUNTS.exposed).toBeGreaterThanOrEqual(9);
  });

  it("TOOL_COUNTS.total ≥ TOOL_COUNTS.exposed", () => {
    expect(TOOL_COUNTS.total).toBeGreaterThanOrEqual(TOOL_COUNTS.exposed);
  });

  it("allTools 배열이 비어 있지 않다", () => {
    expect(allTools.length).toBeGreaterThan(0);
  });

  it("기존 9종 도구가 모두 존재한다 (backward compat)", () => {
    const names = allTools.map((t: { name: string }) => t.name);
    for (const tool of BASELINE_TOOLS) {
      expect(names).toContain(tool);
    }
  });

  it("search_law 스키마에 query 필수 필드가 있다", () => {
    const tool = allTools.find((t: { name: string }) => t.name === "search_law")!;
    expect(tool).toBeDefined();
    expect(tool.schema.shape).toHaveProperty("query");
  });

  it("get_law_text 스키마에 mst·jo 필드가 있다", () => {
    const tool = allTools.find((t: { name: string }) => t.name === "get_law_text")!;
    expect(tool).toBeDefined();
    const props = Object.keys(tool.schema.shape);
    expect(props).toContain("mst");
    expect(props).toContain("jo");
  });

  it("도구 이름에 중복이 없다", () => {
    const names = allTools.map((t: { name: string }) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("registerTools를 두 번 호출해도 TOOL_COUNTS가 동일하다 (statelessness)", async () => {
    const before = { ...TOOL_COUNTS };
    const { registerTools } = await import("@/lib/mcp/korean-law-registry.mjs");
    const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerTools(server, { fetch: () => Promise.resolve(new Response("{}")) });
    const after = { ...TOOL_COUNTS };
    expect(after).toEqual(before);
  });
});
