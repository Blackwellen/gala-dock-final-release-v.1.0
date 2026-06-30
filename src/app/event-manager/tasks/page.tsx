import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/supabase/types";
import { TasksClient, type TaskRow, type TaskMetrics } from "./TasksClient";
import { isOverdue } from "./task-utils";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: taskRows } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const tasks = (taskRows ?? []) as Task[];

  // Resolve linked event names for display.
  const eventIds = Array.from(new Set(tasks.map((t) => t.event_id).filter(Boolean))) as string[];
  const eventNameById = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", eventIds);
    for (const ev of events ?? []) eventNameById.set(ev.id, ev.name);
  }

  // Resolve supplier names for display.
  const supplierIds = Array.from(new Set(tasks.map((t) => t.supplier_id).filter(Boolean))) as string[];
  const supplierNameById = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", supplierIds);
    for (const s of suppliers ?? []) supplierNameById.set(s.id, s.name);
  }

  // Resolve assignees (task_assignees join + profile display names).
  const taskIds = tasks.map((t) => t.id);
  const assigneesByTask = new Map<string, { userId: string; name: string }[]>();
  const myTaskIds = new Set<string>();
  if (taskIds.length > 0) {
    const { data: assignees } = await supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .in("task_id", taskIds);

    const assigneeUserIds = Array.from(new Set((assignees ?? []).map((a) => a.user_id)));
    const nameByUser = new Map<string, string>();
    if (assigneeUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", assigneeUserIds);
      for (const p of profiles ?? []) nameByUser.set(p.user_id, p.display_name ?? "Unknown");
    }

    for (const a of assignees ?? []) {
      if (a.user_id === user.id) myTaskIds.add(a.task_id);
      const list = assigneesByTask.get(a.task_id) ?? [];
      list.push({ userId: a.user_id, name: nameByUser.get(a.user_id) ?? "Unknown" });
      assigneesByTask.set(a.task_id, list);
    }
  }

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.due_at,
    eventId: t.event_id,
    eventName: t.event_id ? eventNameById.get(t.event_id) ?? null : null,
    supplierId: t.supplier_id,
    supplierName: t.supplier_id ? supplierNameById.get(t.supplier_id) ?? null : null,
    assignees: assigneesByTask.get(t.id) ?? [],
    isMine: myTaskIds.has(t.id),
    overdue: isOverdue(t),
  }));

  // KPI metrics.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const metrics: TaskMetrics = {
    dueToday: tasks.filter(
      (t) =>
        t.due_at &&
        t.status !== "done" &&
        t.status !== "cancelled" &&
        new Date(t.due_at) >= startOfToday &&
        new Date(t.due_at) < endOfToday
    ).length,
    overdue: tasks.filter((t) => isOverdue(t)).length,
    completedThisWeek: tasks.filter(
      (t) => t.status === "done" && t.completed_at && new Date(t.completed_at) >= weekAgo
    ).length,
    supplierPending: tasks.filter(
      (t) => t.supplier_id && t.status !== "done" && t.status !== "cancelled"
    ).length,
  };

  return <TasksClient rows={rows} metrics={metrics} />;
}
