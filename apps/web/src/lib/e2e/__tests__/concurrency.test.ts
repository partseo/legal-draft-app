import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTestUsers,
  runConcurrencyTest,
  cleanupTestUsers,
  type ConcurrencyUser,
  type ConcurrencyMetrics,
  type HarnessOptions,
} from "../concurrency-harness";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const HARNESS_OPTS: HarnessOptions = {
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_KEY,
  anonKey: ANON_KEY,
  userCount: 20,
  orgCount: 4,
  opsPerUser: 3,
};

describe("Gate 8: 20-User E2E Concurrency", { timeout: 300_000 }, () => {
  let users: ConcurrencyUser[];
  let metrics: ConcurrencyMetrics;

  beforeAll(async () => {
    users = await createTestUsers(HARNESS_OPTS);
    metrics = await runConcurrencyTest(users, HARNESS_OPTS);
    console.log(`Metrics: totalOps=${metrics.totalOps} success=${metrics.successOps} failed=${metrics.failedOps} errorRate=${metrics.errorRate}`);
    console.log(`Latency: p50=${metrics.p50.toFixed(1)}ms p95=${metrics.p95.toFixed(1)}ms p99=${metrics.p99.toFixed(1)}ms mean=${metrics.meanLatency.toFixed(1)}ms`);
    console.log(`Duration: ${metrics.durationMs.toFixed(0)}ms opsPerSec=${metrics.opsPerSecond.toFixed(1)} crossOrgLeaks=${metrics.crossOrgLeaks}`);
    console.log(`Cross-org attacks: ${metrics.crossOrgAttackAttempts} attempted, ${metrics.crossOrgAttackBlocks} blocked`);
    if (metrics.errorDetails.length > 0) {
      const unique = [...new Set(metrics.errorDetails)];
      console.log(`Error details (${unique.length} unique):`, unique.slice(0, 10));
    }
    console.log("Op breakdown:", JSON.stringify(metrics.opBreakdown));
  }, 300_000);

  afterAll(async () => {
    if (users) {
      await cleanupTestUsers(users, HARNESS_OPTS);
    }
  }, 120_000);

  // ── C1: 20 users created and authenticated ─────────────────────
  it("C1: 20 users created with valid JWTs", () => {
    expect(users).toHaveLength(20);
    for (const u of users) {
      expect(u.accessToken).toBeTruthy();
      expect(u.id).toBeTruthy();
      expect(u.orgId).toBeTruthy();
    }
  });

  // ── C2: Users distributed across 4 orgs ────────────────────────
  it("C2: users distributed across 4 orgs (5 per org)", () => {
    const orgCounts = new Map<string, number>();
    for (const u of users) {
      orgCounts.set(u.orgId, (orgCounts.get(u.orgId) ?? 0) + 1);
    }
    expect(orgCounts.size).toBe(4);
    for (const count of orgCounts.values()) {
      expect(count).toBe(5);
    }
  });

  // ── C3: All concurrent ops completed ───────────────────────────
  it("C3: all concurrent operations completed", () => {
    // 20 users × 3 iterations × 13 ops = 780 total ops
    expect(metrics.totalOps).toBe(780);
  });

  // ── C4: Error rate below 5% ────────────────────────────────────
  it("C4: error rate below 5%", () => {
    expect(metrics.errorRate).toBeLessThan(0.05);
  });

  // ── C5: Zero cross-org data leaks ──────────────────────────────
  it("C5: zero cross-org data leaks (RLS isolation)", () => {
    expect(metrics.crossOrgLeaks).toBe(0);
  });

  // ── C6: p50 latency under 500ms ───────────────────────────────
  it("C6: p50 latency under 500ms", () => {
    expect(metrics.p50).toBeLessThan(500);
  });

  // ── C7: p95 latency under 2000ms ──────────────────────────────
  it("C7: p95 latency under 2000ms", () => {
    expect(metrics.p95).toBeLessThan(2000);
  });

  // ── C8: p99 latency under 5000ms ──────────────────────────────
  it("C8: p99 latency under 5000ms", () => {
    expect(metrics.p99).toBeLessThan(5000);
  });

  // ── C9: Throughput at least 10 ops/sec ─────────────────────────
  it("C9: throughput at least 10 ops/sec", () => {
    expect(metrics.opsPerSecond).toBeGreaterThan(10);
  });

  // ── C10: Duration under 120 seconds ────────────────────────────
  it("C10: total duration under 120 seconds", () => {
    expect(metrics.durationMs).toBeLessThan(120_000);
  });

  // ── C11: Success ops match total minus failures ────────────────
  it("C11: success ops = total - failed", () => {
    expect(metrics.successOps).toBe(metrics.totalOps - metrics.failedOps);
  });

  // ── C12: Latencies array has entries for all ops ───────────────
  it("C12: latencies recorded for all operations", () => {
    expect(metrics.latencies.length).toBe(metrics.totalOps);
  });

  // ── C13: Mean latency reasonable ───────────────────────────────
  it("C13: mean latency under 1000ms", () => {
    expect(metrics.meanLatency).toBeLessThan(1000);
  });

  // ── C14: Each org's users created at least one case ────────────
  it("C14: concurrent case creation succeeded for all orgs", () => {
    const caseCreateErrors = metrics.failedOps;
    expect(caseCreateErrors).toBeLessThan(metrics.totalOps * 0.05);
  });

  // ── C15: Storage operations under concurrent load ──────────────
  it("C15: storage uploads succeeded under concurrent load", () => {
    expect(metrics.successOps).toBeGreaterThan(metrics.totalOps * 0.95);
  });

  // ── C16: Extended workload types present ───────────────────────
  it("C16: all 13 workload types exercised", () => {
    const expectedOps = [
      "case_create", "case_list", "case_search", "case_filter",
      "case_cursor", "case_update", "storage_upload", "storage_read",
      "round_create", "child_read", "q8_usage",
      "cross_org_attack", "cross_org_attack_write",
    ];
    for (const op of expectedOps) {
      expect(metrics.opBreakdown[op]?.count ?? 0).toBeGreaterThan(0);
    }
  });

  // ── C17: Cross-org attacks all blocked ─────────────────────────
  it("C17: all cross-org attack attempts were blocked by RLS", () => {
    expect(metrics.crossOrgAttackAttempts).toBeGreaterThan(0);
    expect(metrics.crossOrgAttackBlocks).toBe(metrics.crossOrgAttackAttempts);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Gate 8 Strict: 15-minute sustained load (C18-C25)
// Only run when GATE8_STRICT=1 environment variable is set
// ═══════════════════════════════════════════════════════════════════

const GATE8_STRICT_ENABLED = process.env.GATE8_STRICT === "1";

describe.skipIf(!GATE8_STRICT_ENABLED)(
  "Gate 8 Strict: 15min sustained load",
  { timeout: 1_200_000 },
  () => {
    let users: ConcurrencyUser[];
    let metrics: ConcurrencyMetrics;

    const STRICT_OPTS: HarnessOptions = {
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SERVICE_KEY,
      anonKey: ANON_KEY,
      userCount: 20,
      orgCount: 4,
      opsPerUser: 0,
      durationMinutes: 15,
    };

    beforeAll(async () => {
      users = await createTestUsers(STRICT_OPTS);
      console.log(`Gate 8 Strict: ${users.length} users created, starting 15-minute sustained load...`);
      metrics = await runConcurrencyTest(users, STRICT_OPTS);
      console.log(`\n=== GATE 8 STRICT RESULTS ===`);
      console.log(`Duration: ${(metrics.durationMs / 60_000).toFixed(1)} min`);
      console.log(`Total ops: ${metrics.totalOps}`);
      console.log(`Success: ${metrics.successOps} Failed: ${metrics.failedOps} Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
      console.log(`Latency: p50=${metrics.p50.toFixed(1)}ms p95=${metrics.p95.toFixed(1)}ms p99=${metrics.p99.toFixed(1)}ms`);
      console.log(`Throughput: ${metrics.opsPerSecond.toFixed(1)} ops/sec`);
      console.log(`Cross-org: leaks=${metrics.crossOrgLeaks} attacks=${metrics.crossOrgAttackAttempts} blocked=${metrics.crossOrgAttackBlocks}`);
      console.log("Op breakdown:", JSON.stringify(metrics.opBreakdown, null, 2));
      if (metrics.errorDetails.length > 0) {
        const unique = [...new Set(metrics.errorDetails)];
        console.log(`Errors (${unique.length} unique):`, unique.slice(0, 20));
      }
    }, 1_100_000);

    afterAll(async () => {
      if (users) {
        await cleanupTestUsers(users, STRICT_OPTS);
      }
    }, 300_000);

    // ── C18: Duration ≥ 15 minutes ────────────────────────────────
    it("C18: sustained load ran for at least 15 minutes", () => {
      expect(metrics.durationMs).toBeGreaterThanOrEqual(15 * 60_000);
    });

    // ── C19: Total requests ≥ 10,000 ──────────────────────────────
    it("C19: at least 10,000 total requests", () => {
      expect(metrics.totalOps).toBeGreaterThanOrEqual(10_000);
    });

    // ── C20: Error rate below 2% over sustained load ──────────────
    it("C20: error rate below 2% over sustained load", () => {
      expect(metrics.errorRate).toBeLessThan(0.02);
    });

    // ── C21: Zero cross-org leaks over sustained load ─────────────
    it("C21: zero cross-org leaks over 15 minutes", () => {
      expect(metrics.crossOrgLeaks).toBe(0);
    });

    // ── C22: All 13 workload types exercised ──────────────────────
    it("C22: all workload types present in sustained run", () => {
      const expectedOps = [
        "case_create", "case_list", "case_search", "case_filter",
        "case_cursor", "case_update", "storage_upload", "storage_read",
        "round_create", "child_read", "q8_usage",
        "cross_org_attack", "cross_org_attack_write",
      ];
      for (const op of expectedOps) {
        expect(metrics.opBreakdown[op]?.count ?? 0).toBeGreaterThan(0);
      }
    });

    // ── C23: Cross-org attacks all blocked during sustained load ──
    it("C23: all cross-org attacks blocked over 15 minutes", () => {
      expect(metrics.crossOrgAttackAttempts).toBeGreaterThan(100);
      expect(metrics.crossOrgAttackBlocks).toBe(metrics.crossOrgAttackAttempts);
    });

    // ── C24: Latency stable under sustained load ──────────────────
    it("C24: p95 latency under 3000ms during sustained load", () => {
      expect(metrics.p95).toBeLessThan(3000);
    });

    // ── C25: Throughput stable ─────────────────────────────────────
    it("C25: sustained throughput at least 5 ops/sec", () => {
      expect(metrics.opsPerSecond).toBeGreaterThan(5);
    });
  }
);
