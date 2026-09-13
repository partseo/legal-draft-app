import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION_DIR = join(__dirname, "../../../..", "supabase/migrations");
const MIGRATION_FILE = "00000000000005_add_fk_lookup_indexes.sql";

const EXPECTED_INDEXES = [
  { name: "idx_case_files_case_id", table: "case_files", column: "case_id" },
  { name: "idx_runs_round_id", table: "runs", column: "round_id" },
  { name: "idx_reviews_round_id", table: "reviews", column: "round_id" },
] as const;

describe("Slice 1 index contract", () => {
  const migrationPath = join(MIGRATION_DIR, MIGRATION_FILE);

  it("migration file exists", () => {
    expect(() => readFileSync(migrationPath, "utf8")).not.toThrow();
  });

  it("contains exactly 3 CREATE INDEX statements", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const createIndexMatches = sql.match(/CREATE\s+INDEX\b/gi);
    expect(createIndexMatches).toHaveLength(3);
  });

  it("contains only the approved indexes", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const idx of EXPECTED_INDEXES) {
      expect(sql).toContain(idx.name);
      expect(sql).toContain(idx.table);
      expect(sql).toContain(idx.column);
    }
  });

  it("does not contain unauthorized schema changes", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const forbidden = [
      /CREATE\s+TABLE/i,
      /ALTER\s+TABLE/i,
      /DROP\s+TABLE/i,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION/i,
      /CREATE\s+POLICY/i,
      /ALTER\s+POLICY/i,
      /DROP\s+POLICY/i,
      /GRANT\b/i,
      /REVOKE\b/i,
    ];
    for (const pattern of forbidden) {
      expect(sql).not.toMatch(pattern);
    }
  });

  it("does not duplicate existing indexes", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).not.toContain("cases_pkey");
    expect(sql).not.toContain("rounds_case_id_seq_key");
    expect(sql).not.toContain("profiles_pkey");
  });
});
