declare module "@/lib/mcp/korean-law-registry.mjs" {
  import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

  export const TOOL_COUNTS: { exposed: number; total: number };
  export function registerTools(server: Server, apiClient: unknown): void;
}
