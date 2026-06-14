import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { NewRfqForm, type SupplierOption, type EventOption } from "./NewRfqForm";

export const dynamic = "force-dynamic";

export default async function NewRfqPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: suppliers }, { data: events }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, status, category:supplier_categories ( name )")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("events")
      .select("id, name, start_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(100),
  ]);

  const supplierOptions: SupplierOption[] = (suppliers ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    category: (s.category as { name: string } | null)?.name ?? null,
  }));

  const eventOptions: EventOption[] = (events ?? []).map((e) => ({
    id: e.id,
    name: e.name,
  }));

  return <NewRfqForm suppliers={supplierOptions} events={eventOptions} />;
}
