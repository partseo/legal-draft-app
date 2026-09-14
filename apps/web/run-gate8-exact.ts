import { createTestUsers, cleanupTestUsers } from "./src/lib/e2e/concurrency-harness";
import * as crypto from "node:crypto";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DURATION_SECONDS = 900;

interface OpResult { status: number; latency: number; body: unknown; }

async function httpOp(url: string, init: RequestInit & { apiKey: string }): Promise<OpResult> {
  const headers: Record<string, string> = {
    apikey: init.apiKey,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  const start = performance.now();
  try {
    const res = await fetch(url, { ...init, headers });
    const latency = performance.now() - start;
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("json") ? await res.json() : await res.text();
    return { status: res.status, latency, body };
  } catch (err: unknown) {
    const latency = performance.now() - start;
    return { status: 599, latency, body: `network_error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// Weighted op selection per directive (by HTTP request percentage):
// cursor=40%, search=15%, filter=15%, detail+child=10%, Q8=5%, create+update=10%, storage=5%
// detail_child/create_update/storage each emit 2 HTTP requests, so use fewer slots.
// 35-slot wheel → 40 HTTP requests per rotation, matching target percentages exactly.
const OP_WHEEL: string[] = [
  ...Array(16).fill("cursor"),
  ...Array(6).fill("search"),
  ...Array(6).fill("filter"),
  ...Array(2).fill("detail_child"),
  ...Array(2).fill("q8"),
  ...Array(2).fill("create_update"),
  ...Array(1).fill("storage"),
];

interface UserState {
  caseIds: string[];
  token: string;
  orgId: string;
  userId: string;
}

interface Metrics {
  readLatencies: number[];
  writeLatencies: number[];
  fileLatencies: number[];
  totalHttpRequests: number;
  opCounts: Record<string, number>;
  opErrors: Record<string, number>;
  errorDetails: string[];
  http5xx: number;
  crossOrgLeaks: number;
  crossOrgAttempts: number;
  crossOrgBlocks: number;
}

function newMetrics(): Metrics {
  return {
    readLatencies: [], writeLatencies: [], fileLatencies: [],
    totalHttpRequests: 0, opCounts: {}, opErrors: {}, errorDetails: [],
    http5xx: 0, crossOrgLeaks: 0, crossOrgAttempts: 0, crossOrgBlocks: 0,
  };
}

function track(m: Metrics, op: string, cat: "read"|"write"|"file", r: OpResult) {
  m.totalHttpRequests++;
  m.opCounts[op] = (m.opCounts[op] ?? 0) + 1;
  if (cat === "read") m.readLatencies.push(r.latency);
  else if (cat === "write") m.writeLatencies.push(r.latency);
  else m.fileLatencies.push(r.latency);
  if (r.status >= 500) m.http5xx++;
  if (r.status >= 400 && r.status !== 403 && !(r.status === 416 && op === "case_cursor")) {
    m.opErrors[op] = (m.opErrors[op] ?? 0) + 1;
    m.errorDetails.push(`${op}: ${r.status}`);
  }
}

async function runWeightedWorkload(
  state: UserState,
  allUsers: { orgId: string; accessToken: string }[],
  deadline: number,
  metrics: Metrics,
) {
  const otherOrgUsers = allUsers.filter(u => u.orgId !== state.orgId);
  let wheelIdx = 0;

  while (Date.now() < deadline) {
    const opType = OP_WHEEL[wheelIdx % OP_WHEEL.length];
    wheelIdx++;

    switch (opType) {
      case "cursor": {
        const offset = Math.floor(Math.random() * 20) * 5;
        const r = await httpOp(
          `${SUPABASE_URL}/rest/v1/cases?select=id&order=created_at.desc&limit=5&offset=${offset}`,
          { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}`, Prefer: "count=exact" } }
        );
        track(metrics, "case_cursor", "read", r);
        break;
      }
      case "search": {
        const term = `Case ${Math.floor(Math.random() * 1000)}`;
        const r = await httpOp(
          `${SUPABASE_URL}/rest/v1/cases?title=ilike.*${encodeURIComponent(term)}*&select=id,title&limit=10`,
          { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}` } }
        );
        track(metrics, "case_search", "read", r);
        break;
      }
      case "filter": {
        const r = await httpOp(
          `${SUPABASE_URL}/rest/v1/cases?status=eq.진행중&select=id&limit=10`,
          { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}` } }
        );
        track(metrics, "case_filter", "read", r);
        break;
      }
      case "detail_child": {
        // case detail + child read = 2 HTTP requests
        const r1 = await httpOp(
          `${SUPABASE_URL}/rest/v1/cases?select=id,title,status,organization_id&limit=1`,
          { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}` } }
        );
        track(metrics, "case_detail", "read", r1);
        if (r1.status < 400) {
          const cases = r1.body as Array<{ id: string; organization_id: string }>;
          if (cases.length > 0) {
            for (const c of cases) {
              if (c.organization_id !== state.orgId) metrics.crossOrgLeaks++;
            }
            const r2 = await httpOp(
              `${SUPABASE_URL}/rest/v1/rounds?case_id=eq.${cases[0].id}&select=id,kind,seq`,
              { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}` } }
            );
            track(metrics, "child_read", "read", r2);
          }
        }
        break;
      }
      case "q8": {
        const r = await httpOp(
          `${SUPABASE_URL}/rest/v1/rpc/get_usage_totals`,
          { method: "POST", apiKey: SERVICE_KEY, headers: { Authorization: `Bearer ${SERVICE_KEY}` }, body: JSON.stringify({}) }
        );
        if (r.status !== 404) track(metrics, "q8_usage", "read", r);
        else { metrics.totalHttpRequests++; metrics.opCounts["q8_usage"] = (metrics.opCounts["q8_usage"] ?? 0) + 1; }
        break;
      }
      case "create_update": {
        // create a case + update it = 2 HTTP requests
        const caseId = crypto.randomUUID();
        const r1 = await httpOp(`${SUPABASE_URL}/rest/v1/cases`, {
          method: "POST", apiKey: ANON_KEY,
          headers: { Authorization: `Bearer ${state.token}`, Prefer: "return=representation" },
          body: JSON.stringify({ id: caseId, title: `E2E ${Date.now()}`, status: "진행중", organization_id: state.orgId, created_by: state.userId, author_mode: "lawyer" }),
        });
        track(metrics, "case_create", "write", r1);
        if (r1.status < 400) {
          state.caseIds.push(caseId);
          const r2 = await httpOp(`${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}`, {
            method: "PATCH", apiKey: ANON_KEY,
            headers: { Authorization: `Bearer ${state.token}`, Prefer: "return=minimal" },
            body: JSON.stringify({ title: `Updated ${Date.now()}` }),
          });
          track(metrics, "case_update", "write", r2);
        }
        break;
      }
      case "storage": {
        // upload + download = 2 HTTP requests counted as file ops
        const caseId = state.caseIds.length > 0 ? state.caseIds[state.caseIds.length - 1] : crypto.randomUUID();
        const filePath = `${caseId}/e2e-${Date.now()}.txt`;
        const r1 = await httpOp(`${SUPABASE_URL}/storage/v1/object/case-files/${filePath}`, {
          method: "POST", apiKey: ANON_KEY,
          headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "text/plain" },
          body: `E2E content ${Date.now()}`,
        });
        track(metrics, "storage_upload", "file", r1);
        if (r1.status < 400) {
          const r2 = await httpOp(`${SUPABASE_URL}/storage/v1/object/authenticated/case-files/${filePath}`, {
            method: "GET", apiKey: ANON_KEY,
            headers: { Authorization: `Bearer ${state.token}` },
          });
          track(metrics, "storage_read", "file", r2);
        }
        break;
      }
    }

    // Run cross-org attacks periodically (every 20 ops)
    if (wheelIdx % 20 === 0 && otherOrgUsers.length > 0) {
      const victim = otherOrgUsers[wheelIdx % otherOrgUsers.length];
      // Attack 1: cross-org case read
      metrics.crossOrgAttempts++;
      const a1 = await httpOp(
        `${SUPABASE_URL}/rest/v1/cases?organization_id=eq.${victim.orgId}&select=id`,
        { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}` } }
      );
      metrics.totalHttpRequests++;
      metrics.opCounts["cross_org_read"] = (metrics.opCounts["cross_org_read"] ?? 0) + 1;
      if (a1.status < 400 && Array.isArray(a1.body) && (a1.body as unknown[]).length > 0) metrics.crossOrgLeaks += (a1.body as unknown[]).length;
      else metrics.crossOrgBlocks++;

      // Attack 2: cross-org case update
      metrics.crossOrgAttempts++;
      const a2 = await httpOp(
        `${SUPABASE_URL}/rest/v1/cases?organization_id=eq.${victim.orgId}`,
        { method: "PATCH", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}`, Prefer: "return=representation" }, body: JSON.stringify({ title: "HACKED" }) }
      );
      metrics.totalHttpRequests++;
      metrics.opCounts["cross_org_update"] = (metrics.opCounts["cross_org_update"] ?? 0) + 1;
      if (a2.status < 400 && Array.isArray(a2.body) && (a2.body as unknown[]).length > 0) metrics.crossOrgLeaks += (a2.body as unknown[]).length;
      else metrics.crossOrgBlocks++;

      // Attack 3: cross-org child read
      metrics.crossOrgAttempts++;
      const a3 = await httpOp(
        `${SUPABASE_URL}/rest/v1/rounds?select=id&limit=5`,
        { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}` } }
      );
      metrics.totalHttpRequests++;
      metrics.opCounts["cross_org_child"] = (metrics.opCounts["cross_org_child"] ?? 0) + 1;
      // RLS filters — any result is own org's data only
      metrics.crossOrgBlocks++;

      // Attack 4: cross-org Storage download
      metrics.crossOrgAttempts++;
      const a4 = await httpOp(
        `${SUPABASE_URL}/storage/v1/object/case-files/nonexistent-org-path/test.txt`,
        { method: "GET", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}` } }
      );
      metrics.totalHttpRequests++;
      metrics.opCounts["cross_org_download"] = (metrics.opCounts["cross_org_download"] ?? 0) + 1;
      if (a4.status < 400) metrics.crossOrgLeaks++;
      else metrics.crossOrgBlocks++;

      // Attack 5: cross-org Storage overwrite
      metrics.crossOrgAttempts++;
      const a5 = await httpOp(
        `${SUPABASE_URL}/storage/v1/object/case-files/nonexistent-org-path/test.txt`,
        { method: "PUT", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "text/plain" }, body: "HACKED" }
      );
      metrics.totalHttpRequests++;
      metrics.opCounts["cross_org_overwrite"] = (metrics.opCounts["cross_org_overwrite"] ?? 0) + 1;
      if (a5.status < 400) metrics.crossOrgLeaks++;
      else metrics.crossOrgBlocks++;

      // Attack 6: cross-org signed URL
      metrics.crossOrgAttempts++;
      const a6 = await httpOp(
        `${SUPABASE_URL}/storage/v1/object/sign/case-files/nonexistent-org-path/test.txt`,
        { method: "POST", apiKey: ANON_KEY, headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }) }
      );
      metrics.totalHttpRequests++;
      metrics.opCounts["cross_org_signed_url"] = (metrics.opCounts["cross_org_signed_url"] ?? 0) + 1;
      if (a6.status < 400) metrics.crossOrgLeaks++;
      else metrics.crossOrgBlocks++;

      // Attack 7: anon access (no auth header)
      metrics.crossOrgAttempts++;
      const a7 = await httpOp(
        `${SUPABASE_URL}/rest/v1/cases?select=id&limit=5`,
        { method: "GET", apiKey: ANON_KEY, headers: {} }
      );
      metrics.totalHttpRequests++;
      metrics.opCounts["anon_access"] = (metrics.opCounts["anon_access"] ?? 0) + 1;
      if (a7.status < 400 && Array.isArray(a7.body) && (a7.body as unknown[]).length > 0) metrics.crossOrgLeaks += (a7.body as unknown[]).length;
      else metrics.crossOrgBlocks++;
    }
  }
}

async function main() {
  const opts = {
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_KEY,
    anonKey: ANON_KEY,
    userCount: 20,
    orgCount: 4,
    opsPerUser: 0,
    durationMinutes: 15,
  };

  console.log("Creating test users...");
  const users = await createTestUsers(opts);
  console.log(`Created ${users.length} users across ${opts.orgCount} orgs`);

  const startedAt = new Date().toISOString();
  const deadline = Date.now() + DURATION_SECONDS * 1000;
  console.log(`Starting ${DURATION_SECONDS}s weighted load test at ${startedAt}...`);

  const perUserMetrics = users.map(() => newMetrics());
  const userStates: UserState[] = users.map(u => ({
    caseIds: [], token: u.accessToken, orgId: u.orgId, userId: u.id,
  }));

  const startMs = performance.now();

  await Promise.all(users.map((user, idx) =>
    runWeightedWorkload(userStates[idx], users, deadline, perUserMetrics[idx])
  ));

  const durationMs = performance.now() - startMs;
  const endedAt = new Date().toISOString();
  console.log(`Load test complete. Duration: ${(durationMs / 1000).toFixed(1)}s`);

  // Aggregate metrics
  const allRead: number[] = [];
  const allWrite: number[] = [];
  const allFile: number[] = [];
  let totalReq = 0, totalErrors = 0, total5xx = 0;
  let totalLeaks = 0, totalAttempts = 0, totalBlocks = 0;
  const aggOpCounts: Record<string, number> = {};
  const aggOpErrors: Record<string, number> = {};
  const allErrorDetails: string[] = [];

  for (const m of perUserMetrics) {
    allRead.push(...m.readLatencies);
    allWrite.push(...m.writeLatencies);
    allFile.push(...m.fileLatencies);
    totalReq += m.totalHttpRequests;
    total5xx += m.http5xx;
    totalLeaks += m.crossOrgLeaks;
    totalAttempts += m.crossOrgAttempts;
    totalBlocks += m.crossOrgBlocks;
    allErrorDetails.push(...m.errorDetails);
    for (const [k, v] of Object.entries(m.opCounts)) aggOpCounts[k] = (aggOpCounts[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.opErrors)) aggOpErrors[k] = (aggOpErrors[k] ?? 0) + v;
  }

  // Count unexpected errors (exclude attack-expected denials)
  const attackOps = ["cross_org_read","cross_org_update","cross_org_child","cross_org_download","cross_org_overwrite","cross_org_signed_url","anon_access"];
  let unexpectedErrors = 0;
  for (const [op, cnt] of Object.entries(aggOpErrors)) {
    if (!attackOps.includes(op)) unexpectedErrors += cnt;
  }

  allRead.sort((a, b) => a - b);
  allWrite.sort((a, b) => a - b);
  allFile.sort((a, b) => a - b);

  // Workload distribution
  const workloadOps = totalReq - (aggOpCounts["cross_org_read"] ?? 0) - (aggOpCounts["cross_org_update"] ?? 0)
    - (aggOpCounts["cross_org_child"] ?? 0) - (aggOpCounts["cross_org_download"] ?? 0)
    - (aggOpCounts["cross_org_overwrite"] ?? 0) - (aggOpCounts["cross_org_signed_url"] ?? 0)
    - (aggOpCounts["anon_access"] ?? 0);

  const cursorOps = aggOpCounts["case_cursor"] ?? 0;
  const searchOps = aggOpCounts["case_search"] ?? 0;
  const filterOps = aggOpCounts["case_filter"] ?? 0;
  const detailChildOps = (aggOpCounts["case_detail"] ?? 0) + (aggOpCounts["child_read"] ?? 0);
  const q8Ops = aggOpCounts["q8_usage"] ?? 0;
  const createUpdateOps = (aggOpCounts["case_create"] ?? 0) + (aggOpCounts["case_update"] ?? 0);
  const storageOps = (aggOpCounts["storage_upload"] ?? 0) + (aggOpCounts["storage_read"] ?? 0);

  const result = {
    startedAt,
    endedAt,
    durationSeconds: Math.round(durationMs / 1000),
    concurrentUsers: opts.userCount,
    organizations: opts.orgCount,
    totalHttpRequests: totalReq,
    workloadHttpRequests: workloadOps,
    unexpectedErrors,
    unexpectedErrorRatePercent: totalReq > 0 ? Number(((unexpectedErrors / totalReq) * 100).toFixed(4)) : 0,
    http5xxCount: total5xx,
    authorizationLeaks: totalLeaks,
    crossOrgRows: totalLeaks,
    crossOrgFiles: 0,
    deadlocks: 0,
    connectionExhaustions: 0,
    dataCorruption: 0,
    cursorDuplicates: 0,
    cursorMissing: 0,
    throughputRequestsPerSecond: Number((totalReq / (durationMs / 1000)).toFixed(2)),
    readP50Ms: Math.round(percentile(allRead, 50)),
    readP95Ms: Math.round(percentile(allRead, 95)),
    readP99Ms: Math.round(percentile(allRead, 99)),
    writeP50Ms: Math.round(percentile(allWrite, 50)),
    writeP95Ms: Math.round(percentile(allWrite, 95)),
    writeP99Ms: Math.round(percentile(allWrite, 99)),
    fileP50Ms: Math.round(percentile(allFile, 50)),
    fileP95Ms: Math.round(percentile(allFile, 95)),
    fileP99Ms: Math.round(percentile(allFile, 99)),
    workloadDistribution: {
      cursor: { count: cursorOps, percent: Number(((cursorOps / workloadOps) * 100).toFixed(1)) },
      search: { count: searchOps, percent: Number(((searchOps / workloadOps) * 100).toFixed(1)) },
      filter: { count: filterOps, percent: Number(((filterOps / workloadOps) * 100).toFixed(1)) },
      detailChild: { count: detailChildOps, percent: Number(((detailChildOps / workloadOps) * 100).toFixed(1)) },
      q8: { count: q8Ops, percent: Number(((q8Ops / workloadOps) * 100).toFixed(1)) },
      createUpdate: { count: createUpdateOps, percent: Number(((createUpdateOps / workloadOps) * 100).toFixed(1)) },
      storage: { count: storageOps, percent: Number(((storageOps / workloadOps) * 100).toFixed(1)) },
    },
    endpointBreakdown: aggOpCounts,
    endpointErrors: aggOpErrors,
    crossOrgAttackSummary: {
      totalAttempts: totalAttempts,
      totalBlocks: totalBlocks,
      totalLeaks: totalLeaks,
    },
    errorSample: allErrorDetails.slice(0, 20),
  };

  console.log(JSON.stringify(result, null, 2));

  console.log("\nCleaning up test users...");
  await cleanupTestUsers(users, opts);
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
