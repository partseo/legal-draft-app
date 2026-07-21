// dev 서버 대상 MCP 왕복 검증: initialize → tools/list → tools/call(search_law)
// 사용: node scripts/test-mcp-endpoint.mjs http://localhost:3000 <MCP_SHARED_SECRET>
const [base, secret] = process.argv.slice(2);
if (!base || !secret) {
  console.error("usage: node scripts/test-mcp-endpoint.mjs <baseUrl> <secret>");
  process.exit(1);
}
const url = `${base}/api/mcp/korean-law/mcp`;

async function rpc(body, sessionId) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${secret}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // JSON 또는 SSE(data: ...) 응답 모두 수용
  const jsonLine = text.startsWith("event:") || text.startsWith("data:")
    ? text.split("\n").find((l) => l.startsWith("data:"))?.slice(5)
    : text;
  return {
    status: res.status,
    json: jsonLine ? JSON.parse(jsonLine) : null,
    sessionId: res.headers.get("mcp-session-id"),
  };
}

const init = await rpc({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "p1-test", version: "0" } },
});
console.log("initialize:", init.status, init.json?.result?.serverInfo?.name);
if (init.status !== 200) process.exit(1);

const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sessionId);
const names = (list.json?.result?.tools ?? []).map((t) => t.name).sort();
console.log("tools/list:", names.length, names.join(","));
const EXPECTED = ["discover_tools", "execute_tool", "get_annexes", "get_decision_text", "get_law_text", "legal_analysis", "legal_research", "search_decisions", "search_law"];
if (JSON.stringify(names) !== JSON.stringify(EXPECTED)) {
  console.error("FAIL: 노출 도구 9종 불일치");
  process.exit(1);
}

const call = await rpc({
  jsonrpc: "2.0", id: 3, method: "tools/call",
  params: { name: "search_law", arguments: { query: "근로기준법" } },
}, init.sessionId);
const text = call.json?.result?.content?.[0]?.text ?? "";
console.log("search_law:", call.status, text.slice(0, 120).replaceAll("\n", " "));
if (!text.includes("근로기준법")) {
  console.error("FAIL: search_law 결과에 '근로기준법' 없음");
  process.exit(1);
}
console.log("PASS: MCP 엔드포인트 3종 왕복 성공");
