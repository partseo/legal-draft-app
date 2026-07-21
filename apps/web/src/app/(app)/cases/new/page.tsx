import { createRouteClient } from "@/lib/db/clients";
import { NewCaseForm } from "./new-case-form";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const supabase = await createRouteClient();
  const { data: profiles } = await supabase.from("profiles").select("id, display_name").order("display_name");
  return (
    <div className="flex flex-col items-center p-9">
      <NewCaseForm members={profiles ?? []} />
    </div>
  );
}
