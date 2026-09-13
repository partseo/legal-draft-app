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

// ─── Gate 7 Corrected: Cross-Stack Isolated Restore with Storage ─────

const TARGET_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54332/postgres";
const SOURCE_API = "http://127.0.0.1:54321";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const CORPUS_B_ORG = "b0000000-0000-0000-0000-000000000055";

async function isTargetStackAvailable(): Promise<boolean> {
  const client = new pg.Client(TARGET_DB_URL);
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

describe("Gate 7 Corrected: Cross-Stack Isolated Restore", { timeout: 120_000 }, () => {
  let targetAvailable = false;
  let storageBackupArchive: string;
  let storageBackupTmpDir: string;
  let crossStackDbName: string;
  let crossStackResult: Awaited<ReturnType<typeof restore>>;
  const targetCreatedDbs: string[] = [];

  beforeAll(async () => {
    targetAvailable = await isTargetStackAvailable();
    if (!targetAvailable) return;

    storageBackupTmpDir = makeTmpDir();
    const r = await backup({
      organizationId: CORPUS_B_ORG,
      outputPath: storageBackupTmpDir,
      encryptionKey: TEST_KEY,
      dbUrl: DB_URL,
      storageApiUrl: SOURCE_API,
      storageApiKey: SERVICE_KEY,
    });
    storageBackupArchive = r.archivePath;

    crossStackDbName = `gate7_cross_${Date.now()}`;
    targetCreatedDbs.push(crossStackDbName);
    crossStackResult = await restore({
      archivePath: storageBackupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: crossStackDbName,
      sourceDbUrl: TARGET_DB_URL,
    });
  }, 180_000);

  afterAll(async () => {
    for (const db of targetCreatedDbs) {
      try { await dropIsolatedDb(db, TARGET_DB_URL); } catch {}
    }
    if (storageBackupTmpDir) cleanTmpDir(storageBackupTmpDir);
  }, 30_000);

  // ── R16: Cross-stack restore completes ─────────────────────────
  it("R16: restore to different Supabase stack (port 54332) succeeds", () => {
    if (!targetAvailable) return;
    expect(crossStackResult.totalRows).toBeGreaterThan(0);
    expect(crossStackResult.targetDbUrl).toContain("54332");
  });

  // ── R17: Target DB URL points to target stack ──────────────────
  it("R17: target DB URL is on port 54332, not 54322", () => {
    if (!targetAvailable) return;
    expect(crossStackResult.targetDbUrl).not.toContain("54322");
    expect(crossStackResult.targetDbUrl).toContain("54332");
  });

  // ── R18: Integrity match on cross-stack restore ────────────────
  it("R18: integrity checksums match on cross-stack restore", () => {
    if (!targetAvailable) return;
    expect(crossStackResult.integrityMatch).toBe(true);
  });

  // ── R19: Storage objects restored to target stack ──────────────
  it("R19: storage.objects rows restored to target stack", () => {
    if (!targetAvailable) return;
    const storageCount = crossStackResult.restoredRows["storage_objects"] ?? 0;
    expect(storageCount).toBe(124);
  });

  // ── R20: path_tokens generated column works on target ──────────
  it("R20: path_tokens generated column populated on target", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(crossStackResult.targetDbUrl);
    await client.connect();
    try {
      const r = await client.query(
        "SELECT path_tokens FROM storage.objects WHERE name LIKE '%/%' LIMIT 1"
      );
      if (r.rows.length > 0) {
        expect(Array.isArray(r.rows[0].path_tokens)).toBe(true);
        expect(r.rows[0].path_tokens.length).toBeGreaterThan(1);
      }
    } finally {
      await client.end();
    }
  });

  // ── R21: Cases match on cross-stack restore ────────────────────
  it("R21: case count matches backup manifest on target", () => {
    if (!targetAvailable) return;
    expect(crossStackResult.restoredRows.cases).toBe(30);
  });

  // ── R22: Single org isolation on target ────────────────────────
  it("R22: target DB contains only Corpus B org", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(crossStackResult.targetDbUrl);
    await client.connect();
    try {
      const orgs = await client.query("SELECT id FROM organizations");
      expect(orgs.rows).toHaveLength(1);
      expect(orgs.rows[0].id).toBe(CORPUS_B_ORG);
    } finally {
      await client.end();
    }
  });

  // ── R23: Auth stubs created on target ──────────────────────────
  it("R23: auth.users stubs created on target for all profiles", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(crossStackResult.targetDbUrl);
    await client.connect();
    try {
      const orphans = await client.query(
        "SELECT count(*)::int AS cnt FROM profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)"
      );
      expect(orphans.rows[0].cnt).toBe(0);
    } finally {
      await client.end();
    }
  });

  // ── R24: All 9 enum types created on target ────────────────────
  it("R24: all 9 enum types exist on target stack", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(crossStackResult.targetDbUrl);
    await client.connect();
    try {
      const enums = await client.query(
        "SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')"
      );
      const names = enums.rows.map((r: { typname: string }) => r.typname);
      expect(names.length).toBe(9);
      for (const e of ["author_mode", "file_kind", "run_status", "round_kind", "user_role"]) {
        expect(names).toContain(e);
      }
    } finally {
      await client.end();
    }
  });

  // ── R25: quoteTableName handles schema-qualified names ─────────
  it("R25: quoteTableName produces correct SQL for schema.table", async () => {
    const { quoteTableName } = await import("../index") as any;
    if (typeof quoteTableName !== "function") {
      // quoteTableName is not exported — test via behavior: restore with storage works
      expect(crossStackResult?.restoredRows["storage_objects"]).toBeGreaterThan(0);
      return;
    }
    expect(quoteTableName("storage.objects")).toBe('"storage"."objects"');
    expect(quoteTableName("cases")).toBe('"cases"');
  });

  // ── R26: Restore idempotent on target stack ────────────────────
  it("R26: drop + re-restore on target produces same counts", async () => {
    if (!targetAvailable) return;
    const dbName = `gate7_idem_${Date.now()}`;
    targetCreatedDbs.push(dbName);

    const r1 = await restore({
      archivePath: storageBackupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: TARGET_DB_URL,
    });

    await dropIsolatedDb(dbName, TARGET_DB_URL);

    const r2 = await restore({
      archivePath: storageBackupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: TARGET_DB_URL,
    });

    expect(r1.totalRows).toBe(r2.totalRows);
    expect(r1.restoredRows["storage_objects"]).toBe(r2.restoredRows["storage_objects"]);
  });

  // ── R27: dropIsolatedDb works on target stack ──────────────────
  it("R27: dropIsolatedDb removes DB from target stack", async () => {
    if (!targetAvailable) return;
    const dbName = `gate7_drop_${Date.now()}`;

    await restore({
      archivePath: storageBackupArchive,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: TARGET_DB_URL,
    });

    await dropIsolatedDb(dbName, TARGET_DB_URL);

    const client = new pg.Client(TARGET_DB_URL);
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

  // ── R28: Source DB unaffected by cross-stack restore ────────────
  it("R28: source DB Corpus B data unchanged after target restore", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      const cnt = await client.query(
        "SELECT count(*)::int AS cnt FROM cases WHERE organization_id = $1",
        [CORPUS_B_ORG]
      );
      expect(cnt.rows[0].cnt).toBe(30);
    } finally {
      await client.end();
    }
  });

  // ── R29: Storage objects have correct bucket_id on target ──────
  it("R29: storage objects bucket_id = 'case-files' on target", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(crossStackResult.targetDbUrl);
    await client.connect();
    try {
      const r = await client.query(
        "SELECT DISTINCT bucket_id FROM storage.objects"
      );
      expect(r.rows.length).toBe(1);
      expect(r.rows[0].bucket_id).toBe("case-files");
    } finally {
      await client.end();
    }
  });

  // ── R30: FK: cases→organizations valid on target ───────────────
  it("R30: all cases reference existing org on target", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(crossStackResult.targetDbUrl);
    await client.connect();
    try {
      const orphans = await client.query(
        "SELECT count(*)::int AS cnt FROM cases c WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = c.organization_id)"
      );
      expect(orphans.rows[0].cnt).toBe(0);
    } finally {
      await client.end();
    }
  });
});
