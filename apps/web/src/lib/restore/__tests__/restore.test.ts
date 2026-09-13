import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { restore, dropIsolatedDb } from "../index";
import { backup } from "../../backup/index";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import pg from "pg";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ORG_1 = "b0000000-0000-0000-0000-000000000001";
const ORG_2 = "b0000000-0000-0000-0000-000000000002";
const TEST_KEY = crypto.randomBytes(32);

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "restore-test-"));
}

function cleanTmpDir(dir: string) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe("Gate 7: Isolated Restore TDD", { timeout: 60_000 }, () => {
  let backupArchive: string;
  let backupArchiveLarge: string;
  let tmpDir: string;
  let tmpDirLarge: string;
  const createdDbs: string[] = [];

  // Shared restore result for read-only tests
  let sharedDbName: string;
  let sharedResult: Awaited<ReturnType<typeof restore>>;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    const r = await backup({
      organizationId: ORG_2,
      outputPath: tmpDir,
      encryptionKey: TEST_KEY,
      dbUrl: DB_URL,
    });
    backupArchive = r.archivePath;

    tmpDirLarge = makeTmpDir();
    const r2 = await backup({
      organizationId: ORG_1,
      outputPath: tmpDirLarge,
      encryptionKey: TEST_KEY,
      dbUrl: DB_URL,
    });
    backupArchiveLarge = r2.archivePath;

    // Create one shared restore for read-only tests
    sharedDbName = `restore_shared_${Date.now()}`;
    createdDbs.push(sharedDbName);
    sharedResult = await restore({
      archivePath: backupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: sharedDbName,
      sourceDbUrl: DB_URL,
    });
  }, 120_000);

  afterAll(async () => {
    for (const db of createdDbs) {
      try { await dropIsolatedDb(db, DB_URL); } catch {}
    }
    cleanTmpDir(tmpDir);
    cleanTmpDir(tmpDirLarge);
  }, 30_000);

  // ── R1: Restore from valid backup → all rows present ─────────────
  it("R1: restore from valid backup succeeds with all rows", () => {
    expect(sharedResult.totalRows).toBeGreaterThan(0);
    expect(sharedResult.targetDbName).toBe(sharedDbName);
    expect(sharedResult.integrityMatch).toBe(true);
  });

  // ── R2: Restored row counts match manifest ──────────────────────
  it("R2: restored row counts match manifest exactly", () => {
    for (const [table, info] of Object.entries(sharedResult.manifest.tables)) {
      expect(sharedResult.restoredRows[table]).toBe(info.rowCount);
    }
  });

  // ── R3: Restored checksums match manifest ───────────────────────
  it("R3: restored data checksums match manifest", () => {
    expect(sharedResult.integrityMatch).toBe(true);
  });

  // ── R4: FK integrity maintained ─────────────────────────────────
  it("R4: FK integrity maintained — no orphan rounds/runs/reviews", async () => {
    const client = new pg.Client(`postgresql://postgres:postgres@127.0.0.1:54322/${sharedDbName}`);
    await client.connect();
    try {
      const orphanRounds = await client.query(
        "SELECT count(*)::int AS cnt FROM rounds r WHERE NOT EXISTS (SELECT 1 FROM cases c WHERE c.id = r.case_id)"
      );
      expect(orphanRounds.rows[0].cnt).toBe(0);

      const orphanRuns = await client.query(
        "SELECT count(*)::int AS cnt FROM runs rn WHERE NOT EXISTS (SELECT 1 FROM rounds rd WHERE rd.id = rn.round_id)"
      );
      expect(orphanRuns.rows[0].cnt).toBe(0);

      const orphanReviews = await client.query(
        "SELECT count(*)::int AS cnt FROM reviews rv WHERE NOT EXISTS (SELECT 1 FROM rounds rd WHERE rd.id = rv.round_id)"
      );
      expect(orphanReviews.rows[0].cnt).toBe(0);
    } finally {
      await client.end();
    }
  });

  // ── R5: auth.users stubs created for referenced user IDs ────────
  it("R5: auth.users stubs exist for all referenced profile IDs", async () => {
    const client = new pg.Client(`postgresql://postgres:postgres@127.0.0.1:54322/${sharedDbName}`);
    await client.connect();
    try {
      const orphanProfiles = await client.query(
        "SELECT count(*)::int AS cnt FROM profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)"
      );
      expect(orphanProfiles.rows[0].cnt).toBe(0);

      const orphanMembers = await client.query(
        "SELECT count(*)::int AS cnt FROM organization_members om WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = om.user_id)"
      );
      expect(orphanMembers.rows[0].cnt).toBe(0);
    } finally {
      await client.end();
    }
  });

  // ── R6: Restore to isolated DB (not postgres) ───────────────────
  it("R6: restore target is isolated database, not postgres", () => {
    expect(sharedResult.targetDbName).not.toBe("postgres");
    expect(sharedResult.targetDbUrl).toContain(sharedDbName);
    expect(new URL(sharedResult.targetDbUrl).pathname).not.toBe("/postgres");
  });

  // ── R7: Invalid encryption key → error ──────────────────────────
  it("R7: wrong encryption key throws error", async () => {
    const wrongKey = crypto.randomBytes(32);
    const dbName = `restore_test_r7_${Date.now()}`;
    createdDbs.push(dbName);

    await expect(
      restore({
        archivePath: backupArchive,
        encryptionKey: wrongKey,
        targetDbName: dbName,
        sourceDbUrl: DB_URL,
      })
    ).rejects.toThrow(/decrypt|auth tag|unsupported/i);
  });

  // ── R8: Corrupted archive → error ───────────────────────────────
  it("R8: corrupted archive throws error", async () => {
    const corruptDir = makeTmpDir();
    const corruptPath = path.join(corruptDir, "corrupt.enc");
    fs.writeFileSync(corruptPath, crypto.randomBytes(1024));

    const dbName = `restore_test_r8_${Date.now()}`;
    createdDbs.push(dbName);

    try {
      await expect(
        restore({
          archivePath: corruptPath,
          encryptionKey: TEST_KEY,
          targetDbName: dbName,
          sourceDbUrl: DB_URL,
        })
      ).rejects.toThrow(/decrypt|auth tag|corrupt|invalid|unsupported|authenticate/i);
    } finally {
      cleanTmpDir(corruptDir);
    }
  });

  // ── R9: Nonexistent archive path → error ────────────────────────
  it("R9: nonexistent archive path throws error", async () => {
    const dbName = `restore_test_r9_${Date.now()}`;
    createdDbs.push(dbName);

    await expect(
      restore({
        archivePath: "/nonexistent/backup.enc",
        encryptionKey: TEST_KEY,
        targetDbName: dbName,
        sourceDbUrl: DB_URL,
      })
    ).rejects.toThrow(/archive.*not found|ENOENT/i);
  });

  // ── R10: Restore is idempotent ──────────────────────────────────
  it("R10: drop + re-restore produces same row counts", async () => {
    const dbName = `restore_test_r10_${Date.now()}`;
    createdDbs.push(dbName);

    const r1 = await restore({
      archivePath: backupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: DB_URL,
    });

    await dropIsolatedDb(dbName, DB_URL);

    const r2 = await restore({
      archivePath: backupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: DB_URL,
    });

    for (const table of Object.keys(r1.restoredRows)) {
      expect(r1.restoredRows[table]).toBe(r2.restoredRows[table]);
    }
  });

  // ── R11: Cross-org data not present in restored DB ──────────────
  it("R11: restored DB contains only the backed-up org's data", async () => {
    const client = new pg.Client(`postgresql://postgres:postgres@127.0.0.1:54322/${sharedDbName}`);
    await client.connect();
    try {
      const orgs = await client.query("SELECT id FROM organizations");
      expect(orgs.rows).toHaveLength(1);
      expect(orgs.rows[0].id).toBe(ORG_2);

      const crossOrg = await client.query(
        "SELECT count(*)::int AS cnt FROM cases WHERE organization_id != $1",
        [ORG_2]
      );
      expect(crossOrg.rows[0].cnt).toBe(0);
    } finally {
      await client.end();
    }
  });

  // ── R12: Storage objects restored ───────────────────────────────
  it("R12: storage objects metadata restored", () => {
    const storageCount = sharedResult.restoredRows["storage_objects"] ?? 0;
    expect(storageCount).toBe(sharedResult.manifest.tables.storage_objects.rowCount);
  });

  // ── R13: Enum types created correctly ───────────────────────────
  it("R13: enum types exist in isolated DB", async () => {
    const client = new pg.Client(`postgresql://postgres:postgres@127.0.0.1:54322/${sharedDbName}`);
    await client.connect();
    try {
      const enums = await client.query(
        "SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') ORDER BY typname"
      );
      const enumNames = enums.rows.map((r: { typname: string }) => r.typname);
      expect(enumNames).toContain("file_kind");
      expect(enumNames).toContain("run_status");
      expect(enumNames).toContain("round_kind");
    } finally {
      await client.end();
    }
  });

  // ── R14: Large backup restore (org 1 = 200 cases) ──────────────
  it("R14: large backup restore completes with correct totals", async () => {
    const dbName = `restore_test_r14_${Date.now()}`;
    createdDbs.push(dbName);

    const result = await restore({
      archivePath: backupArchiveLarge,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: DB_URL,
    });

    expect(result.restoredRows.cases).toBe(200);
    expect(result.restoredRows.rounds).toBe(600);
    expect(result.restoredRows.runs).toBe(2400);
    expect(result.integrityMatch).toBe(true);
  });

  // ── R15: dropIsolatedDb removes the database ───────────────────
  it("R15: dropIsolatedDb removes the isolated database", async () => {
    const dbName = `restore_test_r15_${Date.now()}`;

    await restore({
      archivePath: backupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: DB_URL,
    });

    await dropIsolatedDb(dbName, DB_URL);

    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      const dbs = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [dbName]
      );
      expect(dbs.rows).toHaveLength(0);
    } finally {
      await client.end();
    }
  });
});
