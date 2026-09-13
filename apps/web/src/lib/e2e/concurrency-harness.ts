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
  errorDetails: string[];
}

export interface HarnessOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  userCount: number;
  orgCount: number;
  opsPerUser: number;
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
}

export async function createTestUsers(
  opts: HarnessOptions
): Promise<ConcurrencyUser[]> {
  const users: ConcurrencyUser[] = [];
  const orgs: string[] = [];

  for (let o = 0; o < opts.orgCount; o++) {
    const orgId = crypto.randomUUID();
    orgs.push(orgId);

    // Create org via PostgREST with service_role
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

    // Create user via Auth Admin API
    const authRes = await supabaseFetch(
      `${opts.supabaseUrl}/auth/v1/admin/users`,
      {
        method: "POST",
        apiKey: opts.serviceRoleKey,
        headers: { Authorization: `Bearer ${opts.serviceRoleKey}` },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
        }),
      }
    );

    if (authRes.status !== 200) {
      throw new Error(`Failed to create user ${u}: ${JSON.stringify(authRes.body)}`);
    }
    const userId = (authRes.body as { id: string }).id;

    // Create or update profile (may already exist from auth trigger)
    await supabaseFetch(`${opts.supabaseUrl}/rest/v1/profiles?on_conflict=id`, {
      method: "POST",
      apiKey: opts.serviceRoleKey,
      headers: {
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: userId,
        display_name: `E2E User ${u}`,
        role: "member",
      }),
    });

    // Add to org
    await supabaseFetch(`${opts.supabaseUrl}/rest/v1/organization_members`, {
      method: "POST",
      apiKey: opts.serviceRoleKey,
      headers: {
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        organization_id: orgId,
        user_id: userId,
      }),
    });

    // Sign in to get JWT
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

async function userWorkload(
  user: ConcurrencyUser,
  opts: HarnessOptions,
  results: { latencies: number[]; errors: number; crossOrgLeaks: number; ops: number; errorDetails: string[] }
): Promise<void> {
  for (let i = 0; i < opts.opsPerUser; i++) {
    // Op 1: Create a case via PostgREST
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
        title: `E2E Case ${i} by ${user.email}`,
        status: "진행중",
        organization_id: user.orgId,
        created_by: user.id,
        author_mode: "lawyer",
      }),
    });
    results.latencies.push(createRes.latency);
    results.ops++;
    if (createRes.status >= 400) {
      results.errors++;
      results.errorDetails.push(`case_create: ${createRes.status} ${JSON.stringify(createRes.body)}`);
    }

    // Op 2: List cases (RLS should filter to own org)
    const listRes = await supabaseFetch(
      `${opts.supabaseUrl}/rest/v1/cases?select=id,organization_id`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    results.latencies.push(listRes.latency);
    results.ops++;
    if (listRes.status >= 400) {
      results.errors++;
      results.errorDetails.push(`case_list: ${listRes.status} ${JSON.stringify(listRes.body)}`);
    } else {
      const cases = listRes.body as Array<{ id: string; organization_id: string }>;
      for (const c of cases) {
        if (c.organization_id !== user.orgId) {
          results.crossOrgLeaks++;
        }
      }
    }

    // Op 3: Upload a small file to storage
    const filePath = `${caseId}/e2e-test-${i}.txt`;
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
    results.latencies.push(uploadRes.latency);
    results.ops++;
    if (uploadRes.status >= 400) {
      results.errors++;
      results.errorDetails.push(`storage_upload: ${uploadRes.status} ${JSON.stringify(uploadRes.body)}`);
    }

    // Op 4: Read the uploaded file
    const readRes = await supabaseFetch(
      `${opts.supabaseUrl}/storage/v1/object/authenticated/case-files/${filePath}`,
      {
        method: "GET",
        apiKey: opts.anonKey,
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    results.latencies.push(readRes.latency);
    results.ops++;
    if (readRes.status >= 400) {
      results.errors++;
      results.errorDetails.push(`storage_read: ${readRes.status} ${JSON.stringify(readRes.body)}`);
    }

    // Op 5: Create a round for the case
    const roundRes = await supabaseFetch(`${opts.supabaseUrl}/rest/v1/rounds`, {
      method: "POST",
      apiKey: opts.anonKey,
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        case_id: caseId,
        kind: "소장",
        seq: 1,
      }),
    });
    results.latencies.push(roundRes.latency);
    results.ops++;
    if (roundRes.status >= 400) {
      results.errors++;
      results.errorDetails.push(`round_create: ${roundRes.status} ${JSON.stringify(roundRes.body)}`);
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
    ops: 0,
    errorDetails: [] as string[],
  }));

  const start = performance.now();

  // Run all users concurrently
  await Promise.all(
    users.map((user, idx) => userWorkload(user, opts, allResults[idx]))
  );

  const durationMs = performance.now() - start;

  const allLatencies = allResults.flatMap((r) => r.latencies);
  const totalOps = allResults.reduce((s, r) => s + r.ops, 0);
  const failedOps = allResults.reduce((s, r) => s + r.errors, 0);
  const crossOrgLeaks = allResults.reduce((s, r) => s + r.crossOrgLeaks, 0);
  const errorDetails = allResults.flatMap((r) => r.errorDetails);

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
    errorDetails,
  };
}

export async function cleanupTestUsers(
  users: ConcurrencyUser[],
  opts: HarnessOptions
): Promise<void> {
  const orgIds = [...new Set(users.map((u) => u.orgId))];

  for (const user of users) {
    // Delete user's cases and related data
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
    // Delete auth user
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
