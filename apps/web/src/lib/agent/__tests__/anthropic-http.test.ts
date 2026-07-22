import { describe, it, expect, vi, afterEach } from "vitest";
import { anthropicJson, anthropicHeaders, parseSseStream } from "@/lib/agent/anthropic-http";

afterEach(() => vi.unstubAllGlobals());

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe("anthropicHeaders", () => {
  it("베타·버전·키 헤더를 만든다", () => {
    expect(anthropicHeaders("sk-x")).toEqual({
      "x-api-key": "sk-x",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "managed-agents-2026-04-01",
    });
  });
});

describe("anthropicJson", () => {
  it("JSON 요청/응답 왕복", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "agt_1" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await anthropicJson<{ id: string }>("sk-x", "POST", "/v1/agents", { name: "n" });
    expect(out.id).toBe("agt_1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/agents");
    expect(init.headers["anthropic-beta"]).toBe("managed-agents-2026-04-01");
    expect(JSON.parse(init.body)).toEqual({ name: "n" });
  });

  it("비2xx면 상태·본문을 담아 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));
    await expect(anthropicJson("sk-x", "GET", "/v1/agents/x")).rejects.toThrow(/403.*nope/s);
  });
});

describe("parseSseStream", () => {
  it("청크 경계와 무관하게 event/data를 조립한다", async () => {
    const s = sseStream(["event: agent.mess", "age\ndata: {\"a\":1}\n\nda", "ta: {\"b\":2}\n\n"]);
    const got: { event?: string; data: string }[] = [];
    for await (const e of parseSseStream(s)) got.push(e);
    expect(got).toEqual([
      { event: "agent.message", data: '{"a":1}' },
      { event: undefined, data: '{"b":2}' },
    ]);
  });

  it("멀티라인 data를 이어붙인다", async () => {
    const s = sseStream(["data: line1\ndata: line2\n\n"]);
    const got = [];
    for await (const e of parseSseStream(s)) got.push(e);
    expect(got[0].data).toBe("line1\nline2");
  });
});
