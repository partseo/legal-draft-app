// 기존 사용자의 비밀번호 재설정: node --env-file=.env.local scripts/reset-admin-password.mjs <email> <새비밀번호>
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node --env-file=.env.local scripts/reset-admin-password.mjs <email> <새비밀번호>");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 이메일로 사용자 조회 (admin listUsers 페이지네이션)
let user = null;
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers 실패:", error.message);
    process.exit(1);
  }
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`사용자 없음: ${email}`);
  process.exit(1);
}

const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
if (error) {
  console.error("비밀번호 재설정 실패:", error.message);
  process.exit(1);
}
console.log(`비밀번호 재설정 완료: ${email} (${user.id})`);
