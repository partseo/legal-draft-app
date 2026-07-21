"use server";

import { revalidatePath } from "next/cache";
import { createRouteClient, createServiceClient } from "@/lib/db/clients";

export type InviteState = { error?: string; ok?: string };

export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const supabase = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { error: "초대는 관리자만 가능합니다." };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "이메일을 입력하세요." };

  const service = createServiceClient();
  const { error } = await service.auth.admin.inviteUserByEmail(email);
  if (error) return { error: `초대 실패: ${error.message}` };

  revalidatePath("/settings");
  return { ok: `${email}로 초대 메일을 보냈습니다.` };
}
