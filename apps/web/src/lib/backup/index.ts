import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import pg from "pg";

export interface BackupOptions {
  organizationId: string;
  outputPath: string;
  encryptionKey: Buffer;
  dbUrl?: string;
  storageApiUrl?: string;
  storageApiKey?: string;
}

export interface BackupManifest {
  schemaVersion: number;
  organizationId: string;
  createdAt: string;
  tables: Record<string, { rowCount: number; checksum: string }>;
  files: { path: string; checksum: string; contentChecksum?: string }[];
  encrypted: boolean;
  storageFilesIncluded?: boolean;
  storageFilesTotalBytes?: number;
  storageFileErrors?: { path: string; error: string }[];
}

export interface BackupResult {
  manifest: BackupManifest;
  archivePath: string;
  totalRows: number;
  totalFiles: number;
}

const ORG_TABLES = [
  {
    name: "organizations",
    query: `SELECT * FROM organizations WHERE id = $1`,
    paramIsOrg: true,
  },
  {
    name: "organization_members",
    query: `SELECT * FROM organization_members WHERE organization_id = $1`,
    paramIsOrg: true,
  },
  {
    name: "profiles",
    query: `SELECT p.* FROM profiles p WHERE p.id IN (SELECT om.user_id FROM organization_members om WHERE om.organization_id = $1)`,
    paramIsOrg: true,
  },
  {
    name: "cases",
    query: `SELECT * FROM cases WHERE organization_id = $1`,
    paramIsOrg: true,
  },
  {
    name: "rounds",
    query: `SELECT r.* FROM rounds r JOIN cases c ON c.id = r.case_id WHERE c.organization_id = $1`,
    paramIsOrg: true,
  },
  {
    name: "runs",
    query: `SELECT rn.* FROM runs rn JOIN rounds rd ON rd.id = rn.round_id JOIN cases c ON c.id = rd.case_id WHERE c.organization_id = $1`,
    paramIsOrg: true,
  },
  {
    name: "reviews",
    query: `SELECT rv.* FROM reviews rv JOIN rounds rd ON rd.id = rv.round_id JOIN cases c ON c.id = rd.case_id WHERE c.organization_id = $1`,
    paramIsOrg: true,
  },
  {
    name: "checkpoints",
    query: `SELECT ck.* FROM checkpoints ck JOIN runs rn ON rn.id = ck.run_id JOIN rounds rd ON rd.id = rn.round_id JOIN cases c ON c.id = rd.case_id WHERE c.organization_id = $1`,
    paramIsOrg: true,
  },
  {
    name: "case_files",
    query: `SELECT cf.* FROM case_files cf JOIN cases c ON c.id = cf.case_id WHERE c.organization_id = $1`,
    paramIsOrg: true,
  },
  {
    name: "storage_objects",
    query: `SELECT so.* FROM storage.objects so WHERE so.bucket_id = 'case-files' AND EXISTS (SELECT 1 FROM cases c WHERE c.organization_id = $1 AND so.name LIKE c.id || '/%')`,
    paramIsOrg: true,
  },
];

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function encryptData(plaintext: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: [iv:12][tag:16][ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

export function decrypt(encrypted: Buffer, key: Buffer): Buffer {
  const iv = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function downloadStorageFile(
  apiUrl: string,
  apiKey: string,
  bucket: string,
  objectName: string
): Promise<{ data: Buffer | null; error: string | null }> {
  try {
    const url = `${apiUrl}/storage/v1/object/authenticated/${bucket}/${objectName}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
      },
    });
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}` };
    }
    const data = Buffer.from(await res.arrayBuffer());
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: msg };
  }
}

export async function backup(options: BackupOptions): Promise<BackupResult> {
  const { organizationId, outputPath, encryptionKey, dbUrl, storageApiUrl, storageApiKey } = options;

  if (!encryptionKey || encryptionKey.length === 0) {
    throw new Error("Encryption key is required");
  }
  if (encryptionKey.length !== 32) {
    throw new Error("Encryption key must be 32 bytes for AES-256-GCM");
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Output path does not exist: ${outputPath}`);
  }

  const connStr = dbUrl ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const client = new pg.Client(connStr);
  await client.connect();

  let archivePath = "";
  try {
    const orgCheck = await client.query(
      "SELECT id FROM organizations WHERE id = $1",
      [organizationId]
    );
    if (orgCheck.rows.length === 0) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const tableData: Record<string, unknown[]> = {};
    const tableChecksums: Record<string, { rowCount: number; checksum: string }> = {};
    let totalRows = 0;

    for (const table of ORG_TABLES) {
      const result = await client.query(table.query, [organizationId]);
      const rows = result.rows;
      tableData[table.name] = rows;

      const serialized = JSON.stringify(rows);
      tableChecksums[table.name] = {
        rowCount: rows.length,
        checksum: sha256(serialized),
      };
      totalRows += rows.length;
    }

    const storageObjects = tableData.storage_objects as Array<{ name: string; bucket_id: string }>;
    const storageFileEntries: BackupManifest["files"] = [];
    const storageFileErrors: { path: string; error: string }[] = [];
    const storageFilesMap: Record<string, string> = {};
    let storageFilesTotalBytes = 0;
    const shouldDownloadBinaries = !!(storageApiUrl && storageApiKey && storageObjects.length > 0);

    for (const obj of storageObjects) {
      const entry: { path: string; checksum: string; contentChecksum?: string } = {
        path: obj.name,
        checksum: sha256(JSON.stringify(obj)),
      };

      if (shouldDownloadBinaries) {
        const { data, error } = await downloadStorageFile(
          storageApiUrl!,
          storageApiKey!,
          obj.bucket_id || "case-files",
          obj.name
        );
        if (data !== null) {
          const b64 = data.toString("base64");
          storageFilesMap[obj.name] = b64;
          entry.contentChecksum = sha256(data);
          storageFilesTotalBytes += data.length;
        } else {
          storageFileErrors.push({ path: obj.name, error: error! });
        }
      }

      storageFileEntries.push(entry);
    }

    const manifest: BackupManifest = {
      schemaVersion: 1,
      organizationId,
      createdAt: new Date().toISOString(),
      tables: tableChecksums,
      files: storageFileEntries,
      encrypted: true,
    };

    if (shouldDownloadBinaries) {
      manifest.storageFilesIncluded = true;
      manifest.storageFilesTotalBytes = storageFilesTotalBytes;
      if (storageFileErrors.length > 0) {
        manifest.storageFileErrors = storageFileErrors;
      }
    }

    const payloadObj: Record<string, unknown> = { manifest, data: tableData };
    if (shouldDownloadBinaries && Object.keys(storageFilesMap).length > 0) {
      payloadObj.storageFiles = storageFilesMap;
    }

    const payload = JSON.stringify(payloadObj);
    const payloadBuffer = Buffer.from(payload, "utf-8");
    const encrypted = encryptData(payloadBuffer, encryptionKey);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${timestamp}.enc`;
    archivePath = path.join(outputPath, filename);
    fs.writeFileSync(archivePath, encrypted);

    return {
      manifest,
      archivePath,
      totalRows,
      totalFiles: storageFileEntries.length,
    };
  } catch (err) {
    if (archivePath && fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    throw err;
  } finally {
    await client.end();
  }
}

export async function verifyChecksum(
  archivePath: string,
  key: Buffer,
  manifest: BackupManifest
): Promise<boolean> {
  const encrypted = fs.readFileSync(archivePath);
  const decrypted = decrypt(encrypted, key);
  const payload = JSON.parse(decrypted.toString("utf-8"));

  for (const [table, info] of Object.entries(manifest.tables)) {
    const data = payload.data[table];
    if (!data) return false;
    const checksum = sha256(JSON.stringify(data));
    if (checksum !== info.checksum) return false;
  }
  return true;
}
