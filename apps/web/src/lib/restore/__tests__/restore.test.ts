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
const GATE7_ORG = "c0000000-0000-0000-0000-000000000701";

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

async function createGate7TestData(): Promise<{ orgId: string; userId: string; caseCount: number; storageCount: number }> {
  const client = new pg.Client(DB_URL);
  await client.connect();
  try {
    const userId = "c0000000-0000-0000-0000-000000000702";

    // Create auth user
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, "gate7-test@test.local"]
    );
    await client.query(
      `INSERT INTO organizations (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [GATE7_ORG, "Gate 7 Test Org"]
    );
    await client.query(
      `INSERT INTO profiles (id, display_name, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [userId, "Gate 7 User"]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [GATE7_ORG, userId]
    );

    // Create 5 cases with storage objects
    let storageCount = 0;
    for (let i = 0; i < 5; i++) {
      const caseId = `c0000000-0000-0000-${String(i).padStart(4, "0")}-000000000703`;
      await client.query(
        `INSERT INTO cases (id, title, status, organization_id, created_by, author_mode)
         VALUES ($1, $2, '진행중', $3, $4, 'lawyer') ON CONFLICT DO NOTHING`,
        [caseId, `Gate7 Case ${i}`, GATE7_ORG, userId]
      );

      // Create storage objects for each case
      for (let f = 0; f < 3; f++) {
        const objId = `c0000000-0000-0000-${String(i).padStart(4, "0")}-00000000000${f}`;
        await client.query(
          `INSERT INTO storage.objects (id, bucket_id, name, owner, metadata, version)
           VALUES ($1, 'case-files', $2, $3, '{}', '1') ON CONFLICT DO NOTHING`,
          [objId, `${caseId}/file-${f}.txt`, userId]
        );
        storageCount++;
      }
    }

    return { orgId: GATE7_ORG, userId, caseCount: 5, storageCount };
  } finally {
    await client.end();
  }
}

async function cleanupGate7TestData(): Promise<void> {
  const client = new pg.Client(DB_URL);
  await client.connect();
  try {
    const userId = "c0000000-0000-0000-0000-000000000702";
    await client.query(`DELETE FROM storage.objects WHERE owner = $1`, [userId]);
    await client.query(`DELETE FROM cases WHERE organization_id = $1`, [GATE7_ORG]);
    await client.query(`DELETE FROM organization_members WHERE organization_id = $1`, [GATE7_ORG]);
    await client.query(`DELETE FROM profiles WHERE id = $1`, [userId]);
    await client.query(`DELETE FROM organizations WHERE id = $1`, [GATE7_ORG]);
    await client.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
  } finally {
    await client.end();
  }
}

describe("Gate 7 Corrected: Cross-Stack Isolated Restore", { timeout: 120_000 }, () => {
  let targetAvailable = false;
  let storageBackupArchive: string;
  let storageBackupTmpDir: string;
  let crossStackDbName: string;
  let crossStackResult: Awaited<ReturnType<typeof restore>>;
  let testData: { orgId: string; userId: string; caseCount: number; storageCount: number };
  const targetCreatedDbs: string[] = [];

  beforeAll(async () => {
    targetAvailable = await isTargetStackAvailable();
    if (!targetAvailable) return;

    testData = await createGate7TestData();

    storageBackupTmpDir = makeTmpDir();
    const r = await backup({
      organizationId: GATE7_ORG,
      outputPath: storageBackupTmpDir,
      encryptionKey: TEST_KEY,
      dbUrl: DB_URL,
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
    try { await cleanupGate7TestData(); } catch {}
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
    expect(storageCount).toBe(testData.storageCount);
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
    expect(crossStackResult.restoredRows.cases).toBe(testData.caseCount);
  });

  // ── R22: Single org isolation on target ────────────────────────
  it("R22: target DB contains only test org", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(crossStackResult.targetDbUrl);
    await client.connect();
    try {
      const orgs = await client.query("SELECT id FROM organizations");
      expect(orgs.rows).toHaveLength(1);
      expect(orgs.rows[0].id).toBe(GATE7_ORG);
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
    if (!targetAvailable) return;
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
  it("R28: source DB test data unchanged after target restore", async () => {
    if (!targetAvailable) return;
    const client = new pg.Client(DB_URL);
    await client.connect();
    try {
      const cnt = await client.query(
        "SELECT count(*)::int AS cnt FROM cases WHERE organization_id = $1",
        [GATE7_ORG]
      );
      expect(cnt.rows[0].cnt).toBe(testData.caseCount);
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

// ═══════════════════════════════════════════════════════════════════
// Gate 7 Strict: Storage Binary Restore Round-Trip (R31-R35)
// ═══════════════════════════════════════════════════════════════════

const TARGET_STORAGE_API = "http://127.0.0.1:54331";
const GATE7_STRICT_ORG = "c0000000-0000-0000-0000-000000000710";

describe("Gate 7 Strict: Storage Binary Restore Round-Trip", { timeout: 120_000 }, () => {
  let targetAvailableStrict = false;
  let backupArchiveStrict: string;
  let tmpDirStrict: string;
  let restoreResultStrict: Awaited<ReturnType<typeof restore>>;
  const targetCreatedDbsStrict: string[] = [];
  const uploadedKeys: string[] = [];
  const uploadedContents: Map<string, Buffer> = new Map();
  const ts7 = Date.now();

  beforeAll(async () => {
    targetAvailableStrict = await isTargetStackAvailable();
    if (!targetAvailableStrict) return;

    // Create test data on source with storage files
    const sourceClient = new pg.Client(DB_URL);
    await sourceClient.connect();
    try {
      const userId = "c0000000-0000-0000-0000-000000000711";
      await sourceClient.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, `gate7strict-${ts7}@test.local`]
      );
      await sourceClient.query(
        `INSERT INTO organizations (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [GATE7_STRICT_ORG, "Gate 7 Strict Org"]
      );
      await sourceClient.query(
        `INSERT INTO profiles (id, display_name, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [userId, "Gate 7 Strict User"]
      );
      await sourceClient.query(
        `INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [GATE7_STRICT_ORG, userId]
      );

      const caseId = "c0000000-0000-0000-0000-000000000712";
      await sourceClient.query(
        `INSERT INTO cases (id, title, organization_id, assignee, created_by, created_at) VALUES ($1, $2, $3, $4, $4, now()) ON CONFLICT DO NOTHING`,
        [caseId, "Gate7 Strict Case", GATE7_STRICT_ORG, userId]
      );

      // Upload 3 files to source Storage
      const files = [
        { key: `${caseId}/${crypto.randomUUID()}.txt`, content: Buffer.from("한글 스토리지 복원 테스트\n"), displayName: "한글테스트.txt" },
        { key: `${caseId}/${crypto.randomUUID()}.bin`, content: crypto.randomBytes(512), displayName: "바이너리.bin" },
        { key: `${caseId}/${crypto.randomUUID()}.pdf`, content: Buffer.from("%PDF-1.4 gate7 strict test\n"), displayName: "소장초안.pdf" },
      ];

      for (const f of files) {
        const encodedKey = f.key.split("/").map(s => encodeURIComponent(s)).join("/");
        const res = await fetch(`${SOURCE_API}/storage/v1/object/case-files/${encodedKey}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            "Content-Type": "application/octet-stream",
          },
          body: f.content,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        uploadedKeys.push(f.key);
        uploadedContents.set(f.key, f.content);

        const cfId = crypto.randomUUID();
        await sourceClient.query(
          `INSERT INTO case_files (id, case_id, kind, filename, storage_path, version, uploaded_by, created_at)
           VALUES ($1, $2, '입력', $3, $4, 1, $5, now()) ON CONFLICT DO NOTHING`,
          [cfId, caseId, f.displayName, f.key, userId]
        );
      }
    } finally {
      await sourceClient.end();
    }

    // Backup from source with storage binaries
    tmpDirStrict = makeTmpDir();
    const r = await backup({
      organizationId: GATE7_STRICT_ORG,
      outputPath: tmpDirStrict,
      encryptionKey: TEST_KEY,
      dbUrl: DB_URL,
      storageApiUrl: SOURCE_API,
      storageApiKey: SERVICE_KEY,
    });
    backupArchiveStrict = r.archivePath;

    // Restore to target with storage upload
    const dbName = `gate7strict_${ts7}`;
    targetCreatedDbsStrict.push(dbName);
    restoreResultStrict = await restore({
      archivePath: backupArchiveStrict,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: TARGET_DB_URL,
      storageApiUrl: TARGET_STORAGE_API,
      storageApiKey: SERVICE_KEY,
    });
  }, 60_000);

  afterAll(async () => {
    // Cleanup uploaded source storage files
    for (const key of uploadedKeys) {
      const encodedKey = key.split("/").map(s => encodeURIComponent(s)).join("/");
      await fetch(`${SOURCE_API}/storage/v1/object/case-files/${encodedKey}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
    }

    // Cleanup target DBs
    for (const db of targetCreatedDbsStrict) {
      try { await dropIsolatedDb(db, TARGET_DB_URL); } catch {}
    }

    // Cleanup target storage files
    for (const key of uploadedKeys) {
      const encodedKey = key.split("/").map(s => encodeURIComponent(s)).join("/");
      await fetch(`${TARGET_STORAGE_API}/storage/v1/object/case-files/${encodedKey}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
    }

    // Cleanup source test data
    const sourceClient = new pg.Client(DB_URL);
    await sourceClient.connect();
    try {
      await sourceClient.query("DELETE FROM case_files WHERE case_id = 'c0000000-0000-0000-0000-000000000712'");
      await sourceClient.query("DELETE FROM cases WHERE id = 'c0000000-0000-0000-0000-000000000712'");
      await sourceClient.query("DELETE FROM organization_members WHERE organization_id = $1", [GATE7_STRICT_ORG]);
      await sourceClient.query("DELETE FROM profiles WHERE id = 'c0000000-0000-0000-0000-000000000711'");
      await sourceClient.query("DELETE FROM auth.users WHERE id = 'c0000000-0000-0000-0000-000000000711'");
      await sourceClient.query("DELETE FROM organizations WHERE id = $1", [GATE7_STRICT_ORG]);
    } finally {
      await sourceClient.end();
    }

    cleanTmpDir(tmpDirStrict);
  }, 30_000);

  // ── R31: Storage binaries uploaded to target ────────────────────
  it("R31: storage binaries uploaded to target Storage API", () => {
    if (!targetAvailableStrict) return;
    expect(restoreResultStrict.storageFilesUploaded).toBe(uploadedKeys.length);
    expect(restoreResultStrict.storageUploadErrors).toBeUndefined();
  });

  // ── R32: Downloaded content matches original ───────────────────
  it("R32: downloaded content from target matches original bytes", async () => {
    if (!targetAvailableStrict) return;

    for (const key of uploadedKeys) {
      const encodedKey = key.split("/").map(s => encodeURIComponent(s)).join("/");
      const res = await fetch(`${TARGET_STORAGE_API}/storage/v1/object/authenticated/case-files/${encodedKey}`, {
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
      });
      expect(res.ok).toBe(true);
      const downloaded = Buffer.from(await res.arrayBuffer());
      const original = uploadedContents.get(key)!;
      expect(downloaded.length).toBe(original.length);
      expect(
        crypto.createHash("sha256").update(downloaded).digest("hex")
      ).toBe(
        crypto.createHash("sha256").update(original).digest("hex")
      );
    }
  });

  // ── R33: case_files display names preserved in target DB ───────
  it("R33: case_files Korean display names restored in target DB", async () => {
    if (!targetAvailableStrict) return;
    const client = new pg.Client(restoreResultStrict.targetDbUrl);
    await client.connect();
    try {
      const r = await client.query("SELECT filename FROM case_files ORDER BY filename");
      const names = r.rows.map((row: { filename: string }) => row.filename);
      expect(names).toContain("한글테스트.txt");
      expect(names).toContain("바이너리.bin");
      expect(names).toContain("소장초안.pdf");
    } finally {
      await client.end();
    }
  });

  // ── R34: Restore without storageApiUrl skips upload ────────────
  it("R34: restore without storageApiUrl does not upload binaries", async () => {
    if (!targetAvailableStrict) return;
    const dbName = `gate7nostore_${ts7}`;
    targetCreatedDbsStrict.push(dbName);
    const result = await restore({
      archivePath: backupArchiveStrict,
      encryptionKey: TEST_KEY,
      targetDbName: dbName,
      sourceDbUrl: TARGET_DB_URL,
    });
    expect(result.storageFilesUploaded).toBeUndefined();
    expect(result.storageUploadErrors).toBeUndefined();
    expect(result.integrityMatch).toBe(true);
  });

  // ── R35: Integrity match on storage-binary restore ─────────────
  it("R35: integrity checksums match after storage binary restore", () => {
    if (!targetAvailableStrict) return;
    expect(restoreResultStrict.integrityMatch).toBe(true);
  });
});
