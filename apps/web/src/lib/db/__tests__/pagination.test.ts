import { describe, it, expect } from "vitest";
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

describe("Slice 2 cursor pagination", () => {
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
      const cursor = encodeCursor("2026-09-13T10:00:00Z", "abc-123");
      const decoded = decodeCursor(cursor);
      expect(decoded.updatedAt).toBe("2026-09-13T10:00:00Z");
      expect(decoded.id).toBe("abc-123");
    });

    it("produces an opaque non-empty string", () => {
      const cursor = encodeCursor("2026-09-13T10:00:00Z", "abc-123");
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
      const bad = Buffer.from(JSON.stringify({ v: 1 })).toString("base64url");
      expect(() => decodeCursor(bad)).toThrow();
    });

    it("rejects cursor with wrong version", () => {
      const bad = Buffer.from(
        JSON.stringify({ v: 999, ua: "2026-09-13T10:00:00Z", id: "x" }),
      ).toString("base64url");
      expect(() => decodeCursor(bad)).toThrow();
    });

    it("rejects cursor with non-string id", () => {
      const bad = Buffer.from(
        JSON.stringify({ v: 1, ua: "2026-09-13T10:00:00Z", id: 123 }),
      ).toString("base64url");
      expect(() => decodeCursor(bad)).toThrow();
    });

    it("rejects cursor with non-string updatedAt", () => {
      const bad = Buffer.from(
        JSON.stringify({ v: 1, ua: null, id: "x" }),
      ).toString("base64url");
      expect(() => decodeCursor(bad)).toThrow();
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
