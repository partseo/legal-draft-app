"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createRouteClient, createServiceClient } from "@/lib/db/clients";
import { inputStorageKey } from "@/lib/storage-key";
import { getDocumentType, DEFAULT_ROUND_KIND, isValidAuthorMode, DEFAULT_AUTHOR_MODE } from "@/lib/agent/document-types";
import type { Enums } from "@/lib/db/database.types";

const ALLOWED_EXT = [".md", ".txt", ".pdf"];

export type CreateCaseState = { error?: string };

export async function createCase(
  _prev: CreateCaseState,
  formData: FormData,
): Promise<CreateCaseState> {
  const supabase = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "");
  const rawKind = formData.get("roundKind");
  const kindStr = rawKind == null || String(rawKind).trim() === "" ? DEFAULT_ROUND_KIND : String(rawKind).trim();
  if (!getDocumentType(kindStr)) {
    return { error: `알 수 없는 문서 유형입니다: ${kindStr}` };
  }
  const roundKind = kindStr as Enums<"round_kind">;

  const rawAuthor = formData.get("authorMode");
  const authorStr = rawAuthor == null || String(rawAuthor).trim() === "" ? DEFAULT_AUTHOR_MODE : String(rawAuthor).trim();
  if (!isValidAuthorMode(authorStr)) {
    return { error: `허용되지 않는 작성자 유형입니다: ${authorStr}` };
  }
  const authorMode = authorStr as Enums<"author_mode">;

  const pasted = String(formData.get("pasted") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!title) return { error: "사건명을 입력하세요." };
  if (!pasted && files.length === 0) return { error: "입력 자료(텍스트 또는 파일)를 하나 이상 넣어주세요." };
  for (const f of files) {
    if (!ALLOWED_EXT.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      return { error: `허용되지 않는 형식: ${f.name} (.md .txt .pdf만 가능)` };
    }
  }

  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .insert({ title, assignee: assignee || null, created_by: user.id, author_mode: authorMode })
    .select("id")
    .single();
  if (caseErr || !caseRow) return { error: `사건 생성 실패: ${caseErr?.message}` };

  const { error: roundErr } = await supabase
    .from("rounds")
    .insert({ case_id: caseRow.id, kind: roundKind, seq: 1 });
  if (roundErr) {
    await supabase.from("cases").delete().eq("id", caseRow.id);
    return { error: `라운드 생성 실패: ${roundErr.message}` };
  }

  const uploads: { name: string; body: Blob | string; contentType: string }[] = [];
  if (pasted) uploads.push({ name: "붙여넣기_메모.md", body: pasted, contentType: "text/markdown" });
  for (const f of files) uploads.push({ name: f.name, body: f, contentType: f.type || "application/octet-stream" });

  for (const u of uploads) {
    const path = inputStorageKey(caseRow.id, u.name);
    const { error: upErr } = await supabase.storage.from("case-files").upload(path, u.body, {
      contentType: u.contentType,
      upsert: false,
    });
    if (upErr) return { error: `파일 업로드 실패(${u.name}): ${upErr.message}` };
    const { error: metaErr } = await supabase.from("case_files").insert({
      case_id: caseRow.id,
      kind: "입력",
      filename: u.name,
      storage_path: path,
      uploaded_by: user.id,
    });
    if (metaErr) return { error: `파일 기록 실패(${u.name}): ${metaErr.message}` };
  }

  redirect(`/cases/${caseRow.id}`);
}

export type DeleteCaseResult = { ok: true } | { error: string };

/** 사건 완전 삭제 — DB는 cascade, 스토리지 파일은 service-role로 별도 제거. */
export async function deleteCase(caseId: string): Promise<DeleteCaseResult> {
  if (!caseId) return { error: "사건 ID가 없습니다." };

  const supabase = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // case_files는 cascade로 사라지므로, 스토리지 경로는 행 삭제 전에 확보한다.
  const { data: files, error: filesErr } = await supabase
    .from("case_files")
    .select("storage_path")
    .eq("case_id", caseId);
  if (filesErr) return { error: `파일 목록 조회 실패: ${filesErr.message}` };

  const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean);
  if (paths.length > 0) {
    // case-files 버킷엔 delete RLS 정책이 없으므로 service-role로 제거한다.
    const service = createServiceClient();
    const { error: rmErr } = await service.storage.from("case-files").remove(paths);
    if (rmErr) return { error: `파일 삭제 실패: ${rmErr.message}` };
  }

  const { error: delErr } = await supabase.from("cases").delete().eq("id", caseId);
  if (delErr) return { error: `사건 삭제 실패: ${delErr.message}` };

  revalidatePath("/");
  return { ok: true };
}
