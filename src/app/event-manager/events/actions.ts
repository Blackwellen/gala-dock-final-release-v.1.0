"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { toDbStatus } from "./_lib";

/** Parse a "£ amount" string into integer cents, or 0 when empty/invalid. */
function poundsToCents(value: FormDataEntryValue | null): number {
  if (value == null) return 0;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function intOrZero(value: FormDataEntryValue | null): number {
  if (value == null) return 0;
  const n = Number(String(value).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function text(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/** Convert a yyyy-mm-dd date input into an ISO timestamp, or null. */
function dateToIso(value: FormDataEntryValue | null): string | null {
  const s = text(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Create a new event from the New Event wizard, then redirect to its detail page. */
export async function createEvent(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = text(formData.get("name")) ?? "Untitled Event";

  const { data, error } = await supabase
    .from("events")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name,
      status: "new_enquiry",
      event_type: text(formData.get("event_type")),
      description: text(formData.get("description")),
      client_name: text(formData.get("client_name")),
      client_email: text(formData.get("client_email")),
      client_phone: text(formData.get("client_phone")),
      client_company: text(formData.get("client_company")),
      venue_name_snapshot: text(formData.get("venue_name")),
      location: text(formData.get("location")),
      budget_cents: poundsToCents(formData.get("budget")),
      guest_count_day: intOrZero(formData.get("guest_count_day")),
      guest_count_evening: intOrZero(formData.get("guest_count_evening")),
      pipeline_notes: text(formData.get("pipeline_notes")),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create event");
  }

  revalidatePath("/event-manager/events");
  redirect(`/event-manager/events/${data.id}`);
}

/** Update an existing event from the Edit Event form, then return to its detail page. */
export async function updateEvent(eventId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = text(formData.get("name")) ?? "Untitled Event";

  const { error } = await supabase
    .from("events")
    .update({
      name,
      status: toDbStatus(String(formData.get("status") ?? "new-enquiry")),
      event_type: text(formData.get("event_type")),
      description: text(formData.get("description")),
      start_at: dateToIso(formData.get("start_at")),
      end_at: dateToIso(formData.get("end_at")),
      venue_name_snapshot: text(formData.get("venue_name")),
      location: text(formData.get("location")),
      client_name: text(formData.get("client_name")),
      client_email: text(formData.get("client_email")),
      client_phone: text(formData.get("client_phone")),
      client_company: text(formData.get("client_company")),
      budget_cents: poundsToCents(formData.get("budget")),
      guest_count_day: intOrZero(formData.get("guest_count_day")),
      guest_count_evening: intOrZero(formData.get("guest_count_evening")),
    })
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/event-manager/events/${eventId}`);
  revalidatePath("/event-manager/events");
  redirect(`/event-manager/events/${eventId}`);
}
