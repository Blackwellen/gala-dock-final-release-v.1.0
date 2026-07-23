import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { TimesheetForm } from "./TimesheetForm";

export const metadata = { title: "Finance — Wages & Hours — New Timesheet" };

export default async function NewTimesheetPage() {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const [{ data: events }, { data: assignments }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true }),
    supabase
      .from("event_staff_assignments")
      .select("id, event_id, staff_name, role")
      .eq("workspace_id", workspaceId)
      .order("staff_name", { ascending: true }),
  ]);

  return <TimesheetForm events={events ?? []} assignments={assignments ?? []} />;
}
