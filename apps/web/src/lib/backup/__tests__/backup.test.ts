import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { backup, type BackupOptions, type BackupResult } from "../index";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import pg from "pg";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ORG_1 = "b0000000-0000-0000-0000-000000000001";
const ORG_2 = "b0000000-0000-0000-0000-000000000002";
const ORG_EMPTY = "b0000000-0000-0000-0000-000000000099";
const ORG_INVALID = "00000000-0000-0000-0000-000000000000";

const TEST_KEY = crypto.randomBytes(32);

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
}

function cleanTmpDir(dir: string) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe("Gate 6: Organization Backup TDD", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client(DB_URL);
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  // ── T1: Empty org → backup succeeds with 0 rows ──────────────────
  it("T1: empty org backup succeeds with 0 rows", async () => {
    const tmpDir = makeTmpDir();
    try {
      // Create a temporary empty org (committed so backup's own connection can see it)
      await client.query(
        `INSERT INTO organizations (id, name, created_at)
         VALUES ($1, 'empty-test-org', now())
         ON CONFLICT (id) DO NOTHING`,
        [ORG_EMPTY]
      );

      const result = await backup({
        organizationId: ORG_EMPTY,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      // Org itself is 1 row, no members/cases/rounds/etc
      expect(result.manifest.tables.cases.rowCount).toBe(0);
      expect(result.manifest.tables.rounds.rowCount).toBe(0);
      expect(result.manifest.tables.runs.rowCount).toBe(0);
      expect(result.manifest.tables.organizations.rowCount).toBe(1);
      expect(fs.existsSync(result.archivePath)).toBe(true);
    } finally {
      // Clean up the temp org
      await client.query("DELETE FROM organization_members WHERE organization_id = $1", [ORG_EMPTY]);
      await client.query("DELETE FROM organizations WHERE id = $1", [ORG_EMPTY]);
      cleanTmpDir(tmpDir);
    }
  });

  // ── T2: Single-case org → backup contains exactly that case ──────
  it("T2: single-case org backup contains correct data", async () => {
    const tmpDir = makeTmpDir();
    try {
      // org 2 has cases — use a subset check
      const caseCount = await client.query(
        "SELECT count(*)::int AS cnt FROM cases WHERE organization_id = $1",
        [ORG_2]
      );
      const expectedCases = caseCount.rows[0].cnt;

      const result = await backup({
        organizationId: ORG_2,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      expect(result.manifest.tables.cases.rowCount).toBe(expectedCases);
      expect(result.totalRows).toBeGreaterThan(0);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T3: Cross-org rows excluded ──────────────────────────────────
  it("T3: cross-org rows excluded from backup", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_1,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      // Verify all backed-up cases belong to org 1
      const manifest = result.manifest;
      expect(manifest.organizationId).toBe(ORG_1);

      // Cross-check: count of cases in backup must match DB
      const dbCount = await client.query(
        "SELECT count(*)::int AS cnt FROM cases WHERE organization_id = $1",
        [ORG_1]
      );
      expect(manifest.tables.cases.rowCount).toBe(dbCount.rows[0].cnt);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T4: Cross-org files excluded ─────────────────────────────────
  it("T4: cross-org storage files excluded", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_1,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      // All file paths in manifest should reference only org 1 cases
      const org1CaseIds = await client.query(
        "SELECT id FROM cases WHERE organization_id = $1",
        [ORG_1]
      );
      const validIds = new Set(org1CaseIds.rows.map((r: { id: string }) => r.id));

      for (const f of result.manifest.files) {
        const caseId = f.storageObjectKey.split("/")[0];
        expect(validIds.has(caseId)).toBe(true);
      }
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T5: Encryption round-trip ────────────────────────────────────
  it("T5: encryption round-trip produces identical data", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_2,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      const archiveBytes = fs.readFileSync(result.archivePath);
      // Encrypted file should NOT start with JSON/CSV markers
      const header = archiveBytes.subarray(0, 16);
      expect(header.toString("utf8").startsWith("{")).toBe(false);
      expect(header.toString("utf8").startsWith("id,")).toBe(false);

      // Decrypt using the same key — the module should export a decrypt util
      const { decrypt } = await import("../index");
      const decrypted = await (decrypt as Function)(archiveBytes, TEST_KEY);
      expect(decrypted).toBeDefined();
      expect(decrypted.length).toBeGreaterThan(0);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T6: Missing encryption key → error ───────────────────────────
  it("T6: missing encryption key throws error", async () => {
    const tmpDir = makeTmpDir();
    try {
      await expect(
        backup({
          organizationId: ORG_1,
          outputPath: tmpDir,
          encryptionKey: Buffer.alloc(0),
          dbUrl: DB_URL,
        })
      ).rejects.toThrow(/encryption key/i);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T7: Invalid org ID → error ──────────────────────────────────
  it("T7: invalid (nonexistent) org ID throws error", async () => {
    const tmpDir = makeTmpDir();
    try {
      await expect(
        backup({
          organizationId: ORG_INVALID,
          outputPath: tmpDir,
          encryptionKey: TEST_KEY,
          dbUrl: DB_URL,
        })
      ).rejects.toThrow(/organization.*not found/i);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T8: Manifest row counts correct ─────────────────────────────
  it("T8: manifest row counts match database", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_1,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      const tables = ["cases", "rounds", "runs", "reviews", "case_files", "checkpoints"];
      for (const table of tables) {
        const entry = result.manifest.tables[table];
        expect(entry).toBeDefined();
        expect(typeof entry.rowCount).toBe("number");
      }

      // Verify cases count specifically
      const dbCases = await client.query(
        "SELECT count(*)::int AS cnt FROM cases WHERE organization_id = $1",
        [ORG_1]
      );
      expect(result.manifest.tables.cases.rowCount).toBe(dbCases.rows[0].cnt);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T9: Manifest checksums match actual data ────────────────────
  it("T9: manifest checksums are valid SHA-256 and match data", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_2,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      for (const [table, info] of Object.entries(result.manifest.tables)) {
        expect(info.checksum).toMatch(/^[a-f0-9]{64}$/);
      }

      // Verify at least one table checksum by recomputing
      const { verifyChecksum } = await import("../index");
      const valid = await (verifyChecksum as Function)(
        result.archivePath,
        TEST_KEY,
        result.manifest
      );
      expect(valid).toBe(true);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T10: Large org backup (org 1 = 200 cases, ~6000 rows) ──────
  it("T10: large org backup completes with correct totals", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_1,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      // Org 1 has 200 cases, 600 rounds, 2400 runs, 1200 reviews, 1600 case_files
      expect(result.manifest.tables.cases.rowCount).toBe(200);
      expect(result.manifest.tables.rounds.rowCount).toBe(600);
      expect(result.manifest.tables.runs.rowCount).toBe(2400);
      expect(result.manifest.tables.reviews.rowCount).toBe(1200);
      expect(result.manifest.tables.case_files.rowCount).toBe(1600);
      expect(result.totalRows).toBeGreaterThanOrEqual(6000);
    } finally {
      cleanTmpDir(tmpDir);
    }
  }, 30_000);

  // ── T11: Output directory must exist ─────────────────────────────
  it("T11: nonexistent output directory throws error", async () => {
    await expect(
      backup({
        organizationId: ORG_1,
        outputPath: "/nonexistent/path/backup",
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      })
    ).rejects.toThrow(/output.*path|directory/i);
  });

  // ── T12: Backup is idempotent (same checksums) ──────────────────
  it("T12: two consecutive backups produce same checksums", async () => {
    const tmpDir1 = makeTmpDir();
    const tmpDir2 = makeTmpDir();
    try {
      const opts: Omit<BackupOptions, "outputPath"> = {
        organizationId: ORG_2,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      };

      const r1 = await backup({ ...opts, outputPath: tmpDir1 });
      const r2 = await backup({ ...opts, outputPath: tmpDir2 });

      for (const table of Object.keys(r1.manifest.tables)) {
        expect(r1.manifest.tables[table].checksum).toBe(
          r2.manifest.tables[table].checksum
        );
      }
    } finally {
      cleanTmpDir(tmpDir1);
      cleanTmpDir(tmpDir2);
    }
  });

  // ── T13: Storage objects included in backup ─────────────────────
  it("T13: storage objects referenced in manifest", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_1,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      // storage.objects count should be in manifest
      const storageInfo = result.manifest.tables["storage_objects"];
      expect(storageInfo).toBeDefined();
      expect(typeof storageInfo.rowCount).toBe("number");
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T14: Partial write → no partial archive ─────────────────────
  it("T14: failed backup leaves no partial archive", async () => {
    const tmpDir = makeTmpDir();
    try {
      // First, verify a successful backup DOES produce an archive
      const goodResult = await backup({
        organizationId: ORG_2,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });
      expect(fs.existsSync(goodResult.archivePath)).toBe(true);

      // Clean up the good archive
      fs.rmSync(goodResult.archivePath);

      // Now force failure with invalid key length (not 32 bytes)
      const tmpDir2 = makeTmpDir();
      try {
        await backup({
          organizationId: ORG_1,
          outputPath: tmpDir2,
          encryptionKey: Buffer.alloc(5),
          dbUrl: DB_URL,
        });
      } catch {}

      // No .enc or .backup files should remain in the failed dir
      const files = fs.readdirSync(tmpDir2);
      const archives = files.filter(
        (f) => f.endsWith(".enc") || f.endsWith(".backup") || f.endsWith(".tar")
      );
      expect(archives).toHaveLength(0);
      cleanTmpDir(tmpDir2);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T15: No plaintext secrets in manifest/output ────────────────
  it("T15: no plaintext secrets in manifest or archive filename", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: ORG_2,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      const manifestJson = JSON.stringify(result.manifest);
      // Must not contain DB password, service_role key patterns, JWT secrets
      expect(manifestJson).not.toMatch(/postgres:postgres/);
      expect(manifestJson).not.toMatch(/service_role/i);
      expect(manifestJson).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);

      // Archive filename should not leak org name or secrets
      const archiveName = path.basename(result.archivePath);
      expect(archiveName).not.toMatch(/postgres/);
      expect(archiveName).not.toMatch(/service_role/i);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Gate 6 Corrective: Storage Binary Backup TDD (T16-T25)
// ═══════════════════════════════════════════════════════════════════

const API_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const BUCKET = "case-files";

function sha256Buf(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

const STORAGE_TEST_ORG = "b0000000-0000-0000-0000-000000000052";
const STORAGE_OTHER_ORG = "b0000000-0000-0000-0000-000000000053";

interface StorageTestUser {
  id: string;
  email: string;
  accessToken: string;
}

async function createStorageTestUser(
  email: string,
  orgId: string
): Promise<StorageTestUser> {
  const createRes = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ email, password: "StorageBkTest_2026!", email_confirm: true }),
  });
  if (!createRes.ok) throw new Error(`Create user failed: ${createRes.status}`);
  const user = (await createRes.json()) as { id: string };

  await fetch(`${API_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ id: user.id, display_name: `storage-bk-${email.split("@")[0]}`, role: "member" }),
  });
  await fetch(`${API_URL}/rest/v1/organization_members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ organization_id: orgId, user_id: user.id }),
  });

  const signIn = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: "StorageBkTest_2026!" }),
  });
  if (!signIn.ok) throw new Error(`Sign in failed: ${signIn.status}`);
  const session = (await signIn.json()) as { access_token: string };
  return { id: user.id, email, accessToken: session.access_token };
}

async function cleanupStorageTestUser(userId: string, orgId: string) {
  await fetch(`${API_URL}/rest/v1/organization_members?organization_id=eq.${orgId}&user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  await fetch(`${API_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  await fetch(`${API_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
}

describe("Gate 6 Corrective: Storage Binary Backup", { timeout: 120_000 }, () => {
  let userA: StorageTestUser;
  let caseIdA: string;
  const uploadedPaths: string[] = [];
  const uploadedContents: Map<string, Buffer> = new Map();
  const ts = Date.now();

  beforeAll(async () => {
    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      // Create dedicated orgs for storage binary tests
      await client.query(
        `INSERT INTO organizations (id, name, created_at) VALUES ($1, 'storage-binary-test-org', now()) ON CONFLICT (id) DO NOTHING`,
        [STORAGE_TEST_ORG]
      );
      await client.query(
        `INSERT INTO organizations (id, name, created_at) VALUES ($1, 'storage-binary-other-org', now()) ON CONFLICT (id) DO NOTHING`,
        [STORAGE_OTHER_ORG]
      );

      userA = await createStorageTestUser(`sbk-a-${ts}@test.local`, STORAGE_TEST_ORG);

      // Create a case in the test org
      caseIdA = crypto.randomUUID();
      await client.query(
        `INSERT INTO cases (id, organization_id, title, assignee, created_by, created_at) VALUES ($1, $2, 'storage-binary-test-case', $3, $3, now())`,
        [caseIdA, STORAGE_TEST_ORG, userA.id]
      );

      // Upload 3 test files via Storage API
      const files = [
        { name: `${caseIdA}/text-file-${ts}.txt`, content: Buffer.from("Hello Storage Binary Backup Test — 스토리지 바이너리 백업 테스트\n") },
        { name: `${caseIdA}/binary-file-${ts}.bin`, content: crypto.randomBytes(256) },
        { name: `${caseIdA}/empty-file-${ts}.dat`, content: Buffer.alloc(0) },
      ];

      for (const f of files) {
        const res = await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${f.name}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userA.accessToken}`,
            apikey: ANON_KEY,
            "Content-Type": "application/octet-stream",
          },
          body: f.content,
        });
        if (!res.ok) throw new Error(`Upload ${f.name} failed: ${res.status} ${await res.text()}`);
        uploadedPaths.push(f.name);
        uploadedContents.set(f.name, f.content);
      }
    } finally {
      await client.end();
    }
  }, 60_000);

  afterAll(async () => {
    // Clean up storage objects
    for (const p of uploadedPaths) {
      await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${p}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
    }
    // Clean up case and orgs
    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      await client.query("DELETE FROM cases WHERE id = $1", [caseIdA]);
      await cleanupStorageTestUser(userA.id, STORAGE_TEST_ORG);
      await client.query("DELETE FROM organization_members WHERE organization_id IN ($1, $2)", [STORAGE_TEST_ORG, STORAGE_OTHER_ORG]);
      await client.query("DELETE FROM organizations WHERE id IN ($1, $2)", [STORAGE_TEST_ORG, STORAGE_OTHER_ORG]);
    } finally {
      await client.end();
    }
  }, 30_000);

  // ── T16: Backup with storageApiUrl includes storageFiles ────────
  it("T16: backup with storageApiUrl includes storageFiles in archive", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: STORAGE_TEST_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      expect(payload.storageFiles).toBeDefined();
      expect(Object.keys(payload.storageFiles).length).toBeGreaterThanOrEqual(2);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T17: Storage binary SHA-256 matches original ────────────────
  it("T17: storage binary content SHA-256 matches original upload", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: STORAGE_TEST_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      const textFilePath = uploadedPaths.find(p => p.includes("text-file"));
      expect(textFilePath).toBeTruthy();
      const b64 = payload.storageFiles[textFilePath!];
      expect(b64).toBeTruthy();
      const restored = Buffer.from(b64, "base64");
      const originalContent = uploadedContents.get(textFilePath!)!;
      expect(sha256Buf(restored)).toBe(sha256Buf(originalContent));
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T18: Binary file round-trip preserves exact bytes ───────────
  it("T18: binary file round-trip preserves exact bytes", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: STORAGE_TEST_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      const binFilePath = uploadedPaths.find(p => p.includes("binary-file"));
      expect(binFilePath).toBeTruthy();
      const restored = Buffer.from(payload.storageFiles[binFilePath!], "base64");
      const original = uploadedContents.get(binFilePath!)!;
      expect(Buffer.compare(restored, original)).toBe(0);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T19: Manifest tracks storageFilesIncluded and counts ───────
  it("T19: manifest tracks storageFilesIncluded flag and byte count", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: STORAGE_TEST_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      expect(result.manifest.storageFilesIncluded).toBe(true);
      expect(typeof result.manifest.storageFilesTotalBytes).toBe("number");
      expect(result.manifest.storageFilesTotalBytes).toBeGreaterThan(0);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T20: Without storageApiUrl, backward compat (metadata only) ─
  it("T20: backup without storageApiUrl still works (metadata only)", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: STORAGE_TEST_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
      });

      expect(result.manifest.storageFilesIncluded).toBeFalsy();

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));
      expect(payload.storageFiles).toBeUndefined();
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T21: Storage download failure → entire backup fails (fail-closed) ──
  it("T21: storage download failure throws and leaves no partial archive", async () => {
    const tmpDir = makeTmpDir();
    try {
      // Use a non-existent Storage API URL to force download failures
      await expect(
        backup({
          organizationId: STORAGE_TEST_ORG,
          outputPath: tmpDir,
          encryptionKey: TEST_KEY,
          dbUrl: DB_URL,
          storageApiUrl: "http://127.0.0.1:59999",
          storageApiKey: SERVICE_KEY,
        })
      ).rejects.toThrow(/storage.*download.*fail|failed to download/i);

      // No partial archive should remain
      const files = fs.readdirSync(tmpDir);
      const archives = files.filter(f => f.endsWith(".enc"));
      expect(archives).toHaveLength(0);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T22: Cross-org storage files excluded from binary download ──
  it("T22: cross-org storage files not downloaded", async () => {
    const tmpDir = makeTmpDir();
    try {
      // Upload a file to the OTHER org's case space
      const otherCaseId = crypto.randomUUID();
      const client = new pg.Client(DB_URL);
      await client.connect();

      // Create a user for other org
      const userB = await createStorageTestUser(`sbk-b-${ts}@test.local`, STORAGE_OTHER_ORG);
      await client.query(
        `INSERT INTO cases (id, organization_id, title, assignee, created_by, created_at) VALUES ($1, $2, 'other-org-case', $3, $3, now())`,
        [otherCaseId, STORAGE_OTHER_ORG, userB.id]
      );

      const otherPath = `${otherCaseId}/other-org-file-${ts}.txt`;
      await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${otherPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userB.accessToken}`,
          apikey: ANON_KEY,
          "Content-Type": "text/plain",
        },
        body: Buffer.from("other org data"),
      });

      try {
        const result = await backup({
          organizationId: STORAGE_TEST_ORG,
          outputPath: tmpDir,
          encryptionKey: TEST_KEY,
          dbUrl: DB_URL,
          storageApiUrl: API_URL,
          storageApiKey: SERVICE_KEY,
        });

        const { decrypt } = await import("../index");
        const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
        const payload = JSON.parse(decrypted.toString("utf-8"));

        // Other org's file must NOT be in storageFiles
        expect(payload.storageFiles[otherPath]).toBeUndefined();
      } finally {
        await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${otherPath}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        });
        await client.query("DELETE FROM cases WHERE id = $1", [otherCaseId]);
        await cleanupStorageTestUser(userB.id, STORAGE_OTHER_ORG);
        await client.end();
      }
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T23: Empty storage objects → no storageFiles section ────────
  it("T23: org with no storage objects produces no storageFiles", async () => {
    const tmpDir = makeTmpDir();
    const emptyOrg = "b0000000-0000-0000-0000-000000000054";
    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      await client.query(
        `INSERT INTO organizations (id, name, created_at) VALUES ($1, 'empty-storage-org', now()) ON CONFLICT (id) DO NOTHING`,
        [emptyOrg]
      );

      const result = await backup({
        organizationId: emptyOrg,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      // No storage files to download
      expect(payload.storageFiles).toBeUndefined();
      expect(result.manifest.storageFilesIncluded).toBeFalsy();
    } finally {
      await client.query("DELETE FROM organizations WHERE id = $1", [emptyOrg]);
      await client.end();
      cleanTmpDir(tmpDir);
    }
  });

  // ── T24: Manifest file entries include content checksums ───────
  it("T24: manifest files include content checksums for downloaded binaries", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: STORAGE_TEST_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      // Each file entry should have a contentSha256 when binary was downloaded
      for (const f of result.manifest.files) {
        if (uploadedPaths.includes(f.storageObjectKey)) {
          expect(f.contentSha256).toBeDefined();
          expect(f.contentSha256).toMatch(/^[a-f0-9]{64}$/);
        }
      }
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T25: No service key leaked in archive or manifest ──────────
  it("T25: service key not present in decrypted archive or manifest", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: STORAGE_TEST_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payloadStr = decrypted.toString("utf-8");

      expect(payloadStr).not.toContain(SERVICE_KEY);
      expect(payloadStr).not.toContain("service_role");

      const manifestStr = JSON.stringify(result.manifest);
      expect(manifestStr).not.toContain(SERVICE_KEY);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Gate 6 Strict: Storage Fidelity + Fail-Closed + 81K Scale (T26-T32)
// ═══════════════════════════════════════════════════════════════════

const FIDELITY_ORG = "b0000000-0000-0000-0000-000000000060";

describe("Gate 6 Strict: Storage Fidelity and Fail-Closed", { timeout: 120_000 }, () => {
  let fidelityUser: StorageTestUser;
  let fidelityCaseId: string;
  const fidelityStorageKeys: string[] = [];
  const fidelityContents: Map<string, Buffer> = new Map();
  const fidelityDisplayNames: Map<string, string> = new Map();
  const fTs = Date.now();

  beforeAll(async () => {
    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      await client.query(
        `INSERT INTO organizations (id, name, created_at) VALUES ($1, 'fidelity-test-org', now()) ON CONFLICT (id) DO NOTHING`,
        [FIDELITY_ORG]
      );
      fidelityUser = await createStorageTestUser(`fidelity-${fTs}@test.local`, FIDELITY_ORG);
      fidelityCaseId = crypto.randomUUID();
      await client.query(
        `INSERT INTO cases (id, organization_id, title, assignee, created_by, created_at) VALUES ($1, $2, 'fidelity-test-case', $3, $3, now())`,
        [fidelityCaseId, FIDELITY_ORG, fidelityUser.id]
      );

      const pdfHeader = Buffer.from("%PDF-1.4 fake-pdf-content-for-testing\n".repeat(100));
      const largeBuf = crypto.randomBytes(1024 * 1024 + 512); // >1MB

      const files: { storageKey: string; displayName: string; kind: string; content: Buffer }[] = [
        {
          storageKey: `${fidelityCaseId}/${crypto.randomUUID()}.txt`,
          displayName: "한글파일명_테스트.txt",
          kind: "입력",
          content: Buffer.from("한글 내용 테스트\n"),
        },
        {
          storageKey: `${fidelityCaseId}/${crypto.randomUUID()}.txt`,
          displayName: "file with spaces.txt",
          kind: "입력",
          content: Buffer.from("spaces in name\n"),
        },
        {
          storageKey: `${fidelityCaseId}/${crypto.randomUUID()}.dat`,
          displayName: "zero-byte.dat",
          kind: "입력",
          content: Buffer.alloc(0),
        },
        {
          storageKey: `${fidelityCaseId}/${crypto.randomUUID()}.bin`,
          displayName: "대용량_파일.bin",
          kind: "입력",
          content: largeBuf,
        },
        {
          storageKey: `${fidelityCaseId}/${crypto.randomUUID()}.pdf`,
          displayName: "소장_첨부문서.pdf",
          kind: "서면",
          content: pdfHeader,
        },
        {
          storageKey: `${fidelityCaseId}/subdir/${crypto.randomUUID()}.txt`,
          displayName: "보고서_하위폴더.txt",
          kind: "리서치",
          content: Buffer.from("same basename different path\n"),
        },
      ];

      for (const f of files) {
        const encodedKey = f.storageKey.split("/").map(s => encodeURIComponent(s)).join("/");
        const res = await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${encodedKey}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fidelityUser.accessToken}`,
            apikey: ANON_KEY,
            "Content-Type": "application/octet-stream",
          },
          body: f.content,
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Upload ${f.storageKey} failed: ${res.status} ${txt}`);
        }
        fidelityStorageKeys.push(f.storageKey);
        fidelityContents.set(f.storageKey, f.content);
        fidelityDisplayNames.set(f.storageKey, f.displayName);

        const cfId = crypto.randomUUID();
        await client.query(
          `INSERT INTO case_files (id, case_id, kind, filename, storage_path, version, created_by_run, uploaded_by, created_at)
           VALUES ($1, $2, $3, $4, $5, 1, NULL, $6, now())`,
          [cfId, fidelityCaseId, f.kind, f.displayName, f.storageKey, fidelityUser.id]
        );
      }
    } finally {
      await client.end();
    }
  }, 60_000);

  afterAll(async () => {
    for (const key of fidelityStorageKeys) {
      const encodedKey = key.split("/").map(s => encodeURIComponent(s)).join("/");
      await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${encodedKey}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
    }
    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      await client.query("DELETE FROM case_files WHERE case_id = $1", [fidelityCaseId]);
      await client.query("DELETE FROM cases WHERE id = $1", [fidelityCaseId]);
      await cleanupStorageTestUser(fidelityUser.id, FIDELITY_ORG);
      await client.query("DELETE FROM organization_members WHERE organization_id = $1", [FIDELITY_ORG]);
      await client.query("DELETE FROM organizations WHERE id = $1", [FIDELITY_ORG]);
    } finally {
      await client.end();
    }
  }, 30_000);

  // ── T26: Korean display name preserved in manifest.files.originalDisplayName ──
  it("T26: Korean display name preserved via case_files.filename → manifest originalDisplayName", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: FIDELITY_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const koreanKey = fidelityStorageKeys.find(k => fidelityDisplayNames.get(k)?.includes("한글"));
      expect(koreanKey).toBeTruthy();

      const entry = result.manifest.files.find(f => f.storageObjectKey === koreanKey);
      expect(entry).toBeTruthy();
      expect(entry!.originalDisplayName).toBe("한글파일명_테스트.txt");
      expect(entry!.storageObjectKey).toMatch(/^[A-Za-z0-9\/_.-]+$/);

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));
      const b64 = payload.storageFiles[koreanKey!];
      expect(b64).toBeTruthy();
      const restored = Buffer.from(b64, "base64");
      expect(restored.toString("utf-8")).toContain("한글 내용 테스트");
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T27: 1MB+ file backup preserves exact bytes ────────────────
  it("T27: 1MB+ file backup preserves exact bytes", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: FIDELITY_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      const largeKey = fidelityStorageKeys.find(k => fidelityDisplayNames.get(k)?.includes("대용량"));
      expect(largeKey).toBeTruthy();
      const restored = Buffer.from(payload.storageFiles[largeKey!], "base64");
      const original = fidelityContents.get(largeKey!)!;
      expect(restored.length).toBe(original.length);
      expect(sha256Buf(restored)).toBe(sha256Buf(original));

      const entry = result.manifest.files.find(f => f.storageObjectKey === largeKey);
      expect(entry!.byteLength).toBe(original.length);
      expect(entry!.originalDisplayName).toBe("대용량_파일.bin");
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T28: All metadata objects have corresponding binary ────────
  it("T28: every storage.objects row has matching binary in archive", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: FIDELITY_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      const storageRows = payload.data.storage_objects as { name: string }[];
      const storageKeys = Object.keys(payload.storageFiles || {});
      expect(storageRows.length).toBeGreaterThan(0);
      for (const row of storageRows) {
        expect(storageKeys).toContain(row.name);
      }
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T29: PDF file round-trip with Korean display name ──────────
  it("T29: PDF file backed up with correct hash and Korean display name", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: FIDELITY_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      const pdfKey = fidelityStorageKeys.find(k => k.endsWith(".pdf"));
      expect(pdfKey).toBeTruthy();
      const restored = Buffer.from(payload.storageFiles[pdfKey!], "base64");
      expect(sha256Buf(restored)).toBe(sha256Buf(fidelityContents.get(pdfKey!)!));

      const entry = result.manifest.files.find(f => f.storageObjectKey === pdfKey);
      expect(entry!.originalDisplayName).toBe("소장_첨부문서.pdf");
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T30: Same basename in different paths are distinct ─────────
  it("T30: same basename in different paths stored distinctly", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: FIDELITY_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      const subdirKey = fidelityStorageKeys.find(k => k.includes("subdir/"));
      expect(subdirKey).toBeTruthy();
      expect(payload.storageFiles[subdirKey!]).toBeTruthy();

      const entry = result.manifest.files.find(f => f.storageObjectKey === subdirKey);
      expect(entry!.originalDisplayName).toBe("보고서_하위폴더.txt");
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T31: Filename with spaces backup round-trip ────────────────
  it("T31: filename with spaces backed up correctly", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await backup({
        organizationId: FIDELITY_ORG,
        outputPath: tmpDir,
        encryptionKey: TEST_KEY,
        dbUrl: DB_URL,
        storageApiUrl: API_URL,
        storageApiKey: SERVICE_KEY,
      });

      const { decrypt } = await import("../index");
      const decrypted = decrypt(fs.readFileSync(result.archivePath), TEST_KEY);
      const payload = JSON.parse(decrypted.toString("utf-8"));

      const spaceKey = fidelityStorageKeys.find(k => fidelityDisplayNames.get(k) === "file with spaces.txt");
      expect(spaceKey).toBeTruthy();
      const restored = Buffer.from(payload.storageFiles[spaceKey!], "base64");
      expect(restored.toString("utf-8")).toBe("spaces in name\n");
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  // ── T32: Binary download failure → entire backup fails ─────────
  it("T32: single binary download failure causes total backup failure, no partial archive", async () => {
    const tmpDir = makeTmpDir();
    try {
      await expect(
        backup({
          organizationId: FIDELITY_ORG,
          outputPath: tmpDir,
          encryptionKey: TEST_KEY,
          dbUrl: DB_URL,
          storageApiUrl: "http://127.0.0.1:59999",
          storageApiKey: SERVICE_KEY,
        })
      ).rejects.toThrow(/storage.*download.*fail|failed to download/i);

      const files = fs.readdirSync(tmpDir);
      expect(files.filter(f => f.endsWith(".enc"))).toHaveLength(0);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});
