import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, Enums } from "@/lib/db/database.types";
import { artifactStorageKey } from "@/lib/storage-key";

export type RunStage = Enums<"run_stage">;
export type FileKind = Enums<"file_kind">;
export type CaseFileLite = Pick<Tables<"case_files">, "kind" | "filename" | "storage_path" | "version" | "created_at">;
export type RunRow = Tables<"runs">;

export interface RunStore {
  /** 라운드가 없으면 (kind 소장, seq 1) 생성. 항상 최신 라운드 반환 */
  ensureRound(caseId: string): Promise<{ roundId: string; kind: Enums<"round_kind"> }>;
  getCaseAuthorMode(caseId: string): Promise<Enums<"author_mode">>;
  getPipelineInput(roundId: string): Promise<{
    runs: Pick<Tables<"runs">, "id" | "stage" | "status" | "started_at" | "finished_at">[];
    reviews: Pick<Tables<"reviews">, "stage" | "decision" | "created_at">[];
  }>;
  listCaseFiles(caseId: string): Promise<CaseFileLite[]>;
  downloadStorageFile(storagePath: string): Promise<Uint8Array>;
  insertRun(r: {
    roundId: string;
    stage: RunStage;
    startedBy: string;
    instruction: string | null;
  }): Promise<{ runId: string }>;
  updateRun(
    runId: string,
    patch: Partial<
      Pick<RunRow, "status" | "agent_session_id" | "error" | "input_tokens" | "output_tokens" | "cost_usd" | "finished_at">
    >,
    opts?: { onlyIfStatus?: RunRow["status"][] },
  ): Promise<boolean>;
  getRun(runId: string): Promise<RunRow & { round: { id: string; kind: Enums<"round_kind">; case_id: string } }>;
  openCheckpoint(runId: string): Promise<Tables<"checkpoints"> | null>;
  insertCheckpoint(c: { runId: string; kind: Enums<"checkpoint_type">; payload: unknown }): Promise<void>;
  respondCheckpoint(checkpointId: string, response: unknown, userId: string): Promise<Tables<"checkpoints">>;
  nextFileVersion(caseId: string, kind: FileKind, filename: string): Promise<number>;
  saveArtifact(a: {
    caseId: string;
    kind: FileKind;
    filename: string;
    version: number;
    content: Uint8Array;
    runId: string;
  }): Promise<void>;
  /** 최신 검증보고 내용 (없으면 null) — verifyHasFail 계산용 */
  latestArtifactText(caseId: string, kind: FileKind): Promise<string | null>;
  updateCaseStatus(caseId: string, status: string): Promise<void>;
  getSettings(): Promise<{ run_cost_cap_usd: number }>;
}

const BUCKET = "case-files";

export function createSupabaseRunStore(db: SupabaseClient<Database>): RunStore {
  return {
    async ensureRound(caseId) {
      const { data } = await db
        .from("rounds")
        .select("id, kind, seq")
        .eq("case_id", caseId)
        .order("seq", { ascending: false })
        .limit(1);
      if (data && data.length > 0) return { roundId: data[0].id, kind: data[0].kind };
      const { data: created, error } = await db
        .from("rounds")
        .insert({ case_id: caseId, kind: "소장", seq: 1 })
        .select("id, kind")
        .single();
      if (error || !created) throw new Error(`라운드 생성 실패: ${error?.message}`);
      return { roundId: created.id, kind: created.kind };
    },

    async getCaseAuthorMode(caseId) {
      const { data, error } = await db
        .from("cases")
        .select("author_mode")
        .eq("id", caseId)
        .single();
      if (error || !data) return "lawyer" as Enums<"author_mode">;
      return data.author_mode;
    },

    async getPipelineInput(roundId) {
      const [runs, reviews] = await Promise.all([
        db.from("runs").select("id, stage, status, started_at, finished_at").eq("round_id", roundId),
        db.from("reviews").select("stage, decision, created_at").eq("round_id", roundId),
      ]);
      return { runs: runs.data ?? [], reviews: reviews.data ?? [] };
    },

    async listCaseFiles(caseId) {
      const { data } = await db
        .from("case_files")
        .select("kind, filename, storage_path, version, created_at")
        .eq("case_id", caseId);
      return data ?? [];
    },

    async downloadStorageFile(storagePath) {
      const { data, error } = await db.storage.from(BUCKET).download(storagePath);
      if (error || !data) throw new Error(`Storage 다운로드 실패 ${storagePath}: ${error?.message}`);
      return new Uint8Array(await data.arrayBuffer());
    },

    async insertRun(r) {
      const { data, error } = await db
        .from("runs")
        .insert({ round_id: r.roundId, stage: r.stage, started_by: r.startedBy, instruction: r.instruction })
        .select("id")
        .single();
      if (error || !data) throw new Error(`run 생성 실패: ${error?.message}`);
      return { runId: data.id };
    },

    async updateRun(runId, patch, opts) {
      let q = db.from("runs").update(patch).eq("id", runId);
      if (opts?.onlyIfStatus) q = q.in("status", opts.onlyIfStatus);
      const { data, error } = await q.select("id");
      if (error) throw new Error(`run 갱신 실패: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async getRun(runId) {
      const { data, error } = await db
        .from("runs")
        .select("*, round:rounds(id, kind, case_id)")
        .eq("id", runId)
        .single();
      if (error || !data) throw new Error(`run 조회 실패: ${error?.message}`);
      return data as never;
    },

    async openCheckpoint(runId) {
      const { data } = await db
        .from("checkpoints")
        .select("*")
        .eq("run_id", runId)
        .eq("status", "대기")
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },

    async insertCheckpoint(c) {
      const { error } = await db
        .from("checkpoints")
        .insert({ run_id: c.runId, kind: c.kind, payload: c.payload as never });
      if (error) throw new Error(`체크포인트 생성 실패: ${error.message}`);
    },

    async respondCheckpoint(checkpointId, response, userId) {
      const { data, error } = await db
        .from("checkpoints")
        .update({
          status: "응답됨",
          response: response as never,
          responded_at: new Date().toISOString(),
          responded_by: userId,
        })
        .eq("id", checkpointId)
        .eq("status", "대기")
        .select("*")
        .single();
      if (error || !data) throw new Error(`체크포인트 응답 실패(이미 응답되었을 수 있음): ${error?.message}`);
      return data;
    },

    async nextFileVersion(caseId, kind, filename) {
      const { data } = await db
        .from("case_files")
        .select("version")
        .eq("case_id", caseId)
        .eq("kind", kind)
        .eq("filename", filename)
        .order("version", { ascending: false })
        .limit(1);
      return (data?.[0]?.version ?? 0) + 1;
    },

    async saveArtifact(a) {
      const storagePath = artifactStorageKey(a.caseId, a.version, a.filename);
      const up = await db.storage.from(BUCKET).upload(storagePath, a.content, { upsert: false });
      if (up.error) throw new Error(`산출물 업로드 실패 ${storagePath}: ${up.error.message}`);
      const { error } = await db.from("case_files").insert({
        case_id: a.caseId,
        kind: a.kind,
        filename: a.filename,
        storage_path: storagePath,
        version: a.version,
        created_by_run: a.runId,
      });
      if (error) throw new Error(`case_files 기록 실패: ${error.message}`);
    },

    async latestArtifactText(caseId, kind) {
      const { data } = await db
        .from("case_files")
        .select("storage_path, version")
        .eq("case_id", caseId)
        .eq("kind", kind)
        .order("version", { ascending: false })
        .limit(1);
      if (!data || data.length === 0) return null;
      const file = await db.storage.from(BUCKET).download(data[0].storage_path);
      if (file.error || !file.data) return null;
      return await file.data.text();
    },

    async updateCaseStatus(caseId, status) {
      await db.from("cases").update({ status }).eq("id", caseId);
    },

    async getSettings() {
      const { data } = await db.from("app_settings").select("run_cost_cap_usd").eq("id", 1).single();
      return { run_cost_cap_usd: Number(data?.run_cost_cap_usd ?? 5) };
    },
  };
}
