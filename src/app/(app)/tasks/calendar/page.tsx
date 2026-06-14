import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/supabase/types";
import { TaskCalendarClient, type CalendarTask } from "./TaskCalendarClient";

export const metadata = { title: "Task Calendar" };

export default async function TaskCalendarPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: taskRows } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true });

  const tasks = (taskRows ?? []) as Task[];

  const calendarTasks: CalendarTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueAt: t.due_at as string,
    status: t.status,
    priority: t.priority,
  }));

  return <TaskCalendarClient tasks={calendarTasks} />;
}
