// 초기 관리자 계정 생성 (1회용): node --env-file=.env.local scripts/create-admin.mjs <email> <password> <이름>
import { createClient } from "@supabase/supabase-js";

const [email, password, displayName] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node --env-file=.env.local scripts/create-admin.mjs <email> <password> [이름]");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: displayName ?? email.split("@")[0] },
});
if (error) {
  console.error("createUser 실패:", error.message);
  process.exit(1);
}
const { error: roleErr } = await supabase.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
if (roleErr) {
  console.error("admin 승격 실패:", roleErr.message);
  process.exit(1);
}
console.log(`관리자 생성 완료: ${email} (${data.user.id})`);
