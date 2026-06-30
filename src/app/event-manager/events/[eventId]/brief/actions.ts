"use server";

import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const EDITABLE_FIELDS = new Set([
  "name",
  "event_type",
  "event_format",
  "description",
  "brief_notes",
  "objectives",
  "client_name",
  "client_email",
  "client_phone",
  "venue_name_snapshot",
  "venue_address_snapshot",
  "start_at",
  "end_at",
  "guest_count_day",
  "capacity_online",
  "budget_cents",
]);

const NUMERIC_FIELDS = new Set(["guest_count_day", "capacity_online", "budget_cents"]);

export async function updateEventField(
  eventId: string,
  field: string,
  value: string
): Promise<{ error?: string }> {
  if (!EDITABLE_FIELDS.has(field)) {
    return { error: "Field not editable" };
  }

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Verify ownership server-side — never trust client-side eventId alone
  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return { error: "Event not found or no permission" };

  let parsedValue: string | number | null = value === "" ? null : value;

  if (NUMERIC_FIELDS.has(field)) {
    if (value === "") {
      parsedValue = null;
    } else {
      const n = Number(value.replace(/[^0-9]/g, ""));
      if (isNaN(n)) return { error: "Please enter a valid number" };
      parsedValue = n;
    }
  }

  const { error } = await supabase
    .from("events")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ [field]: parsedValue, updated_at: new Date().toISOString() } as any)
    .eq("id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath(`/event-manager/events/${eventId}/brief`);
  revalidatePath(`/event-manager/events/${eventId}`);
  return {};
}
