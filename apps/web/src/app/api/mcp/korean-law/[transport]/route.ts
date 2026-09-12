import { createMcpHandler } from "mcp-handler";
import { LawApiClient } from "korean-law-mcp/lib/api-client";
import { registerTools } from "@/lib/mcp/korean-law-registry.mjs";
import { checkMcpAuth } from "@/lib/mcp/auth";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    const apiClient = new LawApiClient({ apiKey: getEnv().LAW_OC });
    registerTools(server.server, apiClient);
  },
  {
    capabilities: { tools: {} },
    serverInfo: { name: "korean-law", version: "4.13.0" },
  },
  {
    basePath: "/api/mcp/korean-law",
    maxDuration: 60,
    disableSse: true,
  },
);

async function guarded(request: Request): Promise<Response> {
  if (!checkMcpAuth(request, getEnv().MCP_SHARED_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return handler(request);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
