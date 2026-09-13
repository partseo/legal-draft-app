import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 512;
const MIN_SECRET_BYTES = 32;

const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getCursorSecret(): Buffer {
  const raw = process.env.CASE_CURSOR_HMAC_SECRET;
  if (!raw) throw new Error("cursor signing secret is not configured");
  const buf = Buffer.from(raw, "utf-8");
  if (buf.length < MIN_SECRET_BYTES)
    throw new Error("cursor signing secret is too short");
  return buf;
}

const CURSOR_VERSION_2 = 2;
const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_LENGTH = 100;

export function normalizeSearchQuery(q: string): string {
  return q.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function validateSearchQuery(q: string): void {
  if (q.length < MIN_SEARCH_LENGTH)
    throw new Error(`search query must be at least ${MIN_SEARCH_LENGTH} characters`);
  if (q.length > MAX_SEARCH_LENGTH)
    throw new Error(`search query must be at most ${MAX_SEARCH_LENGTH} characters`);
}

export function escapeForLike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function computeQueryHash(normalizedQuery: string): string {
  return createHash("sha256").update(normalizedQuery).digest("hex");
}

export function encodeCursorV2(
  updatedAt: string,
  id: string,
  queryHash: string,
): string {
  const secret = getCursorSecret();
  const payload = Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION_2, ua: updatedAt, id, qh: queryHash }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function decodeCursorV2(cursor: string): {
  updatedAt: string;
  id: string;
  queryHash: string;
} {
  if (!cursor) throw new Error("cursor must be a non-empty string");
  if (cursor.length > MAX_CURSOR_LENGTH)
    throw new Error("invalid cursor: exceeds maximum length");

  const dotIdx = cursor.indexOf(".");
  if (dotIdx < 0) throw new Error("invalid cursor: missing signature");

  const payloadStr = cursor.slice(0, dotIdx);
  const sigStr = cursor.slice(dotIdx + 1);
  if (!sigStr) throw new Error("invalid cursor: empty signature");

  const secret = getCursorSecret();
  const expected = createHmac("sha256", secret).update(payloadStr).digest();

  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigStr, "base64url");
  } catch {
    throw new Error("invalid cursor: signature verification failed");
  }

  if (
    sigBuf.length !== expected.length ||
    !timingSafeEqual(sigBuf, expected)
  ) {
    throw new Error("invalid cursor: signature verification failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString("utf-8"),
    );
  } catch {
    throw new Error("invalid cursor: malformed encoding");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("v" in parsed) ||
    !("ua" in parsed) ||
    !("id" in parsed) ||
    !("qh" in parsed)
  ) {
    throw new Error("invalid cursor: missing required fields");
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.v !== CURSOR_VERSION_2)
    throw new Error(`invalid cursor: expected version ${CURSOR_VERSION_2}, got ${obj.v}`);
  if (typeof obj.ua !== "string")
    throw new Error("invalid cursor: updatedAt must be a string");
  if (typeof obj.id !== "string")
    throw new Error("invalid cursor: id must be a string");
  if (typeof obj.qh !== "string")
    throw new Error("invalid cursor: queryHash must be a string");
  if (!ISO_TS_RE.test(obj.ua as string))
    throw new Error("invalid cursor: malformed timestamp");
  if (!UUID_RE.test(obj.id as string))
    throw new Error("invalid cursor: malformed id");

  return {
    updatedAt: obj.ua as string,
    id: obj.id as string,
    queryHash: obj.qh as string,
  };
}

export function encodeCursor(updatedAt: string, id: string): string {
  const secret = getCursorSecret();
  const payload = Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION, ua: updatedAt, id }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function decodeCursor(cursor: string): {
  updatedAt: string;
  id: string;
} {
  if (!cursor) throw new Error("cursor must be a non-empty string");
  if (cursor.length > MAX_CURSOR_LENGTH)
    throw new Error("invalid cursor: exceeds maximum length");

  const dotIdx = cursor.indexOf(".");
  if (dotIdx < 0) throw new Error("invalid cursor: missing signature");

  const payloadStr = cursor.slice(0, dotIdx);
  const sigStr = cursor.slice(dotIdx + 1);
  if (!sigStr) throw new Error("invalid cursor: empty signature");

  const secret = getCursorSecret();
  const expected = createHmac("sha256", secret)
    .update(payloadStr)
    .digest();

  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigStr, "base64url");
  } catch {
    throw new Error("invalid cursor: signature verification failed");
  }

  if (
    sigBuf.length !== expected.length ||
    !timingSafeEqual(sigBuf, expected)
  ) {
    throw new Error("invalid cursor: signature verification failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString("utf-8"),
    );
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

  if (!ISO_TS_RE.test(obj.ua as string)) {
    throw new Error("invalid cursor: malformed timestamp");
  }
  if (!UUID_RE.test(obj.id as string)) {
    throw new Error("invalid cursor: malformed id");
  }

  return { updatedAt: obj.ua as string, id: obj.id as string };
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
  items: {
    id: string;
    title: string;
    status: string;
    updated_at: string;
    [k: string]: unknown;
  }[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export async function fetchCasePage(
  supabase: SupabaseClient,
  options: { cursor?: string; limit?: number; search?: string } = {},
): Promise<CasePage> {
  const limit = validateLimit(options.limit);

  let normalizedSearch: string | undefined;
  if (options.search != null) {
    const trimmed = normalizeSearchQuery(options.search);
    if (trimmed.length > 0) {
      validateSearchQuery(trimmed);
      normalizedSearch = trimmed;
    }
  }

  let query = supabase
    .from("cases")
    .select(
      "id, title, status, updated_at, assignee:profiles!cases_assignee_fkey(display_name)",
    )
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (normalizedSearch) {
    const escaped = escapeForLike(normalizedSearch);
    query = query.ilike("title", `%${escaped}%`);
  }

  if (options.cursor) {
    if (normalizedSearch) {
      const { updatedAt, id, queryHash } = decodeCursorV2(options.cursor);
      const currentHash = computeQueryHash(normalizedSearch);
      if (queryHash !== currentHash)
        throw new Error("cursor does not match current search query");
      query = query.or(
        `updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`,
      );
    } else {
      const { updatedAt, id } = decodeCursor(options.cursor);
      query = query.or(
        `updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchCasePage query failed: ${error.message}`);
  if (!data) throw new Error("fetchCasePage returned null data");

  const hasNextPage = data.length > limit;
  const items = hasNextPage ? data.slice(0, limit) : data;

  let nextCursor: string | null = null;
  if (hasNextPage && items.length > 0) {
    const lastItem = items[items.length - 1];
    if (normalizedSearch) {
      const qh = computeQueryHash(normalizedSearch);
      nextCursor = encodeCursorV2(lastItem.updated_at, lastItem.id, qh);
    } else {
      nextCursor = encodeCursor(lastItem.updated_at, lastItem.id);
    }
  }

  return { items, nextCursor, hasNextPage };
}
