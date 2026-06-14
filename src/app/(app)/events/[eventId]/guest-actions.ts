"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const GUEST_TYPES = ["day", "evening", "both"] as const;
const RSVP_STATUSES = ["pending", "confirmed", "declined", "maybe"] as const;
type GuestType = (typeof GUEST_TYPES)[number];
type RSVPStatus = (typeof RSVP_STATUSES)[number];

/**
 * Shape accepted from the client for a single guest add/edit.
 * Note: "use server" modules may only export async functions, so these
 * interfaces are intentionally NOT exported. The client component declares
 * a structurally-identical type of its own.
 */
interface GuestInput {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  guest_type: string;
  rsvp_status: string;
  meal_choice: string | null;
  dietary_notes: string | null;
  table_number: string | null;
  seat_number: string | null;
  plus_one_name: string | null;
  notes: string | null;
}

interface GuestActionResult {
  ok: boolean;
  error?: string;
  count?: number;
}

function clean(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function coerceGuestType(raw: string | null | undefined): GuestType {
  const v = String(raw ?? "day").toLowerCase();
  return (GUEST_TYPES as readonly string[]).includes(v) ? (v as GuestType) : "day";
}

function coerceRsvp(raw: string | null | undefined): RSVPStatus {
  const v = String(raw ?? "pending").toLowerCase();
  return (RSVP_STATUSES as readonly string[]).includes(v) ? (v as RSVPStatus) : "pending";
}

/** Normalise an input row into a DB-ready record (without workspace/event ids). */
function normaliseGuest(input: GuestInput) {
  return {
    first_name: (clean(input.first_name) ?? "").slice(0, 200),
    last_name: (clean(input.last_name) ?? "").slice(0, 200),
    email: clean(input.email),
    phone: clean(input.phone),
    guest_type: coerceGuestType(input.guest_type),
    rsvp_status: coerceRsvp(input.rsvp_status),
    meal_choice: clean(input.meal_choice),
    dietary_notes: clean(input.dietary_notes),
    table_number: clean(input.table_number),
    seat_number: clean(input.seat_number),
    plus_one_name: clean(input.plus_one_name),
    notes: clean(input.notes),
  };
}

/** Add a single guest to an event. */
export async function addGuest(
  eventId: string,
  input: GuestInput,
): Promise<GuestActionResult> {
  const record = normaliseGuest(input);
  if (!record.first_name && !record.last_name) {
    return { ok: false, error: "A first or last name is required." };
  }

  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  // Confirm the event belongs to this workspace before inserting.
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) return { ok: false, error: "Event not found." };

  const { error } = await supabase.from("event_guests").insert({
    ...record,
    workspace_id: workspaceId,
    event_id: eventId,
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Update an existing guest row. */
export async function updateGuest(
  eventId: string,
  guestId: string,
  input: GuestInput,
): Promise<GuestActionResult> {
  const record = normaliseGuest(input);
  if (!record.first_name && !record.last_name) {
    return { ok: false, error: "A first or last name is required." };
  }

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_guests")
    .update(record)
    .eq("id", guestId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Remove a guest from an event. */
export async function removeGuest(
  eventId: string,
  guestId: string,
): Promise<GuestActionResult> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_guests")
    .delete()
    .eq("id", guestId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Batch-insert guests from a CSV import. Rows are already parsed client-side. */
export async function importGuests(
  eventId: string,
  rows: GuestInput[],
): Promise<GuestActionResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }

  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  // Confirm the event belongs to this workspace before inserting.
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) return { ok: false, error: "Event not found." };

  const now = new Date().toISOString();
  const records = rows
    .map(normaliseGuest)
    .filter((r) => r.first_name || r.last_name)
    .map((r) => ({
      ...r,
      workspace_id: workspaceId,
      event_id: eventId,
      created_by: user.id,
      imported_at: now,
    }));

  if (records.length === 0) {
    return { ok: false, error: "No valid rows to import." };
  }

  const { error } = await supabase.from("event_guests").insert(records);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { ok: true, count: records.length };
}
