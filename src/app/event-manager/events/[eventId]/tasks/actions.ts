"use server";

import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const TASK_EDITABLE = new Set(["title", "status", "priority", "due_at", "description"]);

export async function updateTaskField(
  eventId: string,
  taskId: string,
  field: string,
  value: string
): Promise<{ error?: string }> {
  if (!TASK_EDITABLE.has(field)) return { error: "Field not editable" };

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Verify task belongs to this event + workspace
  const { data: existing } = await supabase
    .from("event_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!existing) return { error: "Task not found or no permission" };

  const parsedValue: string | null = value === "" ? null : value;

  const { error } = await supabase
    .from("event_tasks")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ [field]: parsedValue, updated_at: new Date().toISOString() } as any)
    .eq("id", taskId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath(`/event-manager/events/${eventId}/tasks`);
  return {};
}
