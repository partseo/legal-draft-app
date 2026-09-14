import * as crypto from "node:crypto";

export interface ConcurrencyUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  orgId: string;
}

export interface ConcurrencyMetrics {
  totalOps: number;
  successOps: number;
  failedOps: number;
  errorRate: number;
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  meanLatency: number;
  durationMs: number;
  opsPerSecond: number;
  crossOrgLeaks: number;
  crossOrgAttackBlocks: number;
  crossOrgAttackAttempts: number;
  errorDetails: string[];
  opBreakdown: Record<string, { count: number; errors: number }>;
}

export interface HarnessOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  userCount: number;
  orgCount: number;
  opsPerUser: number;
  durationMinutes?: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function supabaseFetch(
  url: string,
  opts: RequestInit & { apiKey: string }
): Promise<{ status: number; body: unknown; latency: number }> {
  const headers: Record<string, string> = {
    apikey: opts.apiKey,
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };

  const start = performance.now();
  try {
    const res = await fetch(url, { ...opts, headers });
    const latency = performance.now() - start;

    let body: unknown;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    return { status: res.status, body, latency };
  } catch (err: unknown) {
    const latency = performance.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 599, body: `network_error: ${msg}`, latency };
  }
}

export async function createTestUsers(
  opts: HarnessOptions
): Promise<ConcurrencyUser[]> {
  const users: ConcurrencyUser[] = [];
  const orgs: string[] = [];

  for (let o = 0; o < opts.orgCount; o++) {
    const orgId = crypto.randomUUID();
    orgs.push(orgId);

    await supabaseFetch(`${opts.supabaseUrl}/rest/v1/organizations`, {
      method: "POST",
      apiKey: opts.serviceRoleKey,
      headers: {
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ id: orgId, name: `E2E Org ${o}` }),
    });
  }

  for (let u = 0; u < opts.userCount; u++) {
    const orgId = orgs[u % opts.orgCount];
    const email = `e2e-user-${u}-${Date.now()}@test.local`;
    const password = `TestPass${u}!2026`;

    const authRes = await supabaseFetch(
      `${opts.supabaseUrl}/auth/v1/admin/users`,
      {
        method: "POST",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
        body: JSON.stringify({ email, password, email_confirm: true }),
      }
    );

    if (authRes.status !== 200) {
      throw new Error(`Failed to create user ${u}: ${JSON.stringify(authRes.body)}`);
    }
    const userId = (authRes.body as { id: string }).id;

    await supabaseFetch(`${opts.supabaseUrl}/rest/v1/profiles?on_conflict=id`, {
      method: "POST",
      apiKey: opts.serviceRoleKey,
      headers: {
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ id: userId, display_name: `E2E User ${u}`, role: "member" }),
    });

    await supabaseFetch(`${opts.supabaseUrl}/rest/v1/organization_members`, {
      method: "POST",
      apiKey: opts.serviceRoleKey,
      headers: {
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ organization_id: orgId, user_id: userId }),
    });

    const loginRes = await supabaseFetch(
      `${opts.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        apiKey: opts.anonKey,
        body: JSON.stringify({ email, password }),
      }
    );

    if (loginRes.status !== 200) {
      throw new Error(`Failed to sign in user ${u}: ${JSON.stringify(loginRes.body)}`);
    }
    const accessToken = (loginRes.body as { access_token: string }).access_token;

    users.push({ id: userId, email, password, accessToken, orgId });
  }

  return users;
}

interface WorkloadResults {
  latencies: number[];
  errors: number;
  crossOrgLeaks: number;
  crossOrgAttackBlocks: number;
  crossOrgAttackAttempts: number;
  ops: number;
  errorDetails: string[];
  opBreakdown: Record<string, { count: number; errors: number }>;
}

function trackOp(
  results: WorkloadResults,
  opName: string,
  latency: number,
  isError: boolean,
  errorDetail?: string
) {
  results.latencies.push(latency);
  results.ops++;
  if (!results.opBreakdown[opName]) {
    results.opBreakdown[opName] = { count: 0, errors: 0 };
  }
  results.opBreakdown[opName].count++;
  if (isError) {
    results.errors++;
    results.opBreakdown[opName].errors++;
    if (errorDetail) results.errorDetails.push(errorDetail);
  }
}

async function extendedUserWorkload(
  user: ConcurrencyUser,
  allUsers: ConcurrencyUser[],
  opts: HarnessOptions,
  results: WorkloadResults,
  deadline?: number,
): Promise<void> {
  const otherOrgUsers = allUsers.filter(u => u.orgId !== user.orgId);
  let iteration = 0;

  const shouldContinue = () => {
    if (deadline) return Date.now() < deadline;
    return iteration < opts.opsPerUser;
  };

  while (shouldContinue()) {
    iteration++;

    // Op 1: Create case
    const caseId = crypto.randomUUID();
    const createRes = await supabaseFetch(`${opts.supabaseUrl}/rest/v1/cases`, {
      method: "POST",
      apiKey: opts.anonKey,
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: caseId,
        title: `E2E Case ${iteration} by ${user.email}`,
        status: "진행중",
        organization_id: user.orgId,
        created_by: user.id,
        author_mode: "lawyer",
      }),
    });
    trackOp(results, "case_create", createRes.latency, createRes.status >= 400,
      createRes.status >= 400 ? `case_create: ${createRes.status} ${JSON.stringify(createRes.body)}` : undefined);

    // Op 2: List cases (RLS check)
    const listRes = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/cases?select=id,organization_id`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    trackOp(results, "case_list", listRes.latency, listRes.status >= 400,
      listRes.status >= 400 ? `case_list: ${listRes.status}` : undefined);
    if (listRes.status < 400) {
      const cases = listRes.body as Array<{ id: string; organization_id: string }>;
      for (const c of cases) {
        if (c.organization_id !== user.orgId) results.crossOrgLeaks++;
      }
    }

    // Op 3: Search cases by title (ilike)
    const searchRes = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/cases?title=ilike.*Case ${iteration}*&select=id,title`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    trackOp(results, "case_search", searchRes.latency, searchRes.status >= 400,
      searchRes.status >= 400 ? `case_search: ${searchRes.status}` : undefined);

    // Op 4: Filter cases by status
    const filterRes = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/cases?status=eq.진행중&select=id&limit=10`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    trackOp(results, "case_filter", filterRes.latency, filterRes.status >= 400,
      filterRes.status >= 400 ? `case_filter: ${filterRes.status}` : undefined);

    // Op 5: Cursor pagination (offset-based via Range header)
    const cursorRes = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/cases?select=id&order=created_at.desc&limit=5&offset=0`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          Prefer: "count=exact",
        },
      }
    );
    trackOp(results, "case_cursor", cursorRes.latency, cursorRes.status >= 400,
      cursorRes.status >= 400 ? `case_cursor: ${cursorRes.status}` : undefined);

    // Op 6: Update case title
    const updateRes = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/cases?id=eq.${caseId}`,
      {
        method: "PATCH",
        apiKey: opts.anonKey,
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ title: `Updated Case ${iteration}` }),
      }
    );
    trackOp(results, "case_update", updateRes.latency, updateRes.status >= 400,
      updateRes.status >= 400 ? `case_update: ${updateRes.status}` : undefined);

    // Op 7: Upload storage file
    const filePath = `${caseId}/e2e-test-${iteration}.txt`;
    const fileContent = `E2E test content from ${user.email} at ${new Date().toISOString()}`;
    const uploadRes = await supabaseFetch(
      `${opts.supabaseUrl}/storage/v1/object/case-files/${filePath}`,
      {
        method: "POST",
        apiKey: opts.anonKey,
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          "Content-Type": "text/plain",
        },
        body: fileContent,
      }
    );
    trackOp(results, "storage_upload", uploadRes.latency, uploadRes.status >= 400,
      uploadRes.status >= 400 ? `storage_upload: ${uploadRes.status}` : undefined);

    // Op 8: Read storage file
    const readRes = await supabaseFetch(
      `${opts.supabaseUrl}/storage/v1/object/authenticated/case-files/${filePath}`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    trackOp(results, "storage_read", readRes.latency, readRes.status >= 400,
      readRes.status >= 400 ? `storage_read: ${readRes.status}` : undefined);

    // Op 9: Create round (child record)
    const roundId = crypto.randomUUID();
    const roundRes = await supabaseFetch(`${opts.supabaseUrl}/rest/v1/rounds`, {
      method: "POST",
      apiKey: opts.anonKey,
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ id: roundId, case_id: caseId, kind: "소장", seq: 1 }),
    });
    trackOp(results, "round_create", roundRes.latency, roundRes.status >= 400,
      roundRes.status >= 400 ? `round_create: ${roundRes.status}` : undefined);

    // Op 10: Read child records (rounds for this case)
    const childRes = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/rounds?case_id=eq.${caseId}&select=id,kind,seq`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    trackOp(results, "child_read", childRes.latency, childRes.status >= 400,
      childRes.status >= 400 ? `child_read: ${childRes.status}` : undefined);

    // Op 11: Q8 usage aggregation (sum cost_usd from runs via service_role RPC)
    const q8Res = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/rpc/get_usage_totals`,
      {
        method: "POST",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
        body: JSON.stringify({}),
      }
    );
    trackOp(results, "q8_usage", q8Res.latency, q8Res.status >= 400 && q8Res.status !== 404,
      q8Res.status >= 400 && q8Res.status !== 404 ? `q8_usage: ${q8Res.status}` : undefined);

    // Op 12: Cross-org attack — try to read another org's cases
    if (otherOrgUsers.length > 0) {
      const victim = otherOrgUsers[iteration % otherOrgUsers.length];
      results.crossOrgAttackAttempts++;
      const attackRes = await supabaseFetch(
        `${opts.supabaseUrl}/rest/v1/cases?organization_id=eq.${victim.orgId}&select=id`,
        {
          method: "GET",
          apiKey: opts.anonKey,
          headers: { Authorization: `Bearer ${user.accessToken}` },
        }
      );
      trackOp(results, "cross_org_attack", attackRes.latency, false);
      if (attackRes.status < 400) {
        const leaked = attackRes.body as Array<{ id: string }>;
        if (leaked.length > 0) {
          results.crossOrgLeaks += leaked.length;
        } else {
          results.crossOrgAttackBlocks++;
        }
      } else {
        results.crossOrgAttackBlocks++;
      }
    }

    // Op 13: Cross-org attack — try to update another org's case
    if (otherOrgUsers.length > 0) {
      const victim = otherOrgUsers[iteration % otherOrgUsers.length];
      results.crossOrgAttackAttempts++;
      const attackUpdateRes = await supabaseFetch(
        `${opts.supabaseUrl}/rest/v1/cases?organization_id=eq.${victim.orgId}`,
        {
          method: "PATCH",
          apiKey: opts.anonKey,
          headers: {
            Authorization: `Bearer ${user.accessToken}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify({ title: "HACKED" }),
        }
      );
      trackOp(results, "cross_org_attack_write", attackUpdateRes.latency, false);
      if (attackUpdateRes.status < 400) {
        const affected = attackUpdateRes.body as unknown[];
        if (Array.isArray(affected) && affected.length > 0) {
          results.crossOrgLeaks += affected.length;
        } else {
          results.crossOrgAttackBlocks++;
        }
      } else {
        results.crossOrgAttackBlocks++;
      }
    }
  }
}

export async function runConcurrencyTest(
  users: ConcurrencyUser[],
  opts: HarnessOptions
): Promise<ConcurrencyMetrics> {
  const allResults = users.map(() => ({
    latencies: [] as number[],
    errors: 0,
    crossOrgLeaks: 0,
    crossOrgAttackBlocks: 0,
    crossOrgAttackAttempts: 0,
    ops: 0,
    errorDetails: [] as string[],
    opBreakdown: {} as Record<string, { count: number; errors: number }>,
  }));

  const deadline = opts.durationMinutes
    ? Date.now() + opts.durationMinutes * 60_000
    : undefined;

  const start = performance.now();

  await Promise.all(
    users.map((user, idx) =>
      extendedUserWorkload(user, users, opts, allResults[idx], deadline)
    )
  );

  const durationMs = performance.now() - start;

  const allLatencies = allResults.flatMap((r) => r.latencies);
  const totalOps = allResults.reduce((s, r) => s + r.ops, 0);
  const failedOps = allResults.reduce((s, r) => s + r.errors, 0);
  const crossOrgLeaks = allResults.reduce((s, r) => s + r.crossOrgLeaks, 0);
  const crossOrgAttackBlocks = allResults.reduce((s, r) => s + r.crossOrgAttackBlocks, 0);
  const crossOrgAttackAttempts = allResults.reduce((s, r) => s + r.crossOrgAttackAttempts, 0);
  const errorDetails = allResults.flatMap((r) => r.errorDetails);

  const opBreakdown: Record<string, { count: number; errors: number }> = {};
  for (const r of allResults) {
    for (const [name, stats] of Object.entries(r.opBreakdown)) {
      if (!opBreakdown[name]) opBreakdown[name] = { count: 0, errors: 0 };
      opBreakdown[name].count += stats.count;
      opBreakdown[name].errors += stats.errors;
    }
  }

  allLatencies.sort((a, b) => a - b);

  return {
    totalOps,
    successOps: totalOps - failedOps,
    failedOps,
    errorRate: totalOps > 0 ? failedOps / totalOps : 0,
    latencies: allLatencies,
    p50: percentile(allLatencies, 50),
    p95: percentile(allLatencies, 95),
    p99: percentile(allLatencies, 99),
    meanLatency:
      allLatencies.length > 0
        ? allLatencies.reduce((s, v) => s + v, 0) / allLatencies.length
        : 0,
    durationMs,
    opsPerSecond: durationMs > 0 ? (totalOps / durationMs) * 1000 : 0,
    crossOrgLeaks,
    crossOrgAttackBlocks,
    crossOrgAttackAttempts,
    errorDetails,
    opBreakdown,
  };
}

export async function cleanupTestUsers(
  users: ConcurrencyUser[],
  opts: HarnessOptions
): Promise<void> {
  const orgIds = [...new Set(users.map((u) => u.orgId))];

  for (const user of users) {
    await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/rounds?case_id=in.(select id from cases where created_by=eq.${user.id})`,
      {
        method: "DELETE",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
      }
    );
    await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/cases?created_by=eq.${user.id}`,
      {
        method: "DELETE",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
      }
    );
    await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/organization_members?user_id=eq.${user.id}`,
      {
        method: "DELETE",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
      }
    );
    await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`,
      {
        method: "DELETE",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
      }
    );
    await supabaseFetch(
      `${opts.supabaseUrl}/auth/v1/admin/users/${user.id}`,
      {
        method: "DELETE",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
      }
    );
  }

  for (const orgId of orgIds) {
    await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`,
      {
        method: "DELETE",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
      }
    );
  }
}
