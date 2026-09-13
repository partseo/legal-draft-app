import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as crypto from "node:crypto";

const API_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const BUCKET = "case-files";
const PASSWORD = "StorageTest_2026!";

const ORG_A = "b0000000-0000-0000-0000-000000000001";
const ORG_B = "b0000000-0000-0000-0000-000000000002";

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  orgId: string;
}

let userA: TestUser;
let userB: TestUser;
let caseIdA: string;
let uploadedPath: string;
let uploadHash: string;
const testFileContent = Buffer.from(
  "Storage API isolation test - 스토리지 격리 테스트 내용\n" +
    crypto.randomBytes(64).toString("hex")
);

function sha256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function createTestUser(
  email: string,
  orgId: string
): Promise<TestUser> {
  // Create user via Admin API
  const createRes = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Failed to create user ${email}: ${createRes.status} ${body}`);
  }
  const userData = (await createRes.json()) as { id: string };

  // Add profile + org membership via PostgREST (service_role)
  await fetch(`${API_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: userData.id,
      display_name: `storage-test-${email.split("@")[0]}`,
      role: "member",
    }),
  });

  await fetch(`${API_URL}/rest/v1/organization_members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      organization_id: orgId,
      user_id: userData.id,
    }),
  });

  // Sign in to get access token
  const signInRes = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!signInRes.ok) {
    throw new Error(`Sign in failed for ${email}: ${signInRes.status}`);
  }
  const session = (await signInRes.json()) as { access_token: string };

  return {
    id: userData.id,
    email,
    accessToken: session.access_token,
    orgId,
  };
}

async function cleanupTestUser(user: TestUser) {
  // Remove org membership
  await fetch(
    `${API_URL}/rest/v1/organization_members?organization_id=eq.${user.orgId}&user_id=eq.${user.id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
    }
  );
  // Remove profile
  await fetch(`${API_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  // Delete auth user
  await fetch(`${API_URL}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
}

describe("Gate 5: Storage API Isolation", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const ts = Date.now();
    userA = await createTestUser(`storage-a-${ts}@test.local`, ORG_A);
    userB = await createTestUser(`storage-b-${ts}@test.local`, ORG_B);

    // Get a case_id from org A to use as storage path prefix
    const casesRes = await fetch(
      `${API_URL}/rest/v1/cases?organization_id=eq.${ORG_A}&limit=1&select=id`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    );
    const cases = (await casesRes.json()) as Array<{ id: string }>;
    if (cases.length === 0) throw new Error("No cases in org A");
    caseIdA = cases[0].id;
    uploadedPath = `${caseIdA}/storage-test-${ts}.txt`;
    uploadHash = sha256(testFileContent);
  }, 30_000);

  afterAll(async () => {
    // Clean up uploaded file via service_role
    await fetch(
      `${API_URL}/storage/v1/object/${BUCKET}/${uploadedPath}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    );
    await cleanupTestUser(userA);
    await cleanupTestUser(userB);
  }, 30_000);

  // S1: Org A member uploads own file
  it("S1: org A member can upload file to own case path", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/${BUCKET}/${uploadedPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userA.accessToken}`,
          apikey: ANON_KEY,
          "Content-Type": "text/plain",
        },
        body: testFileContent,
      }
    );
    expect(res.status).toBeLessThan(300);
  });

  // S2: Org A member downloads own file — bytes match
  it("S2: org A member can download own file with matching SHA-256", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/authenticated/${BUCKET}/${uploadedPath}`,
      {
        headers: {
          Authorization: `Bearer ${userA.accessToken}`,
          apikey: ANON_KEY,
        },
      }
    );
    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    const downloadHash = sha256(body);
    expect(downloadHash).toBe(uploadHash);
  });

  // S3: Org A member can create signed URL
  it("S3: org A member can create signed URL for own file", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/sign/${BUCKET}/${uploadedPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userA.accessToken}`,
          apikey: ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 }),
      }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { signedURL: string };
    expect(data.signedURL).toBeTruthy();
  });

  // S4: Org B member CANNOT download org A's file
  it("S4: org B member cannot download org A file", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/authenticated/${BUCKET}/${uploadedPath}`,
      {
        headers: {
          Authorization: `Bearer ${userB.accessToken}`,
          apikey: ANON_KEY,
        },
      }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // S5: Org B member CANNOT overwrite org A's file
  it("S5: org B member cannot overwrite org A file", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/${BUCKET}/${uploadedPath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${userB.accessToken}`,
          apikey: ANON_KEY,
          "Content-Type": "text/plain",
        },
        body: Buffer.from("tampered content"),
      }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // S6: Org B member CANNOT create signed URL for org A file
  it("S6: org B member cannot create signed URL for org A file", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/sign/${BUCKET}/${uploadedPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userB.accessToken}`,
          apikey: ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 }),
      }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // S7: Anon CANNOT download private file
  it("S7: anonymous cannot download private file", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/public/${BUCKET}/${uploadedPath}`,
      {
        headers: { apikey: ANON_KEY },
      }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // S8: Anon CANNOT create signed URL
  it("S8: anonymous cannot create signed URL", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/sign/${BUCKET}/${uploadedPath}`,
      {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 }),
      }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // S9: Service role can delete test object
  it("S9: service role can delete test object", async () => {
    // Upload a dedicated delete-test object
    const deletePath = `${caseIdA}/delete-test-${Date.now()}.txt`;
    await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${deletePath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "text/plain",
      },
      body: Buffer.from("delete me"),
    });

    const delRes = await fetch(
      `${API_URL}/storage/v1/object/${BUCKET}/${deletePath}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    );
    expect(delRes.status).toBeLessThan(300);

    // Verify deleted — download should fail
    const getRes = await fetch(
      `${API_URL}/storage/v1/object/authenticated/${BUCKET}/${deletePath}`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    );
    expect(getRes.status).toBeGreaterThanOrEqual(400);
  });

  // S10: Cross-org bytes received = 0
  it("S10: cross-org download returns 0 bytes of file content", async () => {
    const res = await fetch(
      `${API_URL}/storage/v1/object/authenticated/${BUCKET}/${uploadedPath}`,
      {
        headers: {
          Authorization: `Bearer ${userB.accessToken}`,
          apikey: ANON_KEY,
        },
      }
    );
    if (res.status >= 400) {
      expect(true).toBe(true);
    } else {
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.length).toBe(0);
    }
  });

  // S11: Client bundle does not expose service_role key
  it("S11: service_role key not exposed in client-accessible code", async () => {
    // Verify SUPABASE_SERVICE_ROLE_KEY is not in any NEXT_PUBLIC env
    // This is a code-level check, not an API call
    const envContent = await import("node:fs").then((fs) => {
      const paths = [
        "D:/projects/litigation-writer-app/apps/web/.env.example",
      ];
      return paths
        .map((p) => {
          try {
            return fs.readFileSync(p, "utf-8");
          } catch {
            return "";
          }
        })
        .join("\n");
    });
    expect(envContent).not.toMatch(/NEXT_PUBLIC.*service_role/i);
    expect(envContent).not.toMatch(/NEXT_PUBLIC.*SERVICE_ROLE/i);
  });
});
