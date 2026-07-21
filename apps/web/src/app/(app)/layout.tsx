import { redirect } from "next/navigation";
import { createRouteClient } from "@/lib/db/clients";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  const name = profile?.display_name || user.email?.split("@")[0] || "사용자";
  const role = profile?.role === "admin" ? "관리자" : "멤버";

  return (
    <div className="flex min-h-screen bg-app-page">
      <AppSidebar userName={name} userRole={role} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
