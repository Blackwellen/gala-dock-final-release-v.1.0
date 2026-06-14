import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { NewTaskForm, type SelectOption } from "./NewTaskForm";

export const metadata = { title: "New Task" };

export default async function NewTaskPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: events }, { data: suppliers }, { data: members }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, start_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true })
      .limit(200),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
  ]);

  const eventOptions: SelectOption[] = (events ?? []).map((e) => ({
    value: e.id,
    label: e.start_at
      ? `${e.name} — ${new Date(e.start_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
      : e.name,
  }));

  const supplierOptions: SelectOption[] = (suppliers ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  // Member display names.
  const memberIds = (members ?? []).map((m) => m.user_id);
  let assigneeOptions: SelectOption[] = [];
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    const nameByUser = new Map<string, string>();
    for (const p of profiles ?? []) nameByUser.set(p.user_id, p.display_name ?? "Unknown");
    assigneeOptions = memberIds.map((id) => ({ value: id, label: nameByUser.get(id) ?? "Unknown" }));
  }

  return (
    <NewTaskForm
      events={eventOptions}
      suppliers={supplierOptions}
      assignees={assigneeOptions}
    />
  );
}
