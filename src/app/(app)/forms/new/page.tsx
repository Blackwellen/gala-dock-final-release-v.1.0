import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { FormBuilder, type EventOption } from "../FormBuilder";

export const dynamic = "force-dynamic";

export default async function NewFormPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const options: EventOption[] = (events ?? []).map((e) => ({ id: e.id, name: e.name }));

  return <FormBuilder events={options} />;
}
