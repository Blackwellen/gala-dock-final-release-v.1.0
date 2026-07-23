"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus, TaskPriority, Json, TablesUpdate } from "@/lib/supabase/types";

const VALID_PRIORITIES: TaskPriority[] = ["p1", "p2", "p3", "p4"];
const VALID_STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "cancelled",
];

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function coercePriority(raw: FormDataEntryValue | null): TaskPriority {
  const value = String(raw ?? "p3");
  return (VALID_PRIORITIES as string[]).includes(value) ? (value as TaskPriority) : "p3";
}

function coerceStatus(raw: FormDataEntryValue | null): TaskStatus {
  const value = String(raw ?? "todo");
  return (VALID_STATUSES as string[]).includes(value) ? (value as TaskStatus) : "todo";
}

/** Convert an HTML date input (YYYY-MM-DD) into an ISO timestamp, or null. */
function dueAt(value: FormDataEntryValue | null): string | null {
  const v = str(value);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Resolve (or create) the default workspace-level task list. `tasks.list_id`
 * is NOT NULL, so every task must belong to a list.
 */
async function resolveDefaultListId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("task_lists")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("kind", "workspace")
    .is("archived_at", null)
    .order("sort", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("task_lists")
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      kind: "workspace",
      name: "General",
    })
    .select("id")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Failed to create task list");
  return created.id;
}

/** Create a new task scoped to the active workspace, then redirect to its detail page. */
export async function createTask(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  if (!title) throw new Error("Task title is required");

  const listId =
    str(formData.get("list_id")) ?? (await resolveDefaultListId(supabase, workspaceId, user.id));

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      list_id: listId,
      title,
      description: str(formData.get("description")),
      status: coerceStatus(formData.get("status")),
      priority: coercePriority(formData.get("priority")),
      due_at: dueAt(formData.get("due_date")),
      event_id: str(formData.get("event_id")),
      supplier_id: str(formData.get("supplier_id")),
      category: str(formData.get("category")),
    })
    .select("id")
    .single();

  if (error || !task) throw new Error(error?.message ?? "Failed to create task");

  // Optional assignee.
  const assigneeId = str(formData.get("assignee_id"));
  if (assigneeId) {
    await supabase.from("task_assignees").insert({
      task_id: task.id,
      user_id: assigneeId,
      assigned_by: user.id,
    });
  }

  revalidatePath("/event-manager/tasks");
  redirect(`/event-manager/tasks/${task.id}`);
}

/** Mark a task complete: status='done' + completed_at + completed_by. */
export async function completeTask(taskId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", taskId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/tasks");
  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Reopen a completed task back to in-progress. */
export async function reopenTask(taskId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({ status: "in_progress", completed_at: null, completed_by: null })
    .eq("id", taskId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/tasks");
  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Log a task_activity row. Best-effort — never throws into the caller's flow. */
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  taskId: string,
  actorId: string,
  action: string,
  meta: Record<string, Json> = {}
) {
  await supabase.from("task_activity").insert({
    workspace_id: workspaceId,
    task_id: taskId,
    actor_id: actorId,
    action,
    meta: meta as Json,
  });
}

/**
 * Update a task's status (drag-and-drop between Kanban columns, or the
 * detail page's status control). Writes status history + activity so
 * resolution-rate / overdue-escalation insights and the activity feed stay
 * accurate. Re-validates workspace ownership server-side on every call.
 */
export async function updateTaskStatus(taskId: string, nextStatus: TaskStatus) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("id, status, due_at")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!task) throw new Error("Task not found");

  const wasOverdue = !!task.due_at && new Date(task.due_at).getTime() < Date.now();
  const patch: TablesUpdate<"tasks"> = { status: nextStatus };
  if (nextStatus === "done") {
    patch.completed_at = new Date().toISOString();
    patch.completed_by = user.id;
  } else if (task.status === "done") {
    patch.completed_at = null;
    patch.completed_by = null;
  }

  const { error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  await supabase.from("task_status_history").insert({
    workspace_id: workspaceId,
    task_id: taskId,
    from_status: task.status,
    to_status: nextStatus,
    was_overdue: wasOverdue,
    changed_by: user.id,
  });
  await logActivity(supabase, workspaceId, taskId, user.id, "status_changed", {
    from: task.status,
    to: nextStatus,
  });

  revalidatePath("/event-manager/tasks");
  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Reschedule a task's due date, preserving the original due date + reschedule count. */
export async function rescheduleTask(taskId: string, newDueDate: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("id, due_at, original_due_at, reschedule_count")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!task) throw new Error("Task not found");

  const nextDueAt = dueAt(newDueDate) ?? new Date(newDueDate).toISOString();

  const { error } = await supabase
    .from("tasks")
    .update({
      due_at: nextDueAt,
      original_due_at: task.original_due_at ?? task.due_at,
      reschedule_count: (task.reschedule_count ?? 0) + 1,
    })
    .eq("id", taskId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, workspaceId, taskId, user.id, "rescheduled", {
    from: task.due_at,
    to: nextDueAt,
  });

  revalidatePath("/event-manager/tasks");
  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Assign a task to a workspace member (adds, doesn't replace existing assignees). */
export async function assignTask(taskId: string, userId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!task) throw new Error("Task not found");

  const { error } = await supabase
    .from("task_assignees")
    .insert({ task_id: taskId, user_id: userId, assigned_by: user.id });
  if (error && error.code !== "23505") throw new Error(error.message);

  await logActivity(supabase, workspaceId, taskId, user.id, "assignee_added", { userId });

  revalidatePath("/event-manager/tasks");
  revalidatePath(`/event-manager/tasks/${taskId}`);
}

export async function removeTaskAssignee(taskId: string, userId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("user_id", userId);
  await logActivity(supabase, workspaceId, taskId, user.id, "assignee_removed", { userId });

  revalidatePath("/event-manager/tasks");
  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Add a checklist item to a task. */
export async function addChecklistItem(taskId: string, title: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const clean = title.trim();
  if (!clean) return;

  const { count } = await supabase
    .from("task_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId);

  const { error } = await supabase.from("task_checklist_items").insert({
    workspace_id: workspaceId,
    task_id: taskId,
    title: clean,
    sort: count ?? 0,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Toggle a checklist item's completion state. */
export async function toggleChecklistItem(itemId: string, taskId: string, isDone: boolean) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("task_checklist_items")
    .update({ is_done: isDone, completed_at: isDone ? new Date().toISOString() : null })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Add a "depends on" (blocks) relationship between two tasks. */
export async function addTaskDependency(taskId: string, dependsOnTaskId: string) {
  const { user } = await requireWorkspace();
  const supabase = await createClient();
  if (taskId === dependsOnTaskId) throw new Error("A task cannot depend on itself");

  const { error } = await supabase.from("task_dependencies").insert({
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId,
    kind: "blocks",
    created_by: user.id,
  });
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath(`/event-manager/tasks/${taskId}`);
}

export async function removeTaskDependency(taskId: string, dependsOnTaskId: string) {
  await requireWorkspace();
  const supabase = await createClient();

  await supabase
    .from("task_dependencies")
    .delete()
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);

  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/**
 * Apply a task template to a target event and/or supplier: creates real
 * `tasks` rows from the template's items, due-dated relative to the target
 * event's start date (or now() if no event given), and records usage.
 */
export async function applyTaskTemplate(
  templateId: string,
  opts: { eventId?: string | null; supplierId?: string | null; startDate?: string | null }
) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("task_templates")
    .select("id, name")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!template) throw new Error("Template not found");

  const { data: items } = await supabase
    .from("task_template_items")
    .select("id, title, description, priority, offset_days, category, list_name")
    .eq("template_id", templateId)
    .order("offset_days", { ascending: true });

  if (!items || items.length === 0) {
    throw new Error("This template has no tasks to apply");
  }

  let anchor: Date;
  if (opts.startDate) {
    anchor = new Date(opts.startDate);
  } else if (opts.eventId) {
    const { data: ev } = await supabase
      .from("events")
      .select("start_at")
      .eq("id", opts.eventId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    anchor = ev?.start_at ? new Date(ev.start_at) : new Date();
  } else {
    anchor = new Date();
  }

  const listId = await resolveDefaultListId(supabase, workspaceId, user.id);

  const rows = items.map((it) => ({
    workspace_id: workspaceId,
    list_id: listId,
    created_by: user.id,
    title: it.title,
    description: it.description,
    priority: it.priority,
    status: "todo" as TaskStatus,
    due_at: new Date(anchor.getTime() + it.offset_days * 24 * 60 * 60 * 1000).toISOString(),
    event_id: opts.eventId ?? null,
    supplier_id: opts.supplierId ?? null,
    category: it.category,
    template_id: templateId,
    source: "template" as const,
  }));

  const { data: created, error } = await supabase.from("tasks").insert(rows).select("id");
  if (error) throw new Error(error.message);

  await supabase.from("task_template_usage").insert({
    workspace_id: workspaceId,
    template_id: templateId,
    action: "applied",
    applied_to_event_id: opts.eventId ?? null,
    applied_to_supplier_id: opts.supplierId ?? null,
    tasks_created: created?.length ?? 0,
    actor_id: user.id,
  });

  revalidatePath("/event-manager/tasks");
}

/** Duplicate a task template (and its items) into an editable draft copy. */
export async function duplicateTaskTemplate(templateId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("task_templates")
    .select("*")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!template) throw new Error("Template not found");

  const { data: items } = await supabase
    .from("task_template_items")
    .select("title, description, list_name, priority, offset_days, category")
    .eq("template_id", templateId);

  const { data: copy, error } = await supabase
    .from("task_templates")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name: `${template.name} (Copy)`,
      description: template.description,
      category: template.category,
      use_case: template.use_case,
      icon: template.icon,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !copy) throw new Error(error?.message ?? "Failed to duplicate template");

  if (items && items.length > 0) {
    await supabase.from("task_template_items").insert(
      items.map((it) => ({ ...it, template_id: copy.id }))
    );
  }

  await supabase.from("task_template_usage").insert({
    workspace_id: workspaceId,
    template_id: templateId,
    action: "duplicated",
    tasks_created: 0,
    actor_id: user.id,
  });

  revalidatePath("/event-manager/tasks");
}

/** Create a new task template (starts empty; items are added via addTemplateItem). */
export async function createTaskTemplate(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Template name is required");

  const { data: template, error } = await supabase
    .from("task_templates")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      updated_by: user.id,
      name,
      description: str(formData.get("description")),
      category: str(formData.get("category")),
      use_case: str(formData.get("use_case")),
    })
    .select("id")
    .single();

  if (error || !template) throw new Error(error?.message ?? "Failed to create template");

  revalidatePath("/event-manager/tasks");
  redirect(`/event-manager/tasks/templates/${template.id}/edit`);
}

/** Update a task template's metadata. */
export async function updateTaskTemplate(templateId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Template name is required");

  const { error } = await supabase
    .from("task_templates")
    .update({
      name,
      description: str(formData.get("description")),
      category: str(formData.get("category")),
      use_case: str(formData.get("use_case")),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  await supabase.from("task_template_usage").insert({
    workspace_id: workspaceId,
    template_id: templateId,
    action: "edited",
    tasks_created: 0,
    actor_id: user.id,
  });

  revalidatePath("/event-manager/tasks");
  revalidatePath(`/event-manager/tasks/templates/${templateId}/edit`);
}

/** Add an item (task) to a template. */
export async function addTemplateItem(templateId: string, formData: FormData) {
  await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  if (!title) return;

  const { error } = await supabase.from("task_template_items").insert({
    template_id: templateId,
    title,
    description: str(formData.get("description")),
    list_name: str(formData.get("list_name")) ?? "General",
    priority: coercePriority(formData.get("priority")),
    offset_days: Number(formData.get("offset_days") ?? 0) || 0,
    category: str(formData.get("category")),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/tasks/templates/${templateId}/edit`);
}

export async function removeTemplateItem(templateId: string, itemId: string) {
  await requireWorkspace();
  const supabase = await createClient();
  await supabase.from("task_template_items").delete().eq("id", itemId).eq("template_id", templateId);
  revalidatePath(`/event-manager/tasks/templates/${templateId}/edit`);
}

/** Archive (soft-disable) a task template. */
export async function archiveTaskTemplate(templateId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("task_templates")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/tasks");
}

/** Request a presigned R2 upload URL for a task attachment. Server-only key generation. */
export async function getTaskAttachmentUploadUrl(
  taskId: string,
  filename: string,
  contentType: string
) {
  const { workspaceId } = await requireWorkspace();
  const { r2Configured, r2Key, r2PresignedPut } = await import("@/lib/storage/r2");

  if (!r2Configured()) {
    return { configured: false as const };
  }

  const key = r2Key({ workspaceId, kind: "tasks", recordId: taskId, filename });
  const { uploadUrl, objectKey, publicUrl } = await r2PresignedPut({ key, contentType });
  return { configured: true as const, uploadUrl, objectKey, publicUrl };
}

/** Record a task attachment after a successful direct-to-R2 upload. */
export async function attachTaskFile(
  taskId: string,
  file: { objectKey: string; originalFileName: string; mimeType: string; sizeBytes: number }
) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase.from("task_attachments").insert({
    workspace_id: workspaceId,
    task_id: taskId,
    storage_path: file.objectKey,
    mime: file.mimeType,
    size_bytes: file.sizeBytes,
    uploaded_by: user.id,
  });
  if (error) throw new Error(error.message);

  await logActivity(supabase, workspaceId, taskId, user.id, "attachment_uploaded", {
    fileName: file.originalFileName,
  });

  revalidatePath(`/event-manager/tasks/${taskId}`);
}

/** Post a comment on a task. */
export async function addTaskComment(taskId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  // Confirm the task belongs to the active workspace before commenting.
  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!task) throw new Error("Task not found");

  const body = str(formData.get("body_md"));
  if (!body) return;

  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId,
    author_id: user.id,
    body_md: body,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/tasks/${taskId}`);
}
