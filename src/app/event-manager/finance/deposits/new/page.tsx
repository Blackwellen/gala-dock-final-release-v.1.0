import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { DepositForm } from "./DepositForm";

export const metadata = { title: "New Deposit" };

export default async function NewDepositPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: eventsData }, { data: clientsData }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("clients")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const events = (eventsData ?? []) as { id: string; name: string }[];
  const clients = (clientsData ?? []) as { id: string; name: string }[];

  return <DepositForm events={events} clients={clients} />;
}
