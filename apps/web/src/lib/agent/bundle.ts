import bundleData from "@/lib/agent/bundle-data.json";

export type AgentBundle = { hash: string; files: string[]; tarGz: Uint8Array };

/** prebuild가 생성한 번들. 원천 수정 후에는 npm run bundle 재실행 필요. */
export function loadBundle(): AgentBundle {
  const { hash, files, tarGzBase64 } = bundleData as { hash: string; files: string[]; tarGzBase64: string };
  return { hash, files, tarGz: new Uint8Array(Buffer.from(tarGzBase64, "base64")) };
}
