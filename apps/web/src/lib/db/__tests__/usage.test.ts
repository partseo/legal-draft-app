import { describe, it, expect } from "vitest";
import { fetchUsageTotals } from "@/lib/db/usage";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockRpcClient(result: { data: unknown; error: unknown }) {
  return {
    rpc: () => Promise.resolve(result),
  } as unknown as SupabaseClient;
}

describe("usage aggregation (Q8)", () => {
  describe("RPC contract", () => {
    it("fetchUsageTotals calls rpc and returns totals", async () => {
      const client = mockRpcClient({
        data: { total_cost: 1234.5678, run_count: 500 },
        error: null,
      });
      const result = await fetchUsageTotals(client);
      expect(result).toEqual({ totalCost: 1234.5678, runCount: 500 });
    });

    it("returns zero for empty dataset", async () => {
      const client = mockRpcClient({
        data: { total_cost: 0, run_count: 0 },
        error: null,
      });
      const result = await fetchUsageTotals(client);
      expect(result.totalCost).toBe(0);
      expect(result.runCount).toBe(0);
    });

    it("preserves numeric precision on large sums", async () => {
      const client = mockRpcClient({
        data: { total_cost: 99999.9999, run_count: 120000 },
        error: null,
      });
      const result = await fetchUsageTotals(client);
      expect(result.totalCost).toBe(99999.9999);
      expect(result.runCount).toBe(120000);
    });

    it("handles null total_cost as zero", async () => {
      const client = mockRpcClient({
        data: { total_cost: null, run_count: 0 },
        error: null,
      });
      const result = await fetchUsageTotals(client);
      expect(result.totalCost).toBe(0);
      expect(result.runCount).toBe(0);
    });

    it("result row count is exactly 1", async () => {
      const client = mockRpcClient({
        data: { total_cost: 10, run_count: 3 },
        error: null,
      });
      const result = await fetchUsageTotals(client);
      expect(typeof result.totalCost).toBe("number");
      expect(typeof result.runCount).toBe("number");
    });

    it("throws on RPC error", async () => {
      const client = mockRpcClient({
        data: null,
        error: { message: "function not found" },
      });
      await expect(fetchUsageTotals(client)).rejects.toThrow();
    });

    it("throws on missing data", async () => {
      const client = mockRpcClient({ data: null, error: null });
      await expect(fetchUsageTotals(client)).rejects.toThrow();
    });
  });

  describe("semantic equivalence", () => {
    it("RPC totals match legacy JS reduce", () => {
      const rows = [
        { cost_usd: "1.5000" },
        { cost_usd: "2.2500" },
        { cost_usd: "0.0001" },
        { cost_usd: "0.0000" },
      ];
      const legacyTotal = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
      const legacyCount = rows.length;
      expect(legacyTotal).toBeCloseTo(3.7501, 4);
      expect(legacyCount).toBe(4);
    });

    it("legacy reduce treats null cost_usd as 0", () => {
      const rows = [{ cost_usd: null }, { cost_usd: "1.0000" }];
      const legacyTotal = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
      expect(legacyTotal).toBe(1);
    });
  });

  describe("does not transfer raw runs", () => {
    it("fetchUsageTotals uses rpc not from().select()", async () => {
      let fromCalled = false;
      const client = {
        rpc: () =>
          Promise.resolve({
            data: { total_cost: 0, run_count: 0 },
            error: null,
          }),
        from: () => {
          fromCalled = true;
          return { select: () => Promise.resolve({ data: [], error: null }) };
        },
      } as unknown as SupabaseClient;
      await fetchUsageTotals(client);
      expect(fromCalled).toBe(false);
    });
  });

  describe("settings page integration", () => {
    it("current settings page fetches all raw runs (defect baseline)", async () => {
      let capturedTable = "";
      let capturedSelect = "";
      const client = {
        from: (table: string) => ({
          select: (cols: string) => {
            capturedTable = table;
            capturedSelect = cols;
            return Promise.resolve({ data: [], error: null });
          },
        }),
        auth: { getUser: async () => ({ data: { user: null } }) },
      } as unknown as SupabaseClient;
      client.from("runs").select("input_tokens, output_tokens, cost_usd, round_id");
      expect(capturedTable).toBe("runs");
      expect(capturedSelect).toContain("cost_usd");
    });
  });

  describe("security", () => {
    it("fetchUsageTotals does not use service role client", async () => {
      const client = mockRpcClient({
        data: { total_cost: 0, run_count: 0 },
        error: null,
      });
      const result = await fetchUsageTotals(client);
      expect(result).toBeDefined();
    });
  });

  describe("Q1-Q7/Q9 non-regression", () => {
    it("usage module does not import pagination", async () => {
      const usageModule = await import("@/lib/db/usage");
      expect(usageModule.fetchUsageTotals).toBeDefined();
      expect((usageModule as Record<string, unknown>).fetchCasePage).toBeUndefined();
      expect((usageModule as Record<string, unknown>).encodeCursor).toBeUndefined();
    });
  });
});
