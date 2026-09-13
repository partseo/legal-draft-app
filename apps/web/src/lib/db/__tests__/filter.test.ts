import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validateStatusFilter,
  validateAssigneeFilter,
  validateDateFilter,
  canonicalizeFilters,
  computeConditionHash,
  encodeCursorV3,
  decodeCursorV3,
  fetchCasePage,
  encodeCursor,
  encodeCursorV2,
  computeQueryHash,
  CASE_STATUSES,
  type CaseFilters,
} from "@/lib/db/pagination";

const TEST_SECRET = "test-secret-value-must-be-at-least-32-bytes-long!!";
const VALID_TS = "2026-09-13T10:00:00Z";
const VALID_ID = "c0000001-0000-0000-0000-000000000000";
const VALID_UUID = "a0000000-0000-0000-0000-000000000001";

function makeCase(i: number, overrides?: Partial<{ title: string; status: string; updated_at: string; assignee: string }>) {
  return {
    id: `c${String(i).padStart(7, "0")}-0000-0000-0000-000000000000`,
    title: overrides?.title ?? `사건_${i}`,
    status: overrides?.status ?? "대기",
    updated_at: overrides?.updated_at ?? `2026-09-${String(13 - Math.floor(i / 100)).padStart(2, "0")}T10:00:00Z`,
    assignee: overrides?.assignee ? { display_name: "사용자" } : { display_name: `사용자_${i % 50}` },
  };
}

function fakeFilterDb(rows: Record<string, unknown>[]) {
  let capturedLimit: number | undefined;
  let capturedOrFilter: string | undefined;
  let capturedIlikeFilter: string | undefined;
  const eqFilters: { col: string; val: unknown }[] = [];
  const gteFilters: { col: string; val: unknown }[] = [];
  const ltFilters: { col: string; val: unknown }[] = [];
  const orderCalls: { column: string; ascending: boolean }[] = [];

  const chain = {
    select: () => chain,
    order: (col: string, opts: { ascending: boolean }) => {
      orderCalls.push({ column: col, ascending: opts.ascending });
      return chain;
    },
    or: (filter: string) => { capturedOrFilter = filter; return chain; },
    ilike: (col: string, pattern: string) => { capturedIlikeFilter = `${col}.ilike.${pattern}`; return chain; },
    eq: (col: string, val: unknown) => { eqFilters.push({ col, val }); return chain; },
    gte: (col: string, val: unknown) => { gteFilters.push({ col, val }); return chain; },
    lt: (col: string, val: unknown) => { ltFilters.push({ col, val }); return chain; },
    limit: (n: number) => { capturedLimit = n; return chain; },
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
    getEqFilters: () => eqFilters,
    getGteFilters: () => gteFilters,
    getLtFilters: () => ltFilters,
    getOrderCalls: () => orderCalls,
  };
}

describe("COMPOUND-FILTER-TDD: status validation", () => {
  it("T1: accepts valid status 대기", () => {
    expect(() => validateStatusFilter("대기")).not.toThrow();
  });

  it("T1b: accepts valid status 진행", () => {
    expect(() => validateStatusFilter("진행")).not.toThrow();
  });

  it("T1c: accepts valid status 완료", () => {
    expect(() => validateStatusFilter("완료")).not.toThrow();
  });

  it("T14: rejects invalid status string", () => {
    expect(() => validateStatusFilter("invalid_status")).toThrow();
  });

  it("T14b: rejects empty status string", () => {
    expect(() => validateStatusFilter("")).toThrow();
  });

  it("exports CASE_STATUSES array", () => {
    expect(Array.isArray(CASE_STATUSES)).toBe(true);
    expect(CASE_STATUSES).toContain("대기");
    expect(CASE_STATUSES).toContain("진행");
    expect(CASE_STATUSES).toContain("완료");
    expect(CASE_STATUSES).toContain("보관");
  });
});

describe("COMPOUND-FILTER-TDD: assignee validation", () => {
  it("T2: accepts valid UUID", () => {
    expect(() => validateAssigneeFilter(VALID_UUID)).not.toThrow();
  });

  it("T15: rejects non-UUID string", () => {
    expect(() => validateAssigneeFilter("not-a-uuid")).toThrow();
  });

  it("T15b: rejects empty string", () => {
    expect(() => validateAssigneeFilter("")).toThrow();
  });
});

describe("COMPOUND-FILTER-TDD: date validation", () => {
  it("T3: accepts valid from date", () => {
    expect(() => validateDateFilter("2026-01-01")).not.toThrow();
  });

  it("T4: accepts valid to date", () => {
    expect(() => validateDateFilter("2026-12-31")).not.toThrow();
  });

  it("T16: rejects invalid date format", () => {
    expect(() => validateDateFilter("01-01-2026")).toThrow();
  });

  it("T17: rejects non-existent date", () => {
    expect(() => validateDateFilter("2026-02-30")).toThrow();
  });

  it("T16b: rejects empty string", () => {
    expect(() => validateDateFilter("")).toThrow();
  });
});

describe("COMPOUND-FILTER-TDD: canonical filters", () => {
  it("produces consistent canonical form", () => {
    const a: CaseFilters = { status: "대기", assignee: VALID_UUID.toUpperCase(), from: "2026-01-01", to: "2026-12-31" };
    const b: CaseFilters = { to: "2026-12-31", from: "2026-01-01", assignee: VALID_UUID.toUpperCase(), status: "대기" };
    const ca = canonicalizeFilters(a);
    const cb = canonicalizeFilters(b);
    expect(ca).toEqual(cb);
  });

  it("lowercases UUID in canonical form", () => {
    const f: CaseFilters = { assignee: VALID_UUID.toUpperCase() };
    const c = canonicalizeFilters(f);
    expect(c.assignee).toBe(VALID_UUID.toLowerCase());
  });

  it("T18: rejects from > to", () => {
    expect(() => canonicalizeFilters({ from: "2026-12-31", to: "2026-01-01" })).toThrow();
  });

  it("allows from only", () => {
    expect(() => canonicalizeFilters({ from: "2026-01-01" })).not.toThrow();
  });

  it("allows to only", () => {
    expect(() => canonicalizeFilters({ to: "2026-12-31" })).not.toThrow();
  });
});

describe("COMPOUND-FILTER-TDD: condition hash", () => {
  it("produces deterministic hash from canonical filters", () => {
    const f: CaseFilters = { status: "대기" };
    const h1 = computeConditionHash(canonicalizeFilters(f));
    const h2 = computeConditionHash(canonicalizeFilters(f));
    expect(h1).toBe(h2);
  });

  it("different conditions produce different hashes", () => {
    const h1 = computeConditionHash(canonicalizeFilters({ status: "대기" }));
    const h2 = computeConditionHash(canonicalizeFilters({ status: "완료" }));
    expect(h1).not.toBe(h2);
  });

  it("includes search query in hash", () => {
    const h1 = computeConditionHash(canonicalizeFilters({ status: "대기" }, "서울"));
    const h2 = computeConditionHash(canonicalizeFilters({ status: "대기" }, "부산"));
    expect(h1).not.toBe(h2);
  });
});

describe("COMPOUND-FILTER-TDD: cursor v3", () => {
  beforeEach(() => { process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET; });
  afterEach(() => { delete process.env.CASE_CURSOR_HMAC_SECRET; });

  it("T25: v3 cursor round-trips correctly", () => {
    const ch = computeConditionHash(canonicalizeFilters({ status: "대기" }));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch);
    const decoded = decodeCursorV3(cursor);
    expect(decoded.updatedAt).toBe(VALID_TS);
    expect(decoded.id).toBe(VALID_ID);
    expect(decoded.conditionHash).toBe(ch);
  });

  it("T26: v3 cursor contains condition hash", () => {
    const ch = computeConditionHash(canonicalizeFilters({ status: "대기" }));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch);
    const payloadStr = cursor.split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"));
    expect(payload.v).toBe(3);
    expect(payload.ch).toBe(ch);
  });

  it("T27: rejects cursor with changed status", () => {
    const ch1 = computeConditionHash(canonicalizeFilters({ status: "대기" }));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch1);
    const ch2 = computeConditionHash(canonicalizeFilters({ status: "완료" }));
    const decoded = decodeCursorV3(cursor);
    expect(decoded.conditionHash).not.toBe(ch2);
  });

  it("T28: rejects cursor with changed assignee", () => {
    const ch1 = computeConditionHash(canonicalizeFilters({ assignee: VALID_UUID }));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch1);
    const ch2 = computeConditionHash(canonicalizeFilters({ assignee: "b0000000-0000-0000-0000-000000000002" }));
    const decoded = decodeCursorV3(cursor);
    expect(decoded.conditionHash).not.toBe(ch2);
  });

  it("T29: rejects cursor with changed date range", () => {
    const ch1 = computeConditionHash(canonicalizeFilters({ from: "2026-01-01", to: "2026-06-30" }));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch1);
    const ch2 = computeConditionHash(canonicalizeFilters({ from: "2026-07-01", to: "2026-12-31" }));
    const decoded = decodeCursorV3(cursor);
    expect(decoded.conditionHash).not.toBe(ch2);
  });

  it("T30: rejects cursor with changed search query", () => {
    const ch1 = computeConditionHash(canonicalizeFilters({ status: "대기" }, "서울"));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch1);
    const ch2 = computeConditionHash(canonicalizeFilters({ status: "대기" }, "부산"));
    const decoded = decodeCursorV3(cursor);
    expect(decoded.conditionHash).not.toBe(ch2);
  });

  it("T31: rejects v1 cursor used with filters", async () => {
    const v1 = encodeCursor(VALID_TS, VALID_ID);
    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
    const { db } = fakeFilterDb(rows);
    await expect(fetchCasePage(db, { cursor: v1, filters: { status: "대기" } })).rejects.toThrow();
  });

  it("T32: rejects v2 cursor used with filters", async () => {
    const qh = computeQueryHash("서울");
    const v2 = encodeCursorV2(VALID_TS, VALID_ID, qh);
    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
    const { db } = fakeFilterDb(rows);
    await expect(fetchCasePage(db, { cursor: v2, search: "서울", filters: { status: "대기" } })).rejects.toThrow();
  });

  it("T33: rejects v3 cursor used without filters", async () => {
    const ch = computeConditionHash(canonicalizeFilters({ status: "대기" }));
    const v3 = encodeCursorV3(VALID_TS, VALID_ID, ch);
    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
    const { db } = fakeFilterDb(rows);
    await expect(fetchCasePage(db, { cursor: v3 })).rejects.toThrow();
  });

  it("T34: rejects tampered v3 cursor", () => {
    const ch = computeConditionHash(canonicalizeFilters({ status: "대기" }));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch);
    const parts = cursor.split(".");
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    payload.ch = computeConditionHash(canonicalizeFilters({ status: "완료" }));
    const tampered = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(() => decodeCursorV3(`${tampered}.${parts[1]}`)).toThrow();
  });
});

describe("COMPOUND-FILTER-TDD: fetchCasePage with filters", () => {
  beforeEach(() => { process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET; });
  afterEach(() => { delete process.env.CASE_CURSOR_HMAC_SECRET; });

  it("T1: status filter applies eq to DB query", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i, { status: "대기" }));
    const { db, getEqFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { status: "대기" } });
    const eqs = getEqFilters();
    expect(eqs.some(f => f.col === "status" && f.val === "대기")).toBe(true);
  });

  it("T2: assignee filter applies eq to DB query", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getEqFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { assignee: VALID_UUID } });
    const eqs = getEqFilters();
    expect(eqs.some(f => f.col === "assignee" && f.val === VALID_UUID)).toBe(true);
  });

  it("T3: from date applies gte to DB query", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getGteFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { from: "2026-01-01" } });
    const gtes = getGteFilters();
    expect(gtes.some(f => f.col === "created_at")).toBe(true);
  });

  it("T4: to date applies lt to DB query", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getLtFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { to: "2026-12-31" } });
    const lts = getLtFilters();
    expect(lts.some(f => f.col === "created_at")).toBe(true);
  });

  it("T5: from+to applies both gte and lt", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getGteFilters, getLtFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { from: "2026-01-01", to: "2026-12-31" } });
    expect(getGteFilters().some(f => f.col === "created_at")).toBe(true);
    expect(getLtFilters().some(f => f.col === "created_at")).toBe(true);
  });

  it("T6: status+assignee applies both eq filters", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getEqFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { status: "대기", assignee: VALID_UUID } });
    const eqs = getEqFilters();
    expect(eqs.some(f => f.col === "status")).toBe(true);
    expect(eqs.some(f => f.col === "assignee")).toBe(true);
  });

  it("T7: status+date applies eq and gte/lt", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getEqFilters, getGteFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { status: "진행", from: "2026-01-01" } });
    expect(getEqFilters().some(f => f.col === "status")).toBe(true);
    expect(getGteFilters().some(f => f.col === "created_at")).toBe(true);
  });

  it("T8: assignee+date applies eq and gte/lt", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getEqFilters, getLtFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { assignee: VALID_UUID, to: "2026-12-31" } });
    expect(getEqFilters().some(f => f.col === "assignee")).toBe(true);
    expect(getLtFilters().some(f => f.col === "created_at")).toBe(true);
  });

  it("T9: all three filters combined", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getEqFilters, getGteFilters, getLtFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { status: "대기", assignee: VALID_UUID, from: "2026-01-01", to: "2026-06-30" } });
    expect(getEqFilters().some(f => f.col === "status")).toBe(true);
    expect(getEqFilters().some(f => f.col === "assignee")).toBe(true);
    expect(getGteFilters().some(f => f.col === "created_at")).toBe(true);
    expect(getLtFilters().some(f => f.col === "created_at")).toBe(true);
  });

  it("T10: search+status combined", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i, { title: `서울사건_${i}` }));
    const { db, getEqFilters, getIlikeFilter } = fakeFilterDb(rows);
    await fetchCasePage(db, { search: "서울", filters: { status: "대기" } });
    expect(getIlikeFilter()).toBeTruthy();
    expect(getEqFilters().some(f => f.col === "status")).toBe(true);
  });

  it("T11: search+assignee combined", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getEqFilters, getIlikeFilter } = fakeFilterDb(rows);
    await fetchCasePage(db, { search: "서울", filters: { assignee: VALID_UUID } });
    expect(getIlikeFilter()).toBeTruthy();
    expect(getEqFilters().some(f => f.col === "assignee")).toBe(true);
  });

  it("T12: search+date combined", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getIlikeFilter, getGteFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { search: "서울", filters: { from: "2026-01-01" } });
    expect(getIlikeFilter()).toBeTruthy();
    expect(getGteFilters().some(f => f.col === "created_at")).toBe(true);
  });

  it("T13: search+all three filters", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getEqFilters, getGteFilters, getLtFilters, getIlikeFilter } = fakeFilterDb(rows);
    await fetchCasePage(db, {
      search: "서울",
      filters: { status: "대기", assignee: VALID_UUID, from: "2026-01-01", to: "2026-06-30" },
    });
    expect(getIlikeFilter()).toBeTruthy();
    expect(getEqFilters().some(f => f.col === "status")).toBe(true);
    expect(getEqFilters().some(f => f.col === "assignee")).toBe(true);
    expect(getGteFilters().some(f => f.col === "created_at")).toBe(true);
    expect(getLtFilters().some(f => f.col === "created_at")).toBe(true);
  });

  it("T19: to date is inclusive (next-day-exclusive)", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getLtFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { to: "2026-06-30" } });
    const lts = getLtFilters();
    const dateLt = lts.find(f => f.col === "created_at");
    expect(dateLt).toBeTruthy();
    expect(String(dateLt!.val)).toContain("2026-06-30T15:00:00");
  });

  it("T20: KST→UTC boundary conversion", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getGteFilters } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { from: "2026-01-01" } });
    const gtes = getGteFilters();
    const dateGte = gtes.find(f => f.col === "created_at");
    expect(dateGte).toBeTruthy();
    const val = String(dateGte!.val);
    expect(val).toContain("2025-12-31T15:00:00");
  });

  it("T21: filter result max 50 items", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i, { status: "대기" }));
    const { db } = fakeFilterDb(rows);
    const page = await fetchCasePage(db, { filters: { status: "대기" } });
    expect(page.items.length).toBeLessThanOrEqual(50);
  });

  it("T22: DB fetch max 51", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i));
    const { db, getCapturedLimit } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { status: "대기" } });
    expect(getCapturedLimit()).toBe(51);
  });

  it("T37: maintains sort order with filters", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeCase(i));
    const { db, getOrderCalls } = fakeFilterDb(rows);
    await fetchCasePage(db, { filters: { status: "대기" } });
    expect(getOrderCalls()).toEqual([
      { column: "updated_at", ascending: false },
      { column: "id", ascending: false },
    ]);
  });

  it("T27-filter: filter with cursor uses v3 and validates condition hash", async () => {
    const filters: CaseFilters = { status: "대기" };
    const canonical = canonicalizeFilters(filters);
    const ch = computeConditionHash(canonical);
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch);
    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
    const { db } = fakeFilterDb(rows);
    const page = await fetchCasePage(db, { cursor, filters });
    expect(page.items.length).toBeGreaterThan(0);
  });

  it("T27-mismatch: filter cursor with different status rejects", async () => {
    const ch = computeConditionHash(canonicalizeFilters({ status: "대기" }));
    const cursor = encodeCursorV3(VALID_TS, VALID_ID, ch);
    const rows = Array.from({ length: 10 }, (_, i) => makeCase(i));
    const { db } = fakeFilterDb(rows);
    await expect(fetchCasePage(db, { cursor, filters: { status: "완료" } })).rejects.toThrow();
  });

  it("search+filter cursor uses v3", async () => {
    const filters: CaseFilters = { status: "대기" };
    const canonical = canonicalizeFilters(filters, "서울");
    const ch = computeConditionHash(canonical);
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i, { title: `서울_${i}` }));
    const { db } = fakeFilterDb(rows);
    const page = await fetchCasePage(db, { search: "서울", filters });
    expect(page.nextCursor).not.toBeNull();
    const decoded = decodeCursorV3(page.nextCursor!);
    expect(decoded.conditionHash).toBe(ch);
  });
});

describe("COMPOUND-FILTER-TDD: regression", () => {
  beforeEach(() => { process.env.CASE_CURSOR_HMAC_SECRET = TEST_SECRET; });
  afterEach(() => { delete process.env.CASE_CURSOR_HMAC_SECRET; });

  it("T38: unfiltered pagination uses v1 cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i));
    const { db } = fakeFilterDb(rows);
    const page = await fetchCasePage(db, {});
    expect(page.nextCursor).not.toBeNull();
    const payloadStr = page.nextCursor!.split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"));
    expect(payload.v).toBe(1);
  });

  it("T39: search-only pagination uses v2 cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => makeCase(i, { title: `검색_${i}` }));
    const { db } = fakeFilterDb(rows);
    const page = await fetchCasePage(db, { search: "검색" });
    expect(page.nextCursor).not.toBeNull();
    const payloadStr = page.nextCursor!.split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"));
    expect(payload.v).toBe(2);
  });
});
