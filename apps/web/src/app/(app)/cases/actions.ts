"use server";

import { redirect } from "next/navigation";
import { createRouteClient } from "@/lib/db/clients";

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
    .insert({ title, assignee: assignee || null, created_by: user.id })
    .select("id")
    .single();
  if (caseErr || !caseRow) return { error: `사건 생성 실패: ${caseErr?.message}` };

  const uploads: { name: string; body: Blob | string; contentType: string }[] = [];
  if (pasted) uploads.push({ name: "붙여넣기_메모.md", body: pasted, contentType: "text/markdown" });
  for (const f of files) uploads.push({ name: f.name, body: f, contentType: f.type || "application/octet-stream" });

  for (const u of uploads) {
    const path = `${caseRow.id}/입력/${u.name}`;
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
