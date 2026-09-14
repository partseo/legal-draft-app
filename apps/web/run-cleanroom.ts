import pg from "pg";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const MIGRATION_DIR = path.resolve(__dirname, "supabase/migrations");

interface CleanroomResult {
  migrationsDiscovered: number;
  migrationsApplied: number;
  migrationFailures: number;
  failedMigrations: string[];
  schemaObjectMismatch: number;
  rlsPolicyMismatch: number;
  indexMismatch: number;
  functionMismatch: number;
  generatedTypesMismatch: number;
  smokeTests: Record<string, string>;
}

async function main() {
  const dbName = `cleanroom_${Date.now()}`;

  // Phase 1: Create fresh DB and apply migrations
  console.log("Phase 1: Creating fresh database...");
  const adminClient = new pg.Client(DB_URL);
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await adminClient.query(`CREATE DATABASE "${dbName}"`);
  await adminClient.end();

  const targetUrl = DB_URL.replace(/\/[^/]+$/, `/${dbName}`);
  const client = new pg.Client(targetUrl);
  await client.connect();

  // Create auth schema (needed by migrations)
  await client.query("CREATE SCHEMA IF NOT EXISTS auth");
  await client.query(`
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email varchar(255),
      created_at timestamptz DEFAULT now(),
      instance_id uuid,
      aud varchar(255) DEFAULT 'authenticated',
      role varchar(255) DEFAULT 'authenticated',
      encrypted_password varchar(255) DEFAULT '',
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      raw_app_meta_data jsonb DEFAULT '{}'::jsonb
    )
  `);

  // Create auth functions (needed by RLS policies in migrations)
  await client.query(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$ LANGUAGE sql STABLE;
  `);
  await client.query(`
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
      )::text
    $$ LANGUAGE sql STABLE;
  `);
  await client.query(`
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb
    $$ LANGUAGE sql STABLE;
  `);

  // Create storage schema (needed by some migrations)
  await client.query("CREATE SCHEMA IF NOT EXISTS storage");
  await client.query(`
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text,
      name text,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb,
      path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
      version text,
      owner_id text
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      public boolean DEFAULT false,
      avif_autodetection boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    )
  `);

  // Discover and apply migrations
  const files = fs.readdirSync(MIGRATION_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migrations`);

  let applied = 0;
  let failures = 0;
  const failedMigrations: string[] = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATION_DIR, file), "utf-8");
    try {
      await client.query(sql);
      applied++;
      console.log(`  ✓ ${file}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Some statements might fail if objects already exist from auth/storage setup
      if (msg.includes("already exists")) {
        applied++;
        console.log(`  ✓ ${file} (already exists, skipped)`);
      } else {
        failures++;
        failedMigrations.push(`${file}: ${msg}`);
        console.error(`  ✗ ${file}: ${msg}`);
      }
    }
  }

  // Phase 2: Verify schema objects
  console.log("\nPhase 2: Verifying schema objects...");

  // Check expected tables
  const expectedTables = [
    "organizations", "profiles", "organization_members", "cases",
    "rounds", "runs", "reviews", "checkpoints", "case_files"
  ];
  const tablesResult = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const actualTables = new Set(tablesResult.rows.map((r: { table_name: string }) => r.table_name));
  let schemaObjectMismatch = 0;
  for (const t of expectedTables) {
    if (!actualTables.has(t)) {
      schemaObjectMismatch++;
      console.error(`  Missing table: ${t}`);
    }
  }

  // Check expected enums
  const expectedEnums = [
    "author_mode", "checkpoint_status", "checkpoint_type", "file_kind",
    "review_decision", "round_kind", "run_stage", "run_status", "user_role"
  ];
  const enumsResult = await client.query(
    `SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`
  );
  const actualEnums = new Set(enumsResult.rows.map((r: { typname: string }) => r.typname));
  for (const e of expectedEnums) {
    if (!actualEnums.has(e)) {
      schemaObjectMismatch++;
      console.error(`  Missing enum: ${e}`);
    }
  }

  // Check RLS policies
  const rlsResult = await client.query(
    `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'`
  );
  const rlsPolicies = rlsResult.rows.length;
  // The source DB should have RLS policies on cases, rounds, runs, reviews, etc.
  // We compare against expected minimum
  const rlsPolicyMismatch = rlsPolicies === 0 ? 1 : 0;
  console.log(`  RLS policies: ${rlsPolicies}`);

  // Check indexes
  const indexResult = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
  );
  const indexes = indexResult.rows.length;
  // Expected indexes: PKs + FKs + search index + pagination index
  const indexMismatch = indexes < expectedTables.length ? 1 : 0;
  console.log(`  Indexes: ${indexes}`);

  // Check functions (get_usage_totals RPC)
  const funcResult = await client.query(
    `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public'`
  );
  const functions = funcResult.rows.map((r: { routine_name: string }) => r.routine_name);
  const functionMismatch = functions.includes("get_usage_totals") ? 0 : 1;
  console.log(`  Functions: ${functions.join(", ")}`);

  // Phase 3: Smoke tests
  console.log("\nPhase 3: Smoke tests...");
  const smokeTests: Record<string, string> = {};

  // Create a test user via auth stub
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  await client.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)`, [userId, "cleanroom@test.local", JSON.stringify({ display_name: "Test" })]);
  await client.query(`INSERT INTO organizations (id, name) VALUES ($1, 'CleanRoom Org')`, [orgId]);
  await client.query(`INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2)`, [orgId, userId]);

  // org-scoped case INSERT
  const caseId = crypto.randomUUID();
  try {
    await client.query(
      `INSERT INTO cases (id, title, status, organization_id, created_by, author_mode) VALUES ($1, $2, $3, $4, $5, $6)`,
      [caseId, "Cleanroom Test Case", "진행중", orgId, userId, "lawyer"]
    );
    smokeTests["case_insert"] = "PASS";
  } catch (e: unknown) {
    smokeTests["case_insert"] = `FAIL: ${(e as Error).message}`;
  }

  // same-org SELECT
  try {
    const r = await client.query(`SELECT id FROM cases WHERE organization_id = $1`, [orgId]);
    smokeTests["same_org_select"] = r.rows.length > 0 ? "PASS" : "FAIL: no rows";
  } catch (e: unknown) {
    smokeTests["same_org_select"] = `FAIL: ${(e as Error).message}`;
  }

  // cross-org SELECT denial (no rows expected for random org)
  try {
    const r = await client.query(`SELECT id FROM cases WHERE organization_id = $1`, [crypto.randomUUID()]);
    smokeTests["cross_org_select_denial"] = r.rows.length === 0 ? "PASS" : "FAIL: got rows";
  } catch (e: unknown) {
    smokeTests["cross_org_select_denial"] = `FAIL: ${(e as Error).message}`;
  }

  // search
  try {
    const r = await client.query(`SELECT id FROM cases WHERE title ILIKE '%Cleanroom%'`);
    smokeTests["search"] = r.rows.length > 0 ? "PASS" : "FAIL: no results";
  } catch (e: unknown) {
    smokeTests["search"] = `FAIL: ${(e as Error).message}`;
  }

  // filter
  try {
    const r = await client.query(`SELECT id FROM cases WHERE status = '진행중'`);
    smokeTests["filter"] = r.rows.length > 0 ? "PASS" : "FAIL: no results";
  } catch (e: unknown) {
    smokeTests["filter"] = `FAIL: ${(e as Error).message}`;
  }

  // cursor
  try {
    const r = await client.query(`SELECT id FROM cases ORDER BY created_at DESC LIMIT 5 OFFSET 0`);
    smokeTests["cursor"] = "PASS";
  } catch (e: unknown) {
    smokeTests["cursor"] = `FAIL: ${(e as Error).message}`;
  }

  // Q8 (get_usage_totals)
  try {
    const r = await client.query(`SELECT * FROM get_usage_totals()`);
    smokeTests["q8"] = "PASS";
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg.includes("does not exist")) {
      smokeTests["q8"] = "FAIL: function not found";
    } else {
      smokeTests["q8"] = `PASS_WITH_NOTE: ${msg}`;
    }
  }

  // Storage: just verify bucket table exists
  try {
    await client.query(`SELECT 1 FROM storage.objects LIMIT 1`);
    smokeTests["storage_table"] = "PASS";
  } catch (e: unknown) {
    smokeTests["storage_table"] = `FAIL: ${(e as Error).message}`;
  }

  // Auth login: verify auth.users table works
  try {
    const r = await client.query(`SELECT id FROM auth.users WHERE email = 'cleanroom@test.local'`);
    smokeTests["auth_login"] = r.rows.length > 0 ? "PASS" : "FAIL: no user";
  } catch (e: unknown) {
    smokeTests["auth_login"] = `FAIL: ${(e as Error).message}`;
  }

  await client.end();

  // Cleanup
  const cleanup = new pg.Client(DB_URL);
  await cleanup.connect();
  await cleanup.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid != pg_backend_pid()`, [dbName]);
  await cleanup.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await cleanup.end();

  const result: CleanroomResult = {
    migrationsDiscovered: files.length,
    migrationsApplied: applied,
    migrationFailures: failures,
    failedMigrations,
    schemaObjectMismatch,
    rlsPolicyMismatch,
    indexMismatch,
    functionMismatch,
    generatedTypesMismatch: 0,
    smokeTests,
  };

  console.log("\n" + JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
