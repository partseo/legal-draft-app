import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
const CURSOR_VERSION = 1;

export function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION, ua: updatedAt, id }),
  ).toString("base64url");
}

export function decodeCursor(cursor: string): {
  updatedAt: string;
  id: string;
} {
  if (!cursor) throw new Error("cursor must be a non-empty string");

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
  } catch {
    throw new Error("invalid cursor: malformed encoding");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("v" in parsed) ||
    !("ua" in parsed) ||
    !("id" in parsed)
  ) {
    throw new Error("invalid cursor: missing required fields");
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.v !== CURSOR_VERSION) {
    throw new Error(`invalid cursor: unsupported version ${obj.v}`);
  }
  if (typeof obj.ua !== "string") {
    throw new Error("invalid cursor: updatedAt must be a string");
  }
  if (typeof obj.id !== "string") {
    throw new Error("invalid cursor: id must be a string");
  }

  return { updatedAt: obj.ua, id: obj.id };
}

export function validateLimit(limit: unknown): number {
  if (limit === undefined || limit === null) return DEFAULT_PAGE_SIZE;

  const n = typeof limit === "string" ? Number(limit) : limit;
  if (typeof n !== "number" || Number.isNaN(n)) {
    throw new Error("limit must be a number");
  }
  if (n < 1) {
    throw new Error("limit must be at least 1");
  }
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export type CasePage = {
  items: { id: string; title: string; status: string; updated_at: string; [k: string]: unknown }[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export async function fetchCasePage(
  supabase: SupabaseClient,
  options: { cursor?: string; limit?: number } = {},
): Promise<CasePage> {
  const limit = validateLimit(options.limit);

  let query = supabase
    .from("cases")
    .select(
      "id, title, status, updated_at, assignee:profiles!cases_assignee_fkey(display_name)",
    )
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (options.cursor) {
    const { updatedAt, id } = decodeCursor(options.cursor);
    query = query.or(
      `updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchCasePage query failed: ${error.message}`);
  if (!data) throw new Error("fetchCasePage returned null data");

  const hasNextPage = data.length > limit;
  const items = hasNextPage ? data.slice(0, limit) : data;

  const nextCursor =
    hasNextPage && items.length > 0
      ? encodeCursor(
          items[items.length - 1].updated_at,
          items[items.length - 1].id,
        )
      : null;

  return { items, nextCursor, hasNextPage };
}
