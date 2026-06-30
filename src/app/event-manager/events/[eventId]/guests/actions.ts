"use server";

import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const GUEST_EDITABLE = new Set([
  "first_name", "last_name", "email", "phone",
  "rsvp_status", "guest_type", "dietary_notes", "notes",
]);

export async function updateGuestField(
  eventId: string,
  guestId: string,
  field: string,
  value: string
): Promise<{ error?: string }> {
  if (!GUEST_EDITABLE.has(field)) return { error: "Field not editable" };

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("event_guests")
    .select("id")
    .eq("id", guestId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!existing) return { error: "Guest not found or no permission" };

  const parsedValue: string | null = value === "" ? null : value;

  const { error } = await supabase
    .from("event_guests")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ [field]: parsedValue, updated_at: new Date().toISOString() } as any)
    .eq("id", guestId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath(`/event-manager/events/${eventId}/guests`);
  return {};
}
