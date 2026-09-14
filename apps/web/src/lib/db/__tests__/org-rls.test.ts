import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import pg from "pg";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const USER_A1 = "a0000000-0000-0000-0000-000000000001";
const USER_A2 = "a0000000-0000-0000-0000-000000000002";
const USER_B1 = "a0000000-0000-0000-0000-000000000003";
const CASE_A1 = "c0000001-0000-0000-0000-000000000000";
const CASE_B1 = "c0000401-0000-0000-0000-000000000000";
const CASE_ORG1 = "c0000050-0000-0000-0000-000000000000"; // USER_A1's org
const CASE_ORG3 = "c0009952-0000-0000-0000-000000000000"; // USER_B1's org

function jwtClaims(userId: string) {
  return JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" });
}

async function asAuthenticated(client: pg.Client, userId: string) {
  await client.query("SET ROLE authenticated");
  await client.query(`SET request.jwt.claims = '${jwtClaims(userId)}'`);
  await client.query(`SET request.jwt.claim.sub = '${userId}'`);
}

async function asAnon(client: pg.Client) {
  await client.query("SET ROLE anon");
  await client.query("SET request.jwt.claims = '{}'");
}

async function asServiceRole(client: pg.Client) {
  await client.query("SET ROLE service_role");
}

async function resetRole(client: pg.Client) {
  try { await client.query("ROLLBACK"); } catch {}
  await client.query("RESET ROLE");
  await client.query("SET request.jwt.claims = '{}'");
  await client.query("SET request.jwt.claim.sub = ''");
}

async function orgIdForUser(client: pg.Client, userId: string): Promise<string | null> {
  const r = await client.query(
    "SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  return r.rows[0]?.organization_id ?? null;
}

describe("Organization RLS Integration Tests", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client(DB_URL);
    await client.connect();
  });

  afterAll(async () => {
    await resetRole(client);
    await client.end();
  });

  afterEach(async () => {
    await resetRole(client);
  });

  // ── P: Schema prerequisites ──

  describe("P: Organization schema exists", () => {
    it("P1: organizations table exists", async () => {
      const r = await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organizations'"
      );
      expect(r.rowCount).toBe(1);
    });

    it("P2: organization_members table exists", async () => {
      const r = await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organization_members'"
      );
      expect(r.rowCount).toBe(1);
    });

    it("P3: cases.organization_id column exists and is NOT NULL", async () => {
      const r = await client.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='cases' AND column_name='organization_id'`
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].is_nullable).toBe("NO");
    });

    it("P4: all 10K cases have organization_id set", async () => {
      const r = await client.query(
        "SELECT count(*) as cnt FROM cases WHERE organization_id IS NULL"
      );
      expect(Number(r.rows[0].cnt)).toBe(0);
    });

    it("P5: all 50 profiles are in organization_members", async () => {
      const r = await client.query(
        `SELECT count(DISTINCT p.id) as cnt FROM profiles p
         WHERE NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = p.id)`
      );
      expect(Number(r.rows[0].cnt)).toBe(0);
    });
  });

  // ── A: Anon access blocking ──

  describe("A: Anon cannot access data tables", () => {
    it("A1: anon cannot SELECT cases", async () => {
      await asAnon(client);
      const r = await client.query("SELECT count(*) as cnt FROM cases");
      expect(Number(r.rows[0].cnt)).toBe(0);
    });

    it("A2: anon cannot SELECT rounds", async () => {
      await asAnon(client);
      const r = await client.query("SELECT count(*) as cnt FROM rounds");
      expect(Number(r.rows[0].cnt)).toBe(0);
    });

    it("A3: anon cannot SELECT case_files", async () => {
      await asAnon(client);
      const r = await client.query("SELECT count(*) as cnt FROM case_files");
      expect(Number(r.rows[0].cnt)).toBe(0);
    });

    it("A4: anon cannot SELECT runs", async () => {
      await asAnon(client);
      const r = await client.query("SELECT count(*) as cnt FROM runs");
      expect(Number(r.rows[0].cnt)).toBe(0);
    });

    it("A5: anon cannot SELECT reviews", async () => {
      await asAnon(client);
      const r = await client.query("SELECT count(*) as cnt FROM reviews");
      expect(Number(r.rows[0].cnt)).toBe(0);
    });
  });

  // ── B: Same-org member can see own org's data ──

  describe("B: Same-org member sees own org data", () => {
    it("B1: USER_A1 sees only their org's cases (200)", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query("SELECT count(*) as cnt FROM cases");
      const cnt = Number(r.rows[0].cnt);
      expect(cnt).toBe(200);
    });

    it("B2: USER_A1 sees only rounds for their org's cases", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query("SELECT count(*) as cnt FROM rounds");
      const cnt = Number(r.rows[0].cnt);
      expect(cnt).toBeGreaterThan(0);
      expect(cnt).toBe(600);
    });

    it("B3: USER_A1 sees only case_files for their org's cases", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query("SELECT count(*) as cnt FROM case_files");
      const cnt = Number(r.rows[0].cnt);
      expect(cnt).toBeGreaterThan(0);
      expect(cnt).toBeLessThan(81000);
    });

    it("B4: adding USER_A2 to USER_A1's org lets both see same cases", async () => {
      // Add USER_A2 to USER_A1's org (as superuser)
      const orgA1 = await orgIdForUser(client, USER_A1);
      expect(orgA1).not.toBeNull();
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [orgA1, USER_A2]
      );
      await client.query("SAVEPOINT b4_check");

      await client.query("SET ROLE authenticated");
      await client.query(`SET request.jwt.claims = '${jwtClaims(USER_A1)}'`);
      await client.query(`SET request.jwt.claim.sub = '${USER_A1}'`);
      const r1 = await client.query("SELECT count(*) as cnt FROM cases");

      await client.query("RESET ROLE");
      await client.query("SET ROLE authenticated");
      await client.query(`SET request.jwt.claims = '${jwtClaims(USER_A2)}'`);
      await client.query(`SET request.jwt.claim.sub = '${USER_A2}'`);
      const r2 = await client.query("SELECT count(*) as cnt FROM cases");

      // USER_A1 sees own 200; USER_A2 in 2 orgs sees 400
      expect(Number(r1.rows[0].cnt)).toBe(200);
      expect(Number(r2.rows[0].cnt)).toBe(400);

      await client.query("RESET ROLE");
      await client.query("ROLLBACK");
    });
  });

  // ── C: Cross-org isolation (SELECT) ──

  describe("C: Cross-org SELECT isolation", () => {
    it("C1: USER_A1 cannot see USER_B1's org case", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "SELECT id FROM cases WHERE id = $1", [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
    });

    it("C2: USER_B1 cannot see USER_A1's org case", async () => {
      await asAuthenticated(client, USER_B1);
      const r = await client.query(
        "SELECT id FROM cases WHERE id = $1", [CASE_A1]
      );
      expect(r.rowCount).toBe(0);
    });

    it("C3: USER_A1 cannot see rounds from USER_B1's org", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        `SELECT r.id FROM rounds r
         JOIN cases c ON c.id = r.case_id
         WHERE c.id = $1`, [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
    });

    it("C4: USER_A1 cannot see case_files from USER_B1's org", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "SELECT cf.id FROM case_files cf WHERE cf.case_id = $1", [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
    });

    it("C5: USER_A1 cannot see reviews from USER_B1's org", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        `SELECT rv.id FROM reviews rv
         JOIN rounds rd ON rd.id = rv.round_id
         WHERE rd.case_id = $1`, [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
    });

    it("C6: USER_A1 cannot see runs from USER_B1's org", async () => {
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        `SELECT rn.id FROM runs rn
         JOIN rounds rd ON rd.id = rn.round_id
         WHERE rd.case_id = $1`, [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
    });
  });

  // ── D: Cross-org INSERT blocking (savepoint rollback) ──

  describe("D: Cross-org INSERT blocking", () => {
    it("D1: USER_A1 cannot insert a case with USER_B1's org_id", async () => {
      await resetRole(client);
      const orgB = await orgIdForUser(client, USER_B1);
      expect(orgB).not.toBeNull();

      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      try {
        await client.query(
          `INSERT INTO cases (id, title, status, created_by, organization_id)
           VALUES (gen_random_uuid(), 'cross-org-inject', '대기', $1, $2)`,
          [USER_A1, orgB]
        );
        expect.fail("INSERT should have been blocked by RLS");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).toMatch(/policy|permission|violat/i);
      } finally {
        await resetRole(client);
        await client.query("ROLLBACK");
      }
    });

    it("D2: USER_A1 cannot insert a round on USER_B1's case", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      try {
        await client.query(
          `INSERT INTO rounds (id, case_id, kind, seq)
           VALUES (gen_random_uuid(), $1, '소장', 999)`,
          [CASE_B1]
        );
        expect.fail("INSERT should have been blocked by RLS");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).toMatch(/policy|permission|violat/i);
      } finally {
        await resetRole(client);
        await client.query("ROLLBACK");
      }
    });
  });

  // ── E: Cross-org UPDATE blocking ──

  describe("E: Cross-org UPDATE blocking", () => {
    it("E1: USER_A1 cannot update USER_B1's case title", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "UPDATE cases SET title = 'hacked' WHERE id = $1 RETURNING id",
        [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("E2: USER_A1 cannot update rounds on USER_B1's case", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        `UPDATE rounds SET seq = 999
         WHERE case_id = $1 RETURNING id`,
        [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
      await resetRole(client);
      await client.query("ROLLBACK");
    });
  });

  // ── F: Cross-org DELETE blocking (savepoint rollback) ──

  describe("F: Cross-org DELETE blocking", () => {
    it("F1: USER_A1 cannot delete USER_B1's case", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "DELETE FROM cases WHERE id = $1 RETURNING id",
        [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("F2: USER_A1 cannot delete case_files from USER_B1's case", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "DELETE FROM case_files WHERE case_id = $1 RETURNING id",
        [CASE_B1]
      );
      expect(r.rowCount).toBe(0);
      await resetRole(client);
      await client.query("ROLLBACK");
    });
  });

  // ── G: Membership self-escalation blocking ──

  describe("G: Membership self-escalation blocking", () => {
    it("G1: USER_A1 cannot add themselves to USER_B1's org", async () => {
      await resetRole(client);
      const orgB = await orgIdForUser(client, USER_B1);
      expect(orgB).not.toBeNull();

      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      try {
        await client.query(
          `INSERT INTO organization_members (organization_id, user_id)
           VALUES ($1, $2)`,
          [orgB, USER_A1]
        );
        expect.fail("INSERT should have been blocked by RLS");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).toMatch(/policy|permission|violat/i);
      } finally {
        await resetRole(client);
        await client.query("ROLLBACK");
      }
    });

    it("G2: USER_A1 cannot create a new organization", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      try {
        await client.query(
          "INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), 'rogue-org')"
        );
        expect.fail("INSERT should have been blocked by RLS");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).toMatch(/policy|permission|violat/i);
      } finally {
        await resetRole(client);
        await client.query("ROLLBACK");
      }
    });

    it("G3: USER_A1 cannot remove USER_A2 from their org", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "DELETE FROM organization_members WHERE user_id = $1 RETURNING user_id",
        [USER_A2]
      );
      expect(r.rowCount).toBe(0);
      await resetRole(client);
      await client.query("ROLLBACK");
    });
  });

  // ── H: Service role bypass ──

  describe("H: Service role sees all data", () => {
    it("H1: service_role can see all 10K cases for 81K corpus org", async () => {
      await asServiceRole(client);
      const r = await client.query(
        "SELECT count(*)::int as cnt FROM cases WHERE organization_id = 'a0000000-0000-0000-0000-000000081000'"
      );
      expect(r.rows[0].cnt).toBe(10000);
    });

    it("H2: service_role can see all seed organizations", async () => {
      await asServiceRole(client);
      const r = await client.query(
        "SELECT count(*)::int as cnt FROM organizations WHERE id::text LIKE 'b0000000-0000-0000-0000-%'"
      );
      expect(r.rows[0].cnt).toBe(50);
    });
  });

  // ── I: Compatibility trigger ──

  describe("I: New case INSERT without org_id auto-assigns", () => {
    it("I1: INSERT without organization_id auto-assigns user's org", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        `INSERT INTO cases (id, title, status, created_by)
         VALUES (gen_random_uuid(), 'auto-org-test', '대기', $1)
         RETURNING id, organization_id`,
        [USER_A1]
      );
      expect(r.rowCount).toBe(1);
      const insertedOrgId = r.rows[0].organization_id;

      await resetRole(client);
      const orgA = await orgIdForUser(client, USER_A1);
      expect(insertedOrgId).toBe(orgA);

      await client.query("ROLLBACK");
    });
  });

  // ── J: get_usage_totals cross-org leak ──

  describe("J: get_usage_totals org isolation", () => {
    it("J1: USER_A1 usage count is scoped to their org", async () => {
      await resetRole(client);
      const totalR = await client.query("SELECT count(*) as cnt FROM runs");
      const totalRuns = Number(totalR.rows[0].cnt);

      await asAuthenticated(client, USER_A1);
      const r = await client.query("SELECT * FROM get_usage_totals()");
      const userRuns = Number(r.rows[0]?.run_count ?? 0);
      expect(userRuns).toBeGreaterThan(0);
      expect(userRuns).toBeLessThan(totalRuns);
    });
  });

  // ── K: Checkpoints cross-org isolation (live data) ──

  describe("K: Checkpoints org isolation with live data", () => {
    it("K1: same-org checkpoint visible, cross-org invisible", async () => {
      await client.query("BEGIN");

      // Insert test checkpoints as superuser
      const runA = await client.query(
        `SELECT rn.id FROM runs rn JOIN rounds rd ON rd.id = rn.round_id
         WHERE rd.case_id = $1 LIMIT 1`, [CASE_ORG1]);
      const runB = await client.query(
        `SELECT rn.id FROM runs rn JOIN rounds rd ON rd.id = rn.round_id
         WHERE rd.case_id = $1 LIMIT 1`, [CASE_ORG3]);

      await client.query(
        `INSERT INTO checkpoints (id, run_id, kind, status, payload) VALUES
         ('eeee0001-0000-0000-0000-000000000001', $1, '쟁점승인', '대기', '{"test":"org1"}'),
         ('eeee0001-0000-0000-0000-000000000002', $2, '쟁점승인', '대기', '{"test":"org3"}')`,
        [runA.rows[0].id, runB.rows[0].id]);

      await asAuthenticated(client, USER_A1);
      const own = await client.query(
        "SELECT count(*)::int as cnt FROM checkpoints WHERE id = 'eeee0001-0000-0000-0000-000000000001'");
      expect(own.rows[0].cnt).toBe(1);

      const cross = await client.query(
        "SELECT count(*)::int as cnt FROM checkpoints WHERE id = 'eeee0001-0000-0000-0000-000000000002'");
      expect(cross.rows[0].cnt).toBe(0);

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("K2: cross-org checkpoint INSERT blocked", async () => {
      await client.query("BEGIN");

      const runB = await client.query(
        `SELECT rn.id FROM runs rn JOIN rounds rd ON rd.id = rn.round_id
         WHERE rd.case_id = $1 LIMIT 1`, [CASE_ORG3]);

      await asAuthenticated(client, USER_A1);
      await expect(client.query(
        `INSERT INTO checkpoints (id, run_id, kind, status, payload)
         VALUES (gen_random_uuid(), $1, '쟁점승인', '대기', '{}')`,
        [runB.rows[0].id]
      )).rejects.toThrow();

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("K3: cross-org checkpoint UPDATE blocked", async () => {
      await client.query("BEGIN");

      const runB = await client.query(
        `SELECT rn.id FROM runs rn JOIN rounds rd ON rd.id = rn.round_id
         WHERE rd.case_id = $1 LIMIT 1`, [CASE_ORG3]);
      await client.query(
        `INSERT INTO checkpoints (id, run_id, kind, status, payload)
         VALUES ('eeee0001-0000-0000-0000-000000000002', $1, '쟁점승인', '대기', '{}')`,
        [runB.rows[0].id]);

      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "UPDATE checkpoints SET payload = '{\"t\":1}' WHERE id = 'eeee0001-0000-0000-0000-000000000002'");
      expect(r.rowCount).toBe(0);

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("K4: cross-org checkpoint DELETE blocked", async () => {
      await client.query("BEGIN");

      const runB = await client.query(
        `SELECT rn.id FROM runs rn JOIN rounds rd ON rd.id = rn.round_id
         WHERE rd.case_id = $1 LIMIT 1`, [CASE_ORG3]);
      await client.query(
        `INSERT INTO checkpoints (id, run_id, kind, status, payload)
         VALUES ('eeee0001-0000-0000-0000-000000000002', $1, '쟁점승인', '대기', '{}')`,
        [runB.rows[0].id]);

      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "DELETE FROM checkpoints WHERE id = 'eeee0001-0000-0000-0000-000000000002' RETURNING id");
      expect(r.rowCount).toBe(0);

      await resetRole(client);
      await client.query("ROLLBACK");
    });
  });

  // ── L: Storage object org isolation (live data) ──

  describe("L: Storage object org isolation", () => {
    const OBJ_A = "ff000001-0000-0000-0000-000000000001";
    const OBJ_B = "ff000001-0000-0000-0000-000000000002";
    const PATH_A = `${CASE_ORG1}/test_doc_a.pdf`;
    const PATH_B = `${CASE_ORG3}/test_doc_b.pdf`;

    it("L1: ORG_A member can SELECT own storage object", async () => {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata)
         VALUES ($1, 'case-files', $2, $3, now(), now(), '{}')`,
        [OBJ_A, PATH_A, USER_A1]);

      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        "SELECT count(*)::int as cnt FROM storage.objects WHERE id = $1", [OBJ_A]);
      expect(r.rows[0].cnt).toBe(1);

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("L2: ORG_B member cannot SELECT ORG_A storage object", async () => {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata)
         VALUES ($1, 'case-files', $2, $3, now(), now(), '{}')`,
        [OBJ_A, PATH_A, USER_A1]);

      await asAuthenticated(client, USER_B1);
      const r = await client.query(
        "SELECT count(*)::int as cnt FROM storage.objects WHERE id = $1", [OBJ_A]);
      expect(r.rows[0].cnt).toBe(0);

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("L3: ORG_B member cannot INSERT into ORG_A storage path", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_B1);
      await expect(client.query(
        `INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata)
         VALUES ($1, 'case-files', $2, $3, now(), now(), '{}')`,
        [OBJ_B, PATH_A, USER_B1]
      )).rejects.toThrow();

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("L4: ORG_B member cannot UPDATE ORG_A storage object", async () => {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata)
         VALUES ($1, 'case-files', $2, $3, now(), now(), '{}')`,
        [OBJ_A, PATH_A, USER_A1]);

      await asAuthenticated(client, USER_B1);
      const r = await client.query(
        "UPDATE storage.objects SET metadata = '{\"x\":1}' WHERE id = $1", [OBJ_A]);
      expect(r.rowCount).toBe(0);

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("L5: anon cannot SELECT storage objects", async () => {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata)
         VALUES ($1, 'case-files', $2, $3, now(), now(), '{}')`,
        [OBJ_A, PATH_A, USER_A1]);

      await asAnon(client);
      const r = await client.query(
        "SELECT count(*)::int as cnt FROM storage.objects WHERE id = $1", [OBJ_A]);
      expect(r.rows[0].cnt).toBe(0);

      await resetRole(client);
      await client.query("ROLLBACK");
    });

    it("L6: ORG_A member can INSERT for own case path", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_A1);
      const r = await client.query(
        `INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata)
         VALUES ($1, 'case-files', $2, $3, now(), now(), '{}') RETURNING id`,
        [OBJ_A, PATH_A, USER_A1]);
      expect(r.rowCount).toBe(1);

      await resetRole(client);
      await client.query("ROLLBACK");
    });
  });

  // ── M: Cross-org DELETE explicit (directive §6.1) ──

  describe("M: Cross-org case DELETE explicit", () => {
    it("M1: USER_B1 cannot DELETE CASE_A1", async () => {
      await client.query("BEGIN");
      await asAuthenticated(client, USER_B1);
      const r = await client.query(
        "DELETE FROM cases WHERE id = $1 RETURNING id", [CASE_A1]);
      expect(r.rowCount).toBe(0);

      await resetRole(client);
      // Verify case still exists
      const check = await client.query(
        "SELECT count(*)::int as cnt FROM cases WHERE id = $1", [CASE_A1]);
      expect(check.rows[0].cnt).toBe(1);

      await client.query("ROLLBACK");
    });
  });
});
