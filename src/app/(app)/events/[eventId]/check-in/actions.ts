"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for staff-facing guest check-in management.
 *
 * Schema notes (verified against database.types.ts):
 *  - `event_guests.check_in_token` (text, unique) and `checked_in_at` (timestamptz)
 *    already exist. There is NO `checked_in_by` column on this table, so we do not
 *    write one. Check-in also confirms the RSVP (rsvp_status = 'confirmed').
 */

async function assertEvent(eventId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  return { ok: Boolean(event), workspaceId, supabase };
}

/** Generate check-in tokens for every guest on this event that lacks one. */
export async function generateTokens(eventId: string) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const { data: guests } = await supabase
    .from("event_guests")
    .select("id, check_in_token")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .is("check_in_token", null);

  for (const g of guests ?? []) {
    const { error } = await supabase
      .from("event_guests")
      .update({ check_in_token: randomUUID() })
      .eq("id", g.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/events/${eventId}/check-in`);
}

/** Manually check a guest in (sets checked_in_at + confirms RSVP). */
export async function checkInGuest(eventId: string, guestId: string) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const { error } = await supabase
    .from("event_guests")
    .update({
      checked_in_at: new Date().toISOString(),
      rsvp_status: "confirmed",
    })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/check-in`);
}

/** Undo a check-in (clears checked_in_at; leaves RSVP unchanged). */
export async function undoCheckIn(eventId: string, guestId: string) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const { error } = await supabase
    .from("event_guests")
    .update({ checked_in_at: null })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/check-in`);
}
