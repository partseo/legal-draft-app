import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  normalizeSearchQuery,
  validateSearchQuery,
  escapeForLike,
  encodeCursorV2,
  decodeCursorV2,
  computeQueryHash,
  fetchCasePage,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  encodeCursor,
  decodeCursor,
} from "@/lib/db/pagination";

const TEST_SECRET = "test-secret-value-must-be-at-least-32-bytes-long!!";

function makeCase(i: number, title?: string, updatedAt?: string) {
  return {
    id: `c${String(i).padStart(7, "0")}-0000-0000-0000-000000000000`,
    title: title ?? `사건_${i}`,
    status: "대기",
    updated_at: updatedAt ?? `2026-09-${String(13 - Math.floor(i / 100)).padStart(2, "0")}T10:00:00Z`,
    assignee: { display_name: `사용자_${i % 50}` },
  };
}

function fakeSearchDb(rows: Record<string, unknown>[]) {
  let capturedLimit: number | undefined;
  let capturedOrFilter: string | undefined;
  let capturedIlikeFilter: string | undefined;
  const orderCalls: { column: string; ascending: boolean }[] = [];
  const selectCalls: string[] = [];

  const chain = {
    select: (sel: string) => {
      selectCalls.push(sel);
      return chain;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      orderCalls.push({ column: col, ascending: opts.ascending });
      return chain;
    },
    or: (filter: string) => {
      capturedOrFilter = filter;
      return chain;
    },
    ilike: (col: string, pattern: string) => {
      capturedIlikeFilter = `${col}.ilike.${pattern}`;
      return chain;
    },
    limit: (n: number) => {
      capturedLimit = n;
      return chain;
    },
    then: (resolve: (v: unknown) => void) => {
      const sliced = capturedLimit != null ? rows.slice(0, capturedLimit) : rows;
      resolve({ data: sliced, error: null });
    },
  };
  const db = { from: () => chain } as unknown as Parameters<typeof fetchCasePage>[0];
  return {
    db,
    getCapturedLimit: () => capturedLimit,
    getOrFilter: () => capturedOrFilter,
    getIlikeFilter: () => capturedIlikeFilter,
    getOrderCalls: () => orderCalls,
    getSelectCalls: () => selectCalls,
  };
}

describe("SERVER-SEARCH-TDD-001: search normalization", () => {
  // T1: NFKC normalization
  it("normalizes Korean compatibility jamo to NFC form", () => {
    const compatJamo = "ㄱㅅ"; // ㄱㅅ in compatibility form
    const result = normalizeSearchQuery(compatJamo);
    expect(result).toBe(compatJamo.normalize("NFKC"));
  });

  // T2: trims whitespace
  it("trims leading and trailing whitespace", () => {
    expect(normalizeSearchQuery("  서울  ")).toBe("서울");
  });

  // T3: collapses internal whitespace
  it("collapses multiple internal spaces to single space", () => {
    expect(normalizeSearchQuery("서울   지방   법원")).toBe("서울 지방 법원");
  });

  // T4: full normalization pipeline
  it("applies NFKC + trim + collapse in sequence", () => {
    const input = "  ㄱㅅ   test  ";
    const result = normalizeSearchQuery(input);
    expect(result).toBe(input.normalize("NFKC").trim().replace(/\s+/g, " "));
  });
});

describe("SERVER-SEARCH-TDD-001: search validation", () => {
  // T5: rejects empty string
  it("rejects empty search query", () => {
    expect(() => validateSearchQuery("")).toThrow();
  });

  // T6: rejects single character
  it("rejects single character (min 2)", () => {
    expect(() => validateSearchQuery("가")).toThrow();
  });

  // T7: accepts 2 characters
  it("accepts exactly 2 characters", () => {
    expect(() => validateSearchQuery("가나")).not.toThrow();
  });

  // T8: rejects > 100 characters
  it("rejects query exceeding 100 characters", () => {
    const long = "가".repeat(101);
    expect(() => validateSearchQuery(long)).toThrow();
  });

  // T9: accepts exactly 100 characters
  it("accepts exactly 100 characters", () => {
    const exact = "가".repeat(100);
    expect(() => validateSearchQuery(exact)).not.toThrow();
  });
});

describe("SERVER-SEARCH-TDD-001: wildcard escaping", () => {
  // T10: escapes % as literal
  it("escapes % to \\%", () => {
    expect(escapeForLike("50% 완료")).toBe("50\\% 완료");
  });

  // T11: escapes _ as literal
  it("escapes _ to \\_", () => {
    expect(escapeForLike("case_001")).toBe("case\\_001");
  });

  // T12: escapes backslash as literal
  it("escapes \\ to \\\\", () => {
    expect(escapeForLike("path\\to")).toBe("path\\\\to");
  });

  // T13: escapes all wildcard chars in combination
  it("escapes all wildcards together", () => {
    expect(escapeForLike("50%_file\\name")).toBe("50\\%\\_file\\\\name");
  });
});

describe("SERVER-SEARCH-TDD-001: query hash", () => {
  // T14: produces SHA-256 hex string
  it("computes SHA-256 hex of normalized query", () => {
    const hash = computeQueryHash("서울");
    const expected = createHash("sha256").update("서울").digest("hex");
    expect(hash).toBe(expected);
  });

  // T15: different queries produce different hashes
  it("different queries produce different hashes", () => {
    const h1 = computeQueryHash("서울");
    const h2 = computeQueryHash("부산");
    expect(h1).not.toBe(h2);
  });
});

describe("SERVER-SEARCH-TDD-001: cursor v2 encoding/decoding", () => {
  const VALID_TS = "2026-09-13T10:00:00Z";
  const VALID_ID = "c0000001-0000-0000-0000-000000000000";
  const QUERY_HASH = createHash("sha256").update("서울").digest("hex");

  beforeEach(() => {
    process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
  });

  // T16: v2 cursor round-trips
  it("v2 cursor round-trips correctly", () => {
    const cursor = encodeCursorV2(VALID_TS, VALID_ID, QUERY_HASH);
    const decoded = decodeCursorV2(cursor);
    expect(decoded.updatedAt).toBe(VALID_TS);
    expect(decoded.id).toBe(VALID_ID);
    expect(decoded.queryHash).toBe(QUERY_HASH);
  });

  // T17: v2 cursor has version 2 in payload
  it("v2 cursor contains version 2", () => {
    const cursor = encodeCursorV2(VALID_TS, VALID_ID, QUERY_HASH);
    const payloadStr = cursor.split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"));
    expect(payload.v).toBe(2);
  });

  // T18: v2 cursor contains query hash
  it("v2 cursor payload includes qh field", () => {
    const cursor = encodeCursorV2(VALID_TS, VALID_ID, QUERY_HASH);
    const payloadStr = cursor.split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"));
    expect(payload.qh).toBe(QUERY_HASH);
  });

  // T19: v1 cursor rejected by decodeCursorV2
  it("rejects v1 cursor when v2 is expected", () => {
    const v1Cursor = encodeCursor(VALID_TS, VALID_ID);
    expect(() => decodeCursorV2(v1Cursor)).toThrow();
  });

  // T20: tampered v2 cursor rejected
  it("rejects tampered v2 cursor", () => {
    const cursor = encodeCursorV2(VALID_TS, VALID_ID, QUERY_HASH);
    const parts = cursor.split(".");
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    payload.qh = createHash("sha256").update("다른검색어").digest("hex");
    const tampered = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(() => decodeCursorV2(`${tampered}.${parts[1]}`)).toThrow();
  });
});

describe("SERVER-SEARCH-TDD-001: cursor cross-contamination", () => {
  const VALID_TS = "2026-09-13T10:00:00Z";
  const VALID_ID = "c0000001-0000-0000-0000-000000000000";

  beforeEach(() => {
    process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
  });

  // T21: v2 cursor for query A rejected when query B is active
  it("rejects v2 cursor bound to different search query", async () => {
    const hashA = computeQueryHash("서울");
    const cursorA = encodeCursorV2(VALID_TS, VALID_ID, hashA);

    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i, `부산사건_${i}`));
    const { db } = fakeSearchDb(rows);

    await expect(
      fetchCasePage(db, { cursor: cursorA, search: "부산" }),
    ).rejects.toThrow();
  });

  // T22: v1 cursor rejected when search is active
  it("rejects v1 (non-search) cursor when search is active", async () => {
    const v1Cursor = encodeCursor(VALID_TS, VALID_ID);
    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
    const { db } = fakeSearchDb(rows);

    await expect(
      fetchCasePage(db, { cursor: v1Cursor, search: "서울" }),
    ).rejects.toThrow();
  });

  // T23: v2 cursor rejected when no search is active
  it("rejects v2 (search) cursor when no search is active", async () => {
    const hash = computeQueryHash("서울");
    const cursor = encodeCursorV2(VALID_TS, VALID_ID, hash);
    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
    const { db } = fakeSearchDb(rows);

    await expect(
      fetchCasePage(db, { cursor }),
    ).rejects.toThrow();
  });
});

describe("SERVER-SEARCH-TDD-001: fetchCasePage with search", () => {
  beforeEach(() => {
    process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
  });

  // T24: search returns filtered results
  it("returns items matching search query", async () => {
    const rows = [
      makeCase(1, "서울지방법원 소송"),
      makeCase(2, "서울중앙지법 항소"),
    ];
    const { db } = fakeSearchDb(rows);
    const page = await fetchCasePage(db, { search: "서울" });
    expect(page.items.length).toBeGreaterThan(0);
  });

  // T25: search applies ILIKE filter to DB query
  it("applies server-side filter (not client-side)", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i, `서울사건_${i}`));
    const { db, getIlikeFilter } = fakeSearchDb(rows);
    await fetchCasePage(db, { search: "서울" });
    const filter = getIlikeFilter();
    expect(filter).toBeTruthy();
    expect(filter).toContain("서울");
  });

  // T26: search respects page size
  it("returns at most limit items when searching", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i, `검색결과_${i}`));
    const { db } = fakeSearchDb(rows);
    const page = await fetchCasePage(db, { search: "검색", limit: 50 });
    expect(page.items.length).toBeLessThanOrEqual(50);
  });

  // T27: search with pagination returns v2 cursor
  it("returns v2 cursor with query hash when search + hasNextPage", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i, `검색사건_${i}`));
    const { db } = fakeSearchDb(rows);
    const page = await fetchCasePage(db, { search: "검색" });
    expect(page.nextCursor).not.toBeNull();

    const decoded = decodeCursorV2(page.nextCursor!);
    const expectedHash = computeQueryHash(normalizeSearchQuery("검색"));
    expect(decoded.queryHash).toBe(expectedHash);
  });

  // T28: search maintains sort order (updated_at DESC, id DESC)
  it("maintains keyset sort order during search", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i, `정렬검증_${i}`));
    const { db, getOrderCalls } = fakeSearchDb(rows);
    await fetchCasePage(db, { search: "정렬" });
    const orders = getOrderCalls();
    expect(orders).toEqual([
      { column: "updated_at", ascending: false },
      { column: "id", ascending: false },
    ]);
  });

  // T29: empty search string treated as no search (unfiltered)
  it("treats whitespace-only search as no search", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getIlikeFilter } = fakeSearchDb(rows);
    await fetchCasePage(db, { search: "   " });
    expect(getIlikeFilter()).toBeUndefined();
  });

  // T30: search with invalid query length throws
  it("rejects search query shorter than 2 characters", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db } = fakeSearchDb(rows);
    await expect(fetchCasePage(db, { search: "가" })).rejects.toThrow();
  });
});

describe("SERVER-SEARCH-TDD-001: regression — unfiltered pagination unchanged", () => {
  beforeEach(() => {
    process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
  });

  // T31: unfiltered fetchCasePage still works identically
  it("unfiltered page returns v1 cursor (no query hash)", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i));
    const { db } = fakeSearchDb(rows);
    const page = await fetchCasePage(db, {});
    expect(page.nextCursor).not.toBeNull();

    const decoded = decodeCursor(page.nextCursor!);
    expect(decoded.updatedAt).toBeTruthy();
    expect(decoded.id).toBeTruthy();
  });

  // T32: default page size unchanged
  it("default page size remains 50", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
  });

  // T33: max page size unchanged
  it("max page size remains 100", () => {
    expect(MAX_PAGE_SIZE).toBe(100);
  });
});

describe("SERVER-SEARCH-TDD-001: HMAC integrity for search cursors", () => {
  const VALID_TS = "2026-09-13T10:00:00Z";
  const VALID_ID = "c0000001-0000-0000-0000-000000000000";
  const QUERY_HASH = createHash("sha256").update("서울").digest("hex");

  beforeEach(() => {
    process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
  });

  // T34: v2 cursor signed with different secret rejected
  it("rejects v2 cursor signed with different secret", () => {
    const cursor = encodeCursorV2(VALID_TS, VALID_ID, QUERY_HASH);
    process.env.CASE_CURSOR_HMAC_SECRET = "different-secret-also-at-least-32-bytes-long!!!!";
    expect(() => decodeCursorV2(cursor)).toThrow();
  });

  // T35: error messages from v2 decode don't leak secret
  it("v2 error messages don't leak secret", () => {
    try {
      decodeCursorV2("definitely-not-valid-v2-cursor");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain(TEST_SECRET);
      return;
    }
    throw new Error("expected decodeCursorV2 to throw");
  });
});
