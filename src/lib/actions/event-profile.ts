"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer, type OrganizerCtx } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import { writeAudit } from "@/lib/audit";
import { untyped } from "@/lib/workspace/db";
import { transitionEvent, type EventBlocker } from "@/lib/events/lifecycle";

const Id = z.string().uuid();
async function own(eventId: string): Promise<{ ctx: OrganizerCtx; e: { id: string; status: string; name: string; starts_at: string | null; settings: Record<string, unknown>; visibility: string; slug: string | null } } | { error: string }> {
  const id = Id.safeParse(eventId); if (!id.success) return { error: "Invalid event." };
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("id,status,name,starts_at,settings,visibility,slug").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { error: "Event not found in this workspace." };
  return { ctx, e: { ...e, settings: (e.settings ?? {}) as Record<string, unknown> } };
}
const done = (id: string, message?: string): ActionResult => { revalidatePath(`/organizer/events/${id}`); return { ok: true, message }; };

// ── Status lifecycle ────────────────────────────────────────────────────────
// Allowed transitions, permissions and preconditions (date, venue, tickets, payouts, event-type requirements) are enforced by the
// database command `event_transition` (Q14); the `event` state machine guards every other writer too.
const STATES = ["draft", "planning", "ready", "published", "on_sale", "live", "completed", "closed", "archived", "cancelled", "postponed", "suspended"];
export async function setEventStatus(eventId: string, to: string): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const { ctx, e } = o;
  if (!STATES.includes(to)) return { ok: false, error: "Unknown event status." };
  if (["cancelled", "postponed", "suspended"].includes(to) && !["owner", "manager"].includes(ctx.role)) return { ok: false, error: "Only owners and managers can cancel, postpone or suspend an event." };
  const r = await transitionEvent(ctx.supabase, e.id, to, e.status);
  if (!r.ok) return r;
  return done(e.id, `${e.name} is now ${to.replace("_", " ")}.`);
}
/** Computed blockers for a target state (shown in the UI instead of hidden warnings). */
export async function eventBlockers(eventId: string, to: string): Promise<ActionResult<EventBlocker[]>> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  if (!STATES.includes(to)) return { ok: false, error: "Unknown event status." };
  const { data, error } = await untyped(o.ctx.supabase).rpc("event_lifecycle_blockers", { p_event: o.e.id, p_to: to });
  return error ? { ok: false, error: "Could not check the event." } : { ok: true, data: (data ?? []) as EventBlocker[] };
}

const Basics = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(4000), starts_at: z.string().optional(), ends_at: z.string().optional(), venue_name: z.string().max(120), location: z.string().max(160), capacity: z.coerce.number().int().min(0).max(500000).nullable(), client_name: z.string().max(120), tags: z.string().max(300) });
export async function updateEventBasics(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = Basics.safeParse(input); if (!p.success) return { ok: false, error: "Check the highlighted fields." };
  const toIso = (v?: string) => (v ? new Date(v).toISOString() : null);
  const s = toIso(p.data.starts_at), en = toIso(p.data.ends_at);
  if (s && en && en <= s) return { ok: false, error: "The end time must be after the start time." };
  if (s !== (o.e.starts_at ? new Date(o.e.starts_at).toISOString() : null) && ["published", "on_sale", "live"].includes(o.e.status)) {
    const { count } = await o.ctx.supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", o.e.id).eq("status", "valid");
    if (count) return { ok: false, error: `Changing the date of an on-sale event affects ${count} ticket holders. Postpone the event to reschedule with notifications and refund rights.` };
  }
  const { error } = await o.ctx.supabase.from("events").update({ name: p.data.name, description: p.data.description, starts_at: s, ends_at: en, venue_name: p.data.venue_name, location: p.data.location, capacity: p.data.capacity, client_name: p.data.client_name, tags: p.data.tags.split(",").map(t => t.trim()).filter(Boolean).slice(0, 12), updated_at: new Date().toISOString() }).eq("id", o.e.id);
  return error ? { ok: false, error: "Could not save the event." } : done(o.e.id, "Event updated.");
}
export async function confirmVenueOffPlatform(eventId: string, venueName: string): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  if (!venueName.trim()) return { ok: false, error: "Enter the venue name." };
  const { error } = await o.ctx.supabase.from("events").update({ venue_name: venueName.trim().slice(0, 120), settings: { ...o.e.settings, venue_confirmed: true, venue_confirmed_at: new Date().toISOString(), venue_confirmed_by: o.ctx.user.id } }).eq("id", o.e.id);
  return error ? { ok: false, error: "Could not record the venue." } : done(o.e.id, "Venue recorded as confirmed.");
}
export async function savePublicPageSettings(eventId: string, page: Record<string, boolean>): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const allowed = ["details", "tickets", "map", "faqs", "lineup", "terms"]; const clean = Object.fromEntries(Object.entries(page).filter(([k]) => allowed.includes(k)).map(([k, v]) => [k, !!v]));
  const { error } = await o.ctx.supabase.from("events").update({ settings: { ...o.e.settings, public_page: clean } }).eq("id", o.e.id);
  return error ? { ok: false, error: "Could not save page settings." } : done(o.e.id, "Public page updated.");
}

// ── Programme / run sheet ────────────────────────────────────────────────────
const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess(v => (v === "" || v == null ? undefined : v), t.optional());
const Prog = z.object({ title: z.string().trim().min(1).max(120), detail: z.string().max(240).default(""), area: z.string().max(60).default(""), starts_at: z.string().min(1), duration_minutes: z.coerce.number().int().min(5).max(1440), kind: z.enum(["programme", "run_sheet"]), owner_name: z.string().max(60).default(""),
  segment: opt(z.enum(["session", "act", "performance", "speaker", "break", "changeover", "doors", "setup", "teardown", "service", "ceremony", "other"])), track: z.string().trim().max(60).default(""),
  space_id: opt(z.string().uuid()), build_item_id: opt(z.string().uuid()), expected_attendance: opt(z.coerce.number().int().min(0).max(500000)) });
/** Programme / run sheet item. The database rejects a second programme item in the same area/room at the same time, a room
 * outside the event's venue, an audience over the room capacity and a supplier booking from another event (Q14). */
export async function addProgrammeItem(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = Prog.safeParse(input); if (!p.success) return { ok: false, error: "Add a title, start time and duration." };
  const { error } = await untyped(o.ctx.supabase).from("programme_items").insert({ ...p.data, event_id: o.e.id, starts_at: new Date(p.data.starts_at).toISOString() });
  if (error) return { ok: false, error: programmeError(error.message) };
  return done(o.e.id, `${p.data.kind === "run_sheet" ? "Run sheet" : "Programme"} item added.`);
}
const programmeError = (m: string) => {
  const overlap = /programme_overlap: (.+)/.exec(m); if (overlap) return `Clash: ${overlap[1]}. Move this item or choose another area/room.`;
  const room = /room_capacity_exceeded: (.+)/.exec(m); if (room) return `Too many people for the room: ${room[1]}.`;
  if (/space_not_at_event_venue/.test(m)) return "Choose a room at this event's venue.";
  if (/booking_not_on_event/.test(m)) return "Link a supplier booking from this event.";
  return "Could not add the item.";
};
export async function deleteProgrammeItem(eventId: string, itemId: string): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const { error } = await o.ctx.supabase.from("programme_items").delete().eq("id", itemId).eq("event_id", o.e.id);
  return error ? { ok: false, error: "Could not remove the item." } : done(o.e.id, "Item removed.");
}
export async function setRunSheetStatus(eventId: string, itemId: string, status: "upcoming" | "in_progress" | "done"): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  if (!["upcoming", "in_progress", "done"].includes(status)) return { ok: false, error: "Invalid status." };
  const { error } = await o.ctx.supabase.from("programme_items").update({ status }).eq("id", itemId).eq("event_id", o.e.id);
  return error ? { ok: false, error: "Could not update." } : done(o.e.id);
}

// ── Tasks ───────────────────────────────────────────────────────────────────
const Task = z.object({ title: z.string().trim().min(1).max(160), category: z.string().max(40).default("general"), priority: z.enum(["low", "medium", "high", "critical"]).default("medium"), due_at: z.string().optional(), assignee_name: z.string().max(60).default("") });
export async function addTask(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = Task.safeParse(input); if (!p.success) return { ok: false, error: "Enter a task title." };
  const { error } = await o.ctx.supabase.from("tasks").insert({ ...p.data, due_at: p.data.due_at ? new Date(p.data.due_at).toISOString() : null, event_id: o.e.id, workspace_id: o.ctx.workspace.id });
  return error ? { ok: false, error: "Could not add the task." } : done(o.e.id, "Task added.");
}
export async function toggleTask(eventId: string, taskId: string, isDone: boolean): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const { error } = await o.ctx.supabase.from("tasks").update({ status: isDone ? "done" : "todo" }).eq("id", taskId).eq("event_id", o.e.id);
  return error ? { ok: false, error: "Could not update the task." } : done(o.e.id);
}

// ── Incidents ───────────────────────────────────────────────────────────────
const Inc = z.object({ title: z.string().trim().min(2).max(160), detail: z.string().max(1000).default(""), severity: z.enum(["low", "medium", "high", "critical"]) });
export async function reportIncident(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = Inc.safeParse(input); if (!p.success) return { ok: false, error: "Describe the incident." };
  const { error } = await o.ctx.supabase.from("incidents").insert({ ...p.data, event_id: o.e.id, reported_by: o.ctx.user.id });
  if (error) return { ok: false, error: "Could not record the incident." };
  if (["high", "critical"].includes(p.data.severity)) await o.ctx.supabase.from("notifications").insert({ user_id: o.ctx.user.id, kind: "incident", title: `${p.data.severity === "critical" ? "Critical" : "High"} incident: ${p.data.title}`, body: o.e.name, link: `/organizer/events/${o.e.id}?tab=operations&section=incidents` }).then(() => null, () => null);
  return done(o.e.id, "Incident recorded.");
}
export async function resolveIncident(eventId: string, incidentId: string): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const { error } = await o.ctx.supabase.from("incidents").update({ status: "resolved" }).eq("id", incidentId).eq("event_id", o.e.id);
  return error ? { ok: false, error: "Could not resolve." } : done(o.e.id, "Incident resolved.");
}

// ── Supplier lifecycle (server-validated transitions via RPC) ───────────────
export async function transitionItem(eventId: string, itemId: string, to: "sent" | "held" | "confirmed" | "standby" | "cancelled", holdHours?: number): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  if (to === "confirmed" && !["owner", "manager"].includes(o.ctx.role)) return { ok: false, error: "Only owners and managers can confirm binding bookings." };
  if (to === "cancelled") {
    const { data: cur } = await o.ctx.supabase.from("build_items").select("status").eq("id", itemId).eq("event_id", o.e.id).maybeSingle();
    if (cur && ["confirmed", "held"].includes(cur.status)) return { ok: false, error: "Cancel confirmed or held bookings from Manage booking so the cancellation policy and provider notice apply.", redirect: `/organizer/marketplace/bookings/${itemId}#cancel` };
  }
  const { error } = await o.ctx.supabase.rpc("transition_build_item", { p_item: itemId, p_to: to, p_hold_hours: holdHours ?? undefined });
  if (error) {
    const m = error.message;
    // Payment is the authority for paid marketplace bookings (P1 fix, migration 202610291028): pay the deposit to confirm.
    if (m.includes("payment_required")) return { ok: true, message: "Pay the deposit to confirm this booking — the payment confirms it with the provider.", redirect: `/organizer/marketplace/bookings/${itemId}#pay` };
    if (m.includes("venue_required")) return { ok: false, error: "Confirm the venue first — supplier bookings depend on the venue and date for this event." };
    if (m.includes("hard_conflict")) return { ok: false, error: "The provider is already booked for that time. Choose another option or a backup." };
    if (m.startsWith("invalid_transition")) return { ok: false, error: `That step isn't available from the current state (${m.split(":")[1]?.split("->")[0]}).` };
    return { ok: false, error: "Could not update the booking." };
  }
  if (to === "confirmed" || to === "cancelled") await writeAudit(o.ctx.user.id, o.ctx.workspace.id, to === "confirmed" ? "booking.confirmed" : "booking.cancelled", { event_id: o.e.id, item_id: itemId });
  return done(o.e.id, { sent: "Request sent — response clock started.", held: "Conditional hold placed.", confirmed: "Booking confirmed. Terms were snapshotted.", standby: "Added as standby.", cancelled: "Option removed." }[to]);
}
