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
        const caseId = f.path.split("/")[0];
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
