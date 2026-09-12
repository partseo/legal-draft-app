declare module "@/lib/mcp/korean-law-registry.mjs" {
  import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

  export const TOOL_COUNTS: { exposed: number; total: number };
  export const allTools: Array<{
    name: string;
    description: string;
    schema: { shape: Record<string, unknown> };
    handler: (...args: unknown[]) => unknown;
  }>;
  export function registerTools(server: Server, apiClient: unknown): void;
}
