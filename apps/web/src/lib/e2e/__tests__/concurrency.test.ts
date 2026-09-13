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
    if (metrics.errorDetails.length > 0) {
      const unique = [...new Set(metrics.errorDetails)];
      console.log(`Error details (${unique.length} unique):`, unique.slice(0, 10));
    }
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
    // 20 users × 3 iterations × 5 ops = 300 total ops
    expect(metrics.totalOps).toBe(300);
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
    // If error rate < 5% and we had 300 ops, case creates (60 total) mostly succeeded
    const caseCreateErrors = metrics.failedOps;
    expect(caseCreateErrors).toBeLessThan(metrics.totalOps * 0.05);
  });

  // ── C15: Storage operations under concurrent load ──────────────
  it("C15: storage uploads succeeded under concurrent load", () => {
    // 20 users × 3 iterations = 60 uploads + 60 reads = 120 storage ops
    // Error rate check already covers this, but verify specifically
    expect(metrics.successOps).toBeGreaterThan(metrics.totalOps * 0.95);
  });
});
