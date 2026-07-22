/** Managed Agents 에이전트 정의(mcp_servers[].url)에 넣을 korean-law MCP 완성 URL */
export function mcpServerUrl(env: { APP_PUBLIC_URL: string; MCP_SHARED_SECRET: string }): string {
  return `${env.APP_PUBLIC_URL}/api/mcp/korean-law/mcp?secret=${env.MCP_SHARED_SECRET}`;
}
