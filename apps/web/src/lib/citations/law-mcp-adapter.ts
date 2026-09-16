export type LawTextResult = {
  success: boolean;
  source: "mcp" | "official_fallback" | "unavailable";
  law_name?: string;
  mst?: string;
  effective_date?: string;
  text?: string;
  text_hash?: string;
  error?: string;
};

export type McpGetLawTextFn = (params: {
  mst: string;
  jo?: string;
}) => Promise<{ text?: string; error?: string }>;

export type OfficialFallbackFn = (params: {
  mst: string;
  jo?: string;
}) => Promise<{
  success: boolean;
  law_name?: string;
  effective_date?: string;
  text?: string;
  error?: string;
}>;

export async function getLawTextWithFallback(
  mst: string,
  jo: string | undefined,
  mcpFn: McpGetLawTextFn,
  fallbackFn: OfficialFallbackFn,
): Promise<LawTextResult> {
  const mcpResult = await mcpFn({ mst, jo });

  if (mcpResult.text && mcpResult.text.trim().length > 0) {
    return {
      success: true,
      source: "mcp",
      mst,
      text: mcpResult.text,
    };
  }

  const fallbackResult = await fallbackFn({ mst, jo });

  if (fallbackResult.success && fallbackResult.text && fallbackResult.text.trim().length > 0) {
    return {
      success: true,
      source: "official_fallback",
      mst,
      law_name: fallbackResult.law_name,
      effective_date: fallbackResult.effective_date,
      text: fallbackResult.text,
    };
  }

  return {
    success: false,
    source: "unavailable",
    mst,
    error: fallbackResult.error ?? mcpResult.error ?? "본문을 가져올 수 없음",
  };
}
