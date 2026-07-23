import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { TicketTierForm } from "./TicketTierForm";

export const metadata = { title: "New Ticket Tier" };

export default async function NewTicketTierPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  return <TicketTierForm events={data ?? []} />;
}
