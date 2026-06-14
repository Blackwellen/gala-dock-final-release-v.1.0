import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/supabase/types";
import { TaskDetailClient, type TaskDetail, type TaskComment, type TaskAssignee } from "./TaskDetailClient";

export const metadata = { title: "Task" };

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: taskRow } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!taskRow) notFound();
  const task = taskRow as Task;

  // Linked event / supplier names.
  let eventName: string | null = null;
  if (task.event_id) {
    const { data: ev } = await supabase
      .from("events")
      .select("name")
      .eq("id", task.event_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    eventName = ev?.name ?? null;
  }

  let supplierName: string | null = null;
  if (task.supplier_id) {
    const { data: s } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", task.supplier_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    supplierName = s?.name ?? null;
  }

  // Assignees + profile names.
  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", task.id);

  // Creator profile.
  const profileIds = Array.from(
    new Set([task.created_by, ...(assigneeRows ?? []).map((a) => a.user_id)].filter(Boolean))
  ) as string[];
  const nameByUser = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", profileIds);
    for (const p of profiles ?? []) nameByUser.set(p.user_id, p.display_name ?? "Unknown");
  }

  const assignees: TaskAssignee[] = (assigneeRows ?? []).map((a) => ({
    userId: a.user_id,
    name: nameByUser.get(a.user_id) ?? "Unknown",
  }));

  // Comments + author names.
  const { data: commentRows } = await supabase
    .from("task_comments")
    .select("id, body_md, author_id, created_at")
    .eq("task_id", task.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const commentAuthorIds = Array.from(new Set((commentRows ?? []).map((c) => c.author_id)));
  const missingAuthorIds = commentAuthorIds.filter((id) => !nameByUser.has(id));
  if (missingAuthorIds.length > 0) {
    const { data: authors } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", missingAuthorIds);
    for (const p of authors ?? []) nameByUser.set(p.user_id, p.display_name ?? "Unknown");
  }

  const comments: TaskComment[] = (commentRows ?? []).map((c) => ({
    id: c.id,
    body: c.body_md,
    author: nameByUser.get(c.author_id) ?? "Unknown",
    createdAt: c.created_at,
  }));

  const detail: TaskDetail = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.due_at,
    createdAt: task.created_at,
    completedAt: task.completed_at,
    createdByName: task.created_by ? nameByUser.get(task.created_by) ?? "Unknown" : "Unknown",
    eventId: task.event_id,
    eventName,
    supplierId: task.supplier_id,
    supplierName,
  };

  return <TaskDetailClient task={detail} assignees={assignees} comments={comments} />;
}
