import * as crypto from "node:crypto";
import * as fs from "node:fs";
import pg from "pg";
import { decrypt, type BackupManifest } from "../backup/index";

export interface RestoreOptions {
  archivePath: string;
  encryptionKey: Buffer;
  targetDbName?: string;
  sourceDbUrl?: string;
  storageApiUrl?: string;
  storageApiKey?: string;
}

export interface RestoreResult {
  targetDbUrl: string;
  targetDbName: string;
  manifest: BackupManifest;
  restoredRows: Record<string, number>;
  totalRows: number;
  integrityMatch: boolean;
  storageFilesUploaded?: number;
  storageUploadErrors?: string[];
}

const ENUM_DEFINITIONS: Record<string, string[]> = {
  author_mode: ["lawyer", "judicial_scrivener"],
  checkpoint_status: ["대기", "응답됨"],
  checkpoint_type: ["쟁점승인", "질문"],
  file_kind: ["입력", "사건컨텍스트", "리서치", "서면", "검증보고", "context_json"],
  review_decision: ["승인", "수정지시"],
  round_kind: [
    "소장", "준비서면", "내용증명", "가압류신청서", "가처분신청서",
    "강제집행신청서", "등기신청서_소유권이전", "등기신청서_근저당설정",
    "등기신청서_법인변경", "개인회생신청서", "파산면책신청서",
  ],
  run_stage: ["intake", "research", "draft", "verify"],
  run_status: ["running", "waiting_checkpoint", "succeeded", "failed", "canceled"],
  user_role: ["admin", "member"],
};

const TABLE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS organizations (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    display_name text NOT NULL,
    role user_role NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS organization_members (
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cases (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    status text NOT NULL,
    assignee uuid REFERENCES profiles(id),
    created_by uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    author_mode author_mode NOT NULL,
    organization_id uuid NOT NULL REFERENCES organizations(id)
  )`,
  `CREATE TABLE IF NOT EXISTS rounds (
    id uuid PRIMARY KEY,
    case_id uuid NOT NULL REFERENCES cases(id),
    kind round_kind NOT NULL,
    seq integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id uuid PRIMARY KEY,
    round_id uuid NOT NULL REFERENCES rounds(id),
    stage run_stage NOT NULL,
    status run_status NOT NULL,
    agent_session_id text,
    instruction text,
    input_tokens bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    cost_usd numeric NOT NULL DEFAULT 0,
    error text,
    started_by uuid NOT NULL REFERENCES profiles(id),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id uuid PRIMARY KEY,
    round_id uuid NOT NULL REFERENCES rounds(id),
    stage run_stage NOT NULL,
    decision review_decision NOT NULL,
    note text,
    reviewer uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS checkpoints (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES runs(id),
    kind checkpoint_type NOT NULL,
    status checkpoint_status NOT NULL,
    payload jsonb NOT NULL,
    response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    responded_by uuid REFERENCES profiles(id)
  )`,
  `CREATE TABLE IF NOT EXISTS case_files (
    id uuid PRIMARY KEY,
    case_id uuid NOT NULL REFERENCES cases(id),
    kind file_kind NOT NULL,
    filename text NOT NULL,
    storage_path text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    created_by_run uuid REFERENCES runs(id),
    uploaded_by uuid REFERENCES profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];

const RESTORE_ORDER = [
  "organizations",
  "profiles",
  "organization_members",
  "cases",
  "rounds",
  "runs",
  "reviews",
  "checkpoints",
  "case_files",
  "storage_objects",
];

async function uploadStorageFile(
  apiUrl: string,
  apiKey: string,
  bucket: string,
  objectName: string,
  content: Buffer,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const encoded = objectName.split("/").map(s => encodeURIComponent(s)).join("/");
    const url = `${apiUrl}/storage/v1/object/${bucket}/${encoded}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
        "Content-Type": "application/octet-stream",
      },
      body: content as unknown as BodyInit,
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${txt}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function collectUserIds(data: Record<string, unknown[]>): Set<string> {
  const ids = new Set<string>();

  for (const profile of data.profiles as Array<{ id: string }> || []) {
    ids.add(profile.id);
  }
  for (const member of data.organization_members as Array<{ user_id: string }> || []) {
    ids.add(member.user_id);
  }
  for (const c of data.cases as Array<{ created_by: string; assignee?: string }> || []) {
    ids.add(c.created_by);
    if (c.assignee) ids.add(c.assignee);
  }
  for (const run of data.runs as Array<{ started_by: string }> || []) {
    ids.add(run.started_by);
  }
  for (const review of data.reviews as Array<{ reviewer: string }> || []) {
    ids.add(review.reviewer);
  }
  for (const cp of data.checkpoints as Array<{ responded_by?: string }> || []) {
    if (cp.responded_by) ids.add(cp.responded_by);
  }
  for (const cf of data.case_files as Array<{ uploaded_by?: string }> || []) {
    if (cf.uploaded_by) ids.add(cf.uploaded_by);
  }

  return ids;
}

function quoteTableName(name: string): string {
  if (name.includes(".")) {
    const [schema, table] = name.split(".", 2);
    return `"${schema}"."${table}"`;
  }
  return `"${name}"`;
}

async function insertRows(
  client: pg.Client,
  tableName: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const BATCH = 200;
  const quotedTable = quoteTableName(tableName);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const allValues: unknown[] = [];
    const rowPlaceholders: string[] = [];

    for (let r = 0; r < batch.length; r++) {
      const row = batch[r];
      const offset = r * columns.length;
      const ph = columns.map((_, ci) => `$${offset + ci + 1}`).join(", ");
      rowPlaceholders.push(`(${ph})`);
      for (const c of columns) allValues.push(row[c]);
    }

    await client.query(
      `INSERT INTO ${quotedTable} (${colList}) VALUES ${rowPlaceholders.join(", ")} ON CONFLICT DO NOTHING`,
      allValues
    );
    inserted += batch.length;
  }
  return inserted;
}

export async function restore(options: RestoreOptions): Promise<RestoreResult> {
  const { archivePath, encryptionKey, sourceDbUrl } = options;
  const connStr = sourceDbUrl ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archivePath}`);
  }

  const encrypted = fs.readFileSync(archivePath);
  const decrypted = decrypt(encrypted, encryptionKey);
  const payload = JSON.parse(decrypted.toString("utf-8"));
  const manifest: BackupManifest = payload.manifest;
  const data: Record<string, unknown[]> = payload.data;

  const dbName = options.targetDbName ?? `restore_${Date.now()}`;

  const adminClient = new pg.Client(connStr);
  await adminClient.connect();

  try {
    await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await adminClient.end();
  }

  const targetUrl = connStr.replace(/\/[^/]+$/, `/${dbName}`);
  const targetClient = new pg.Client(targetUrl);
  await targetClient.connect();

  try {
    // Create auth schema and minimal auth.users table
    await targetClient.query("CREATE SCHEMA IF NOT EXISTS auth");
    await targetClient.query(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email varchar(255),
        created_at timestamptz DEFAULT now(),
        instance_id uuid,
        aud varchar(255) DEFAULT 'authenticated',
        role varchar(255) DEFAULT 'authenticated',
        encrypted_password varchar(255) DEFAULT ''
      )
    `);

    // Create enums
    for (const [name, values] of Object.entries(ENUM_DEFINITIONS)) {
      const labels = values.map((v) => `'${v}'`).join(", ");
      await targetClient.query(`CREATE TYPE "${name}" AS ENUM (${labels})`);
    }

    // Create tables
    for (const ddl of TABLE_DDL) {
      await targetClient.query(ddl);
    }

    // Create storage schema and objects table
    await targetClient.query("CREATE SCHEMA IF NOT EXISTS storage");
    await targetClient.query(`
      CREATE TABLE IF NOT EXISTS storage.objects (
        id uuid PRIMARY KEY,
        bucket_id text,
        name text,
        owner uuid,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        last_accessed_at timestamptz DEFAULT now(),
        metadata jsonb,
        path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
        version text,
        owner_id text,
        user_metadata jsonb,
        archived_at timestamptz,
        is_delete_marker boolean NOT NULL DEFAULT false,
        is_versioned boolean NOT NULL DEFAULT false
      )
    `);

    // Collect all referenced user IDs and create auth.users stubs
    const userIds = collectUserIds(data);
    for (const uid of userIds) {
      await targetClient.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [uid, `${uid}@restore-stub.local`]
      );
    }

    // Create profile stubs for user IDs not in the backup's profiles data
    const backedUpProfileIds = new Set(
      ((data.profiles || []) as Array<{ id: string }>).map((p) => p.id)
    );
    for (const uid of userIds) {
      if (!backedUpProfileIds.has(uid)) {
        await targetClient.query(
          `INSERT INTO profiles (id, display_name, role, created_at) VALUES ($1, $2, 'member', now()) ON CONFLICT DO NOTHING`,
          [uid, `stub-${uid.substring(0, 8)}`]
        );
      }
    }

    // Insert data in FK order
    const restoredRows: Record<string, number> = {};
    let totalRows = 0;

    for (const tableName of RESTORE_ORDER) {
      const rows = data[tableName] as Record<string, unknown>[] | undefined;
      if (!rows) {
        restoredRows[tableName] = 0;
        continue;
      }

      if (tableName === "storage_objects") {
        const filtered = rows.map((r) => {
          const { path_tokens, ...rest } = r as Record<string, unknown> & { path_tokens?: unknown };
          return rest;
        });
        const count = await insertRows(targetClient, "storage.objects", filtered);
        restoredRows[tableName] = count;
        totalRows += count;
      } else {
        const count = await insertRows(targetClient, tableName, rows);
        restoredRows[tableName] = count;
        totalRows += count;
      }
    }

    // Verify integrity: checksums match
    let integrityMatch = true;
    for (const [table, info] of Object.entries(manifest.tables)) {
      const restoredData = data[table];
      if (!restoredData) {
        if (info.rowCount > 0) integrityMatch = false;
        continue;
      }
      const checksum = sha256(JSON.stringify(restoredData));
      if (checksum !== info.checksum) integrityMatch = false;
    }

    // Upload storage binaries to target Storage API
    let storageFilesUploaded = 0;
    const storageUploadErrors: string[] = [];
    const storageFiles = payload.storageFiles as Record<string, string> | undefined;
    if (options.storageApiUrl && options.storageApiKey && storageFiles) {
      // Ensure bucket exists
      const bucketRes = await fetch(`${options.storageApiUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.storageApiKey}`,
          apikey: options.storageApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: "case-files", name: "case-files", public: false }),
      });
      if (!bucketRes.ok) {
        const txt = await bucketRes.text();
        if (!txt.includes("already exists")) {
          storageUploadErrors.push(`Bucket creation failed: ${txt}`);
        }
      }

      for (const [key, b64] of Object.entries(storageFiles)) {
        const content = Buffer.from(b64, "base64");
        const result = await uploadStorageFile(
          options.storageApiUrl,
          options.storageApiKey,
          "case-files",
          key,
          content,
        );
        if (result.ok) {
          storageFilesUploaded++;
        } else {
          storageUploadErrors.push(`${key}: ${result.error}`);
        }
      }
    }

    return {
      targetDbUrl: targetUrl,
      targetDbName: dbName,
      manifest,
      restoredRows,
      totalRows,
      integrityMatch,
      storageFilesUploaded: storageFilesUploaded > 0 ? storageFilesUploaded : undefined,
      storageUploadErrors: storageUploadErrors.length > 0 ? storageUploadErrors : undefined,
    };
  } catch (err) {
    // Clean up on failure
    await targetClient.end();
    const cleanupClient = new pg.Client(connStr);
    await cleanupClient.connect();
    try {
      await cleanupClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    } finally {
      await cleanupClient.end();
    }
    throw err;
  } finally {
    await targetClient.end();
  }
}

export async function dropIsolatedDb(dbName: string, sourceDbUrl?: string): Promise<void> {
  const connStr = sourceDbUrl ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  if (dbName === "postgres" || dbName === "_supabase") {
    throw new Error(`Cannot drop system database: ${dbName}`);
  }

  const client = new pg.Client(connStr);
  await client.connect();
  try {
    // Terminate existing connections
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid != pg_backend_pid()`,
      [dbName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  } finally {
    await client.end();
  }
}
