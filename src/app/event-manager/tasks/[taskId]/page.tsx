import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/supabase/types";
import { categoryLabel, isOverdue } from "../task-utils";
import {
  TaskDetailClient, type TaskDetail, type TaskComment, type TaskAssignee,
  type TaskChecklistRow, type TaskAttachmentRow, type TaskDependencyRow,
} from "./TaskDetailClient";

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

  // Checklist items.
  const { data: checklistRows } = await supabase
    .from("task_checklist_items")
    .select("id, title, is_done, sort")
    .eq("task_id", task.id)
    .order("sort", { ascending: true });
  const checklist: TaskChecklistRow[] = (checklistRows ?? []).map((c) => ({
    id: c.id, title: c.title, isDone: c.is_done,
  }));

  // Attachments. `storage_path` is the R2 object key, which embeds the
  // original filename via r2Key()'s `{timestamp}-{safe_filename}` suffix.
  const { data: attachmentRows } = await supabase
    .from("task_attachments")
    .select("id, storage_path, size_bytes, mime, created_at")
    .eq("task_id", task.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const attachments: TaskAttachmentRow[] = (attachmentRows ?? []).map((a) => {
    const lastSegment = a.storage_path.split("/").pop() ?? a.storage_path;
    const fileName = lastSegment.replace(/^\d+-/, "");
    return { id: a.id, fileName, sizeBytes: a.size_bytes, mimeType: a.mime, createdAt: a.created_at };
  });

  // Dependencies ("depends on" other tasks).
  const { data: depRows } = await supabase
    .from("task_dependencies")
    .select("depends_on_task_id")
    .eq("task_id", task.id);
  const depIds = (depRows ?? []).map((d) => d.depends_on_task_id);
  let dependencies: TaskDependencyRow[] = [];
  if (depIds.length > 0) {
    const { data: depTasks } = await supabase
      .from("tasks")
      .select("id, title, status")
      .in("id", depIds);
    dependencies = (depTasks ?? []).map((d) => ({ id: d.id, title: d.title, status: d.status }));
  }

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
    category: task.category ? categoryLabel(task.category) : null,
    phase: task.phase,
    nextAction: task.next_action,
    overdue: isOverdue(task),
  };

  return (
    <TaskDetailClient
      task={detail}
      assignees={assignees}
      comments={comments}
      checklist={checklist}
      attachments={attachments}
      dependencies={dependencies}
    />
  );
}
