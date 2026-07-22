// Managed Agents 베타 REST 접근 헬퍼 — managed-runtime.ts 전용.
const BASE = "https://api.anthropic.com";

export function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "managed-agents-2026-04-01",
  };
}

export async function anthropicJson<T>(
  apiKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...anthropicHeaders(apiKey),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export async function anthropicUpload(
  apiKey: string,
  filename: string,
  content: Uint8Array,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", new Blob([content as BlobPart]), filename);
  const res = await fetch(`${BASE}/v1/files`, { method: "POST", headers: anthropicHeaders(apiKey), body: form });
  if (!res.ok) throw new Error(`Anthropic 파일 업로드 실패 ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return (await res.json()) as { id: string };
}

export async function anthropicDownload(apiKey: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/v1/files/${fileId}/content`, { headers: anthropicHeaders(apiKey) });
  if (!res.ok) throw new Error(`Anthropic 파일 다운로드 실패 ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** SSE 스트림 → {event, data} 시퀀스. 청크 경계·멀티라인 data 처리. */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event?: string; data: string }> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
        let event: string | undefined;
        const data: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length > 0) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
