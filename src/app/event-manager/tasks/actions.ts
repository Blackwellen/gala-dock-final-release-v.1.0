"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";

const VALID_PRIORITIES: TaskPriority[] = ["p1", "p2", "p3", "p4"];
const VALID_STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
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
