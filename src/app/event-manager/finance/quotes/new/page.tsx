import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { QuoteForm } from "./QuoteForm";

export const metadata = { title: "New Quote" };

export default async function NewQuotePage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("name", { ascending: true });

  return <QuoteForm suppliers={data ?? []} />;
}
