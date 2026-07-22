import { describe, it, expect } from "vitest";
import { getAppSettings, saveProvision, type SettingsDb } from "@/lib/db/settings";

function fakeDb(row: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === "app_settings" ? { data: row, error: null } : { data: null, error: { message: "no" } },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(values);
          return { error: null };
        },
      }),
    }),
  } as unknown as SettingsDb;
  return { db, updates };
}

const ROW = {
  id: 1,
  run_cost_cap_usd: 5,
  anthropic_environment_id: null,
  anthropic_agent_id: null,
  agent_config_hash: null,
  updated_at: "2026-07-22T00:00:00Z",
};

describe("settings", () => {
  it("getAppSettings는 단일행을 반환한다", async () => {
    const { db } = fakeDb(ROW);
    const s = await getAppSettings(db);
    expect(s.run_cost_cap_usd).toBe(5);
  });

  it("saveProvision은 세 필드와 updated_at을 갱신한다", async () => {
    const { db, updates } = fakeDb(ROW);
    await saveProvision(db, { environmentId: "env_1", agentId: "agt_1", configHash: "h" });
    expect(updates[0]).toMatchObject({
      anthropic_environment_id: "env_1",
      anthropic_agent_id: "agt_1",
      agent_config_hash: "h",
    });
    expect(updates[0]).toHaveProperty("updated_at");
  });
});
