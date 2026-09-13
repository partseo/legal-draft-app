import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  encodeCursor,
  decodeCursor,
  validateLimit,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  fetchCasePage,
} from "@/lib/db/pagination";

function fakePaginationDb(rows: Record<string, unknown>[]) {
  let capturedLimit: number | undefined;
  let capturedOrFilter: string | undefined;
  const orderCalls: { column: string; ascending: boolean }[] = [];

  const chain = {
    select: () => chain,
    order: (col: string, opts: { ascending: boolean }) => {
      orderCalls.push({ column: col, ascending: opts.ascending });
      return chain;
    },
    or: (filter: string) => {
      capturedOrFilter = filter;
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
  return { db, getCapturedLimit: () => capturedLimit, getOrFilter: () => capturedOrFilter, getOrderCalls: () => orderCalls };
}

function makeCase(i: number, updatedAt?: string) {
  return {
    id: `c${String(i).padStart(7, "0")}-0000-0000-0000-000000000000`,
    title: `사건_${i}`,
    status: "대기",
    updated_at: updatedAt ?? `2026-09-${String(13 - Math.floor(i / 100)).padStart(2, "0")}T10:00:00Z`,
    assignee: { display_name: `사용자_${i % 50}` },
  };
}

const TEST_SECRET_MAIN = "test-secret-value-must-be-at-least-32-bytes-long!!";

function signPayload(payload: string, secret = TEST_SECRET_MAIN): string {
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("Slice 2 cursor pagination", () => {
  beforeEach(() => {
    process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET_MAIN;
  });
  afterEach(() => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
  });

  describe("constants", () => {
    it("default page size is 50", () => {
      expect(DEFAULT_PAGE_SIZE).toBe(50);
    });

    it("max page size is 100", () => {
      expect(MAX_PAGE_SIZE).toBe(100);
    });
  });

  describe("validateLimit", () => {
    it("defaults to 50 when undefined", () => {
      expect(validateLimit(undefined)).toBe(50);
    });

    it("defaults to 50 when null", () => {
      expect(validateLimit(null)).toBe(50);
    });

    it("accepts valid number within range", () => {
      expect(validateLimit(25)).toBe(25);
      expect(validateLimit(1)).toBe(1);
      expect(validateLimit(100)).toBe(100);
    });

    it("caps at MAX_PAGE_SIZE (100)", () => {
      expect(validateLimit(200)).toBe(100);
      expect(validateLimit(101)).toBe(100);
    });

    it("rejects 0 or negative", () => {
      expect(() => validateLimit(0)).toThrow();
      expect(() => validateLimit(-5)).toThrow();
    });

    it("parses string numbers", () => {
      expect(validateLimit("30")).toBe(30);
    });

    it("rejects non-numeric strings", () => {
      expect(() => validateLimit("abc")).toThrow();
    });
  });

  describe("cursor encode/decode", () => {
    it("round-trips correctly", () => {
      const cursor = encodeCursor("2026-09-13T10:00:00Z", "a0000000-0000-0000-0000-000000000123");
      const decoded = decodeCursor(cursor);
      expect(decoded.updatedAt).toBe("2026-09-13T10:00:00Z");
      expect(decoded.id).toBe("a0000000-0000-0000-0000-000000000123");
    });

    it("produces an opaque non-empty string", () => {
      const cursor = encodeCursor("2026-09-13T10:00:00Z", "a0000000-0000-0000-0000-000000000123");
      expect(typeof cursor).toBe("string");
      expect(cursor.length).toBeGreaterThan(0);
    });

    it("rejects tampered/garbage cursor", () => {
      expect(() => decodeCursor("not-a-valid-cursor!!!")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => decodeCursor("")).toThrow();
    });

    it("rejects cursor with missing fields", () => {
      const payload = Buffer.from(JSON.stringify({ v: 1 })).toString("base64url");
      expect(() => decodeCursor(signPayload(payload))).toThrow();
    });

    it("rejects cursor with wrong version", () => {
      const payload = Buffer.from(
        JSON.stringify({ v: 999, ua: "2026-09-13T10:00:00Z", id: "a0000000-0000-0000-0000-000000000001" }),
      ).toString("base64url");
      expect(() => decodeCursor(signPayload(payload))).toThrow();
    });

    it("rejects cursor with non-string id", () => {
      const payload = Buffer.from(
        JSON.stringify({ v: 1, ua: "2026-09-13T10:00:00Z", id: 123 }),
      ).toString("base64url");
      expect(() => decodeCursor(signPayload(payload))).toThrow();
    });

    it("rejects cursor with non-string updatedAt", () => {
      const payload = Buffer.from(
        JSON.stringify({ v: 1, ua: null, id: "a0000000-0000-0000-0000-000000000001" }),
      ).toString("base64url");
      expect(() => decodeCursor(signPayload(payload))).toThrow();
    });
  });

  describe("fetchCasePage", () => {
    it("fetches limit + 1 rows from DB", async () => {
      const rows = Array.from({ length: 51 }, (_, i) => makeCase(i));
      const { db, getCapturedLimit } = fakePaginationDb(rows);
      await fetchCasePage(db, {});
      expect(getCapturedLimit()).toBe(51);
    });

    it("fetches custom limit + 1 rows", async () => {
      const rows = Array.from({ length: 26 }, (_, i) => makeCase(i));
      const { db, getCapturedLimit } = fakePaginationDb(rows);
      await fetchCasePage(db, { limit: 25 });
      expect(getCapturedLimit()).toBe(26);
    });

    it("returns at most limit items even when DB returns more", async () => {
      const rows = Array.from({ length: 51 }, (_, i) => makeCase(i));
      const { db } = fakePaginationDb(rows);
      const page = await fetchCasePage(db, {});
      expect(page.items.length).toBeLessThanOrEqual(50);
    });

    it("first page with enough data returns nextCursor", async () => {
      const rows = Array.from({ length: 51 }, (_, i) => makeCase(i));
      const { db } = fakePaginationDb(rows);
      const page = await fetchCasePage(db, {});
      expect(page.nextCursor).not.toBeNull();
      expect(page.hasNextPage).toBe(true);
    });

    it("last page returns nextCursor=null and hasNextPage=false", async () => {
      const rows = Array.from({ length: 30 }, (_, i) => makeCase(i));
      const { db } = fakePaginationDb(rows);
      const page = await fetchCasePage(db, {});
      expect(page.nextCursor).toBeNull();
      expect(page.hasNextPage).toBe(false);
    });

    it("uses updated_at DESC, id DESC ordering", async () => {
      const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
      const { db, getOrderCalls } = fakePaginationDb(rows);
      await fetchCasePage(db, {});
      const orders = getOrderCalls();
      expect(orders).toEqual([
        { column: "updated_at", ascending: false },
        { column: "id", ascending: false },
      ]);
    });

    it("applies cursor filter when cursor is provided", async () => {
      const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
      const { db, getOrFilter } = fakePaginationDb(rows);
      const cursor = encodeCursor("2026-09-13T10:00:00Z", "c0000050-0000-0000-0000-000000000000");
      await fetchCasePage(db, { cursor });
      expect(getOrFilter()).toBeTruthy();
    });

    it("does not apply filter when no cursor", async () => {
      const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
      const { db, getOrFilter } = fakePaginationDb(rows);
      await fetchCasePage(db, {});
      expect(getOrFilter()).toBeUndefined();
    });

    it("rejects invalid cursor with error, not silent fallback", async () => {
      const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
      const { db } = fakePaginationDb(rows);
      await expect(fetchCasePage(db, { cursor: "garbage" })).rejects.toThrow();
    });

    it("nextCursor from page N decodes to last item of page N", async () => {
      const rows = Array.from({ length: 51 }, (_, i) =>
        makeCase(i, `2026-09-13T${String(23 - Math.floor(i / 60)).padStart(2, "0")}:${String(59 - (i % 60)).padStart(2, "0")}:00Z`),
      );
      const { db } = fakePaginationDb(rows);
      const page = await fetchCasePage(db, {});
      expect(page.nextCursor).not.toBeNull();
      const decoded = decodeCursor(page.nextCursor!);
      const lastItem = page.items[page.items.length - 1];
      expect(decoded.updatedAt).toBe(lastItem.updated_at);
      expect(decoded.id).toBe(lastItem.id);
    });
  });
});

describe("cursor integrity (HMAC)", () => {
  const TEST_SECRET = "test-secret-value-must-be-at-least-32-bytes-long!!";
  const VALID_TS = "2026-09-13T10:00:00Z";
  const VALID_ID = "c0000001-0000-0000-0000-000000000000";

  beforeEach(() => {
    process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
  });

  // 1. Signed cursor round-trips
  it("signed cursor round-trips correctly", () => {
    const cursor = encodeCursor(VALID_TS, VALID_ID);
    const decoded = decodeCursor(cursor);
    expect(decoded.updatedAt).toBe(VALID_TS);
    expect(decoded.id).toBe(VALID_ID);
  });

  // 2. Unsigned legacy cursor rejected
  it("rejects unsigned legacy cursor", () => {
    const unsigned = Buffer.from(
      JSON.stringify({ v: 1, ua: VALID_TS, id: VALID_ID }),
    ).toString("base64url");
    expect(() => decodeCursor(unsigned)).toThrow();
  });

  // 3. Tampered timestamp (well-formed)
  it("rejects cursor with well-formed tampered timestamp", () => {
    const cursor = encodeCursor(VALID_TS, VALID_ID);
    const parts = cursor.split(".");
    const payloadStr = parts.length > 1 ? parts[0] : cursor;
    const obj = JSON.parse(Buffer.from(payloadStr, "base64url").toString());
    obj.ua = "2026-01-01T00:00:00Z";
    const tampered = Buffer.from(JSON.stringify(obj)).toString("base64url");
    const forged = parts.length > 1 ? `${tampered}.${parts[1]}` : tampered;
    expect(() => decodeCursor(forged)).toThrow();
  });

  // 4. Tampered UUID (well-formed)
  it("rejects cursor with well-formed tampered UUID", () => {
    const cursor = encodeCursor(VALID_TS, VALID_ID);
    const parts = cursor.split(".");
    const payloadStr = parts.length > 1 ? parts[0] : cursor;
    const obj = JSON.parse(Buffer.from(payloadStr, "base64url").toString());
    obj.id = "c9999999-0000-0000-0000-000000000000";
    const tampered = Buffer.from(JSON.stringify(obj)).toString("base64url");
    const forged = parts.length > 1 ? `${tampered}.${parts[1]}` : tampered;
    expect(() => decodeCursor(forged)).toThrow();
  });

  // 5. Signed cursor contains signature separator
  it("cursor contains signature separator", () => {
    const cursor = encodeCursor(VALID_TS, VALID_ID);
    expect(cursor).toContain(".");
  });

  // 6. Different secret rejects cursor
  it("rejects cursor signed with different secret", () => {
    const cursor = encodeCursor(VALID_TS, VALID_ID);
    process.env.CASE_CURSOR_HMAC_SECRET =
      "different-secret-also-at-least-32-bytes-long!!!!";
    expect(() => decodeCursor(cursor)).toThrow();
  });

  // 7. No signature component
  it("rejects cursor with no signature component", () => {
    const payloadOnly = Buffer.from(
      JSON.stringify({ v: 1, ua: VALID_TS, id: VALID_ID }),
    ).toString("base64url");
    expect(() => decodeCursor(payloadOnly)).toThrow(/signature/);
  });

  // 8. Signature length mismatch
  it("rejects cursor with wrong signature length", () => {
    const payload = Buffer.from(
      JSON.stringify({ v: 1, ua: VALID_TS, id: VALID_ID }),
    ).toString("base64url");
    expect(() => decodeCursor(`${payload}.abc`)).toThrow();
  });

  // 9. Secret missing
  it("rejects when secret is not set", () => {
    delete process.env.CASE_CURSOR_HMAC_SECRET;
    expect(() => encodeCursor(VALID_TS, VALID_ID)).toThrow();
  });

  // 10. Secret too short
  it("rejects when secret is shorter than 32 bytes", () => {
    process.env.CASE_CURSOR_HMAC_SECRET = "short";
    expect(() => encodeCursor(VALID_TS, VALID_ID)).toThrow();
  });

  // 11. Unsupported version (properly signed)
  it("rejects properly signed cursor with unsupported version", () => {
    const payload = Buffer.from(
      JSON.stringify({ v: 999, ua: VALID_TS, id: VALID_ID }),
    ).toString("base64url");
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("base64url");
    expect(() => decodeCursor(`${payload}.${sig}`)).toThrow(/version/);
  });

  // 12. Invalid ISO timestamp (properly signed)
  it("rejects properly signed cursor with invalid timestamp", () => {
    const payload = Buffer.from(
      JSON.stringify({ v: 1, ua: "not-a-date", id: VALID_ID }),
    ).toString("base64url");
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("base64url");
    expect(() => decodeCursor(`${payload}.${sig}`)).toThrow();
  });

  // 13. Invalid UUID (properly signed)
  it("rejects properly signed cursor with invalid UUID", () => {
    const payload = Buffer.from(
      JSON.stringify({ v: 1, ua: VALID_TS, id: "not-a-uuid" }),
    ).toString("base64url");
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("base64url");
    expect(() => decodeCursor(`${payload}.${sig}`)).toThrow();
  });

  // 14. Oversized token
  it("rejects oversized cursor token", () => {
    const oversizedPayload = Buffer.from(
      JSON.stringify({ v: 1, ua: VALID_TS, id: VALID_ID, extra: "x".repeat(500) }),
    ).toString("base64url");
    expect(() => decodeCursor(oversizedPayload)).toThrow();
  });

  // 15. Error messages don't leak secret
  it("does not leak secret in error messages", () => {
    const badCursor = "definitely-not-valid";
    try {
      decodeCursor(badCursor);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain(TEST_SECRET);
      return;
    }
    throw new Error("expected decodeCursor to throw");
  });

  // 16. Valid cursor fetches next page
  it("fetches next page with valid signed cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i));
    const { db } = fakePaginationDb(rows);
    const page1 = await fetchCasePage(db, {});
    expect(page1.nextCursor).not.toBeNull();
    const page2Rows = Array.from({ length: 10 }, (_, i) => makeCase(i + 50));
    const { db: db2 } = fakePaginationDb(page2Rows);
    const page2 = await fetchCasePage(db2, { cursor: page1.nextCursor! });
    expect(page2.items.length).toBe(10);
  });

  // 17. Client bundle does not reference secret
  it("client component does not reference cursor secret", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const clientPath = resolve(
      testDir,
      "../../../components/case-pagination.tsx",
    );
    const content = readFileSync(clientPath, "utf-8");
    expect(content).not.toContain("CASE_CURSOR_HMAC_SECRET");
    expect(content).not.toContain("createHmac");
    expect(content).not.toContain("node:crypto");
  });
});
