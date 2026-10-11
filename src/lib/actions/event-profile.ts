"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer, type OrganizerCtx } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import { writeAudit } from "@/lib/audit";

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
const NEXT: Record<string, string[]> = {
  draft: ["planning", "cancelled"], planning: ["ready", "postponed", "cancelled", "draft"], ready: ["published", "planning", "postponed", "cancelled"],
  published: ["on_sale", "ready", "postponed", "cancelled"], on_sale: ["live", "published", "postponed", "cancelled", "suspended"],
  live: ["completed", "suspended"], suspended: ["on_sale", "live", "cancelled"], postponed: ["planning", "cancelled"],
  completed: ["closed"], closed: ["archived"], cancelled: ["archived"], archived: [],
};
export async function setEventStatus(eventId: string, to: string): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const { ctx, e } = o;
  if (!NEXT[e.status]?.includes(to)) return { ok: false, error: `An event can't move from ${e.status.replace("_", " ")} to ${to.replace("_", " ")}.` };
  if (["cancelled", "postponed", "suspended"].includes(to) && !["owner", "manager"].includes(ctx.role)) return { ok: false, error: "Only owners and managers can cancel, postpone or suspend an event." };
  const { data: r } = await ctx.supabase.rpc("event_readiness", { p_event: e.id });
  const checks = ((r as { checks?: { key: string; ok: boolean; label: string }[] })?.checks ?? []);
  const missing = (k: string) => checks.find(c => c.key === k && !c.ok);
  if (to === "ready" && (missing("details") || missing("venue"))) return { ok: false, error: `Before marking ready: ${[missing("details"), missing("venue")].filter(Boolean).map(c => c!.label).join(", ")}.` };
  if (to === "published" && missing("venue") && !e.settings.virtual) return { ok: false, error: "Confirm the venue before publishing the public event page." };
  if (to === "on_sale") {
    const { count } = await ctx.supabase.from("ticket_tiers").select("id", { count: "exact", head: true }).eq("event_id", e.id).in("status", ["on_sale", "scheduled"]);
    if (!count) return { ok: false, error: "Set up at least one ticket tier (Tickets setup) before going on sale." };
    if (ctx.workspace.payout_status !== "active") return { ok: false, error: "Connect payouts in Settings › Payments before selling paid tickets." };
  }
  if (to === "live" && e.starts_at && new Date(e.starts_at).getTime() - Date.now() > 36 * 36e5) return { ok: false, error: "Live Mode opens 36 hours before the event starts." };
  if (to === "cancelled") {
    const { count } = await ctx.supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "valid");
    if (count) return { ok: false, error: `${count} valid tickets exist. Cancellation must run through the refund workflow so ticket holders are refunded first.` };
  }
  const { error } = await ctx.supabase.from("events").update({ status: to, visibility: ["published", "on_sale"].includes(to) ? "public" : e.visibility, updated_at: new Date().toISOString() }).eq("id", e.id);
  if (error) return { ok: false, error: "Could not update the event status." };
  await writeAudit(ctx.user.id, ctx.workspace.id, "event.status_changed", { event_id: e.id, from: e.status, to });
  return done(e.id, `${e.name} is now ${to.replace("_", " ")}.`);
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
const Prog = z.object({ title: z.string().trim().min(1).max(120), detail: z.string().max(240).default(""), area: z.string().max(60).default(""), starts_at: z.string().min(1), duration_minutes: z.coerce.number().int().min(5).max(1440), kind: z.enum(["programme", "run_sheet"]), owner_name: z.string().max(60).default("") });
export async function addProgrammeItem(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await own(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = Prog.safeParse(input); if (!p.success) return { ok: false, error: "Add a title, start time and duration." };
  const { error } = await o.ctx.supabase.from("programme_items").insert({ ...p.data, event_id: o.e.id, starts_at: new Date(p.data.starts_at).toISOString() });
  return error ? { ok: false, error: "Could not add the item." } : done(o.e.id, `${p.data.kind === "run_sheet" ? "Run sheet" : "Programme"} item added.`);
}
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
    if (m.includes("venue_required")) return { ok: false, error: "Confirm the venue first — supplier bookings depend on the venue and date for this event." };
    if (m.includes("hard_conflict")) return { ok: false, error: "The provider is already booked for that time. Choose another option or a backup." };
    if (m.startsWith("invalid_transition")) return { ok: false, error: `That step isn't available from the current state (${m.split(":")[1]?.split("->")[0]}).` };
    return { ok: false, error: "Could not update the booking." };
  }
  if (to === "confirmed" || to === "cancelled") await writeAudit(o.ctx.user.id, o.ctx.workspace.id, to === "confirmed" ? "booking.confirmed" : "booking.cancelled", { event_id: o.e.id, item_id: itemId });
  return done(o.e.id, { sent: "Request sent — response clock started.", held: "Conditional hold placed.", confirmed: "Booking confirmed. Terms were snapshotted.", standby: "Added as standby.", cancelled: "Option removed." }[to]);
}
