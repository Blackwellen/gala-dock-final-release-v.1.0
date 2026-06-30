"use server";

import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const RUN_ITEM_EDITABLE = new Set(["title", "lane", "notes", "starts_at", "section"]);

export async function updateRunSheetItem(
  eventId: string,
  itemId: string,
  field: string,
  value: string
): Promise<{ error?: string }> {
  if (!RUN_ITEM_EDITABLE.has(field)) return { error: "Field not editable" };

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("event_run_sheet_items")
    .select("id")
    .eq("id", itemId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!existing) return { error: "Schedule item not found or no permission" };

  const parsedValue: string | null = value === "" ? null : value;

  const { error } = await supabase
    .from("event_run_sheet_items")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ [field]: parsedValue, updated_at: new Date().toISOString() } as any)
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath(`/event-manager/events/${eventId}/schedule`);
  return {};
}
