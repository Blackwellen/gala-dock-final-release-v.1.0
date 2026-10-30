"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer, getCustomer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import { untyped } from "@/lib/workspace/db";
import { isTimezone } from "@/lib/master-data";
import { transitionEvent } from "@/lib/events/lifecycle";

const Id = z.string().uuid();

const DupInput = z.object({
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Choose the new start date and time."),
  timezone: z.string().refine(isTimezone, "Choose a timezone."),
  name: z.string().trim().max(120).optional(),
  confirm: z.literal(true, { message: "Confirm what will and won't be copied." }),
  request_id: z.string().uuid().optional(),
});
/**
 * Duplicate an event to a new date (server-side, one transaction: `duplicate_event`). Programme, run sheet, task deadlines and
 * ticket windows keep their offset from the start; only allow-listed settings are copied; guests, tickets, orders, payments,
 * bookings/holds, seats, shifts, incidents, files, share links, venue confirmation and permits are never copied. Audited.
 */
export async function duplicateEvent(eventId: string, input?: unknown): Promise<ActionResult<{ id: string }>> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const p = DupInput.safeParse(input ?? {});
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Choose the new date and confirm the copy." };
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("id").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found in this workspace." };
  const { data, error } = await untyped(ctx.supabase).rpc("duplicate_event", { p_source: e.id, p_starts_local: p.data.starts_at, p_timezone: p.data.timezone, p_confirm: true, p_name: p.data.name || null, p_request_id: p.data.request_id ?? null });
  if (error) {
    const m = error.message;
    return { ok: false, error: /new_date_in_past/.test(m) ? "The new date must be in the future." : /invalid_timezone/.test(m) ? "Choose a valid timezone." : /not_authorized/.test(m) ? "You don't have permission to duplicate events in this workspace." : "Could not duplicate the event." };
  }
  const r = data as { id: string; copied?: { tiers: number; programme: number; tasks: number } };
  revalidatePath("/organizer/events");
  const c = r.copied, n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return { ok: true, data: { id: r.id }, redirect: `/organizer/events/${r.id}`,
    message: `Draft copy created${c ? ` with ${n(c.programme, "programme item")}, ${n(c.tasks, "task")} and ${n(c.tiers, "ticket tier")} moved to the new date` : ""}. Guests, orders, payments, bookings and permits were not copied.` };
}

/** Archive: not allowed while live; financial records are preserved. Runs through the guarded lifecycle command. */
export async function archiveEvent(eventId: string): Promise<ActionResult> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const ctx = await getOrganizer();
  if (!["owner", "manager"].includes(ctx.role)) return { ok: false, error: "Only owners and managers can archive events." };
  const { data: e } = await ctx.supabase.from("events").select("id,status,name").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found in this workspace." };
  if (e.status === "live") return { ok: false, error: "A live event can't be archived. End the event first." };
  const r = await transitionEvent(ctx.supabase, e.id, "archived", e.status);
  if (!r.ok) return r;
  revalidatePath("/organizer/events");
  return { ok: true, message: `${e.name} archived.` };
}

/**
 * Cancel an event (owners/managers): voids tickets, queues full refunds incl. fees, notifies buyers. Irreversible.
 * Cause decides the organiser's platform fees (Organizer Terms 2.4): own decision → payable; force majeure → on hold until reviewed, waived if accepted.
 */
export async function cancelEvent(eventId: string, reason: string, cause: "organiser" | "force_majeure" = "organiser", fmDetail = ""): Promise<ActionResult> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  if (reason.trim().length < 10) return { ok: false, error: "Tell attendees why the event is cancelled (at least 10 characters)." };
  if (cause !== "organiser" && cause !== "force_majeure") return { ok: false, error: "Choose why the event is cancelled." };
  if (cause === "force_majeure" && fmDetail.trim().length < 30) return { ok: false, error: "Describe what happened and how it stops the event (at least 30 characters), with links to any evidence." };
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("id,name").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found in this workspace." };
  const { data, error } = await ctx.supabase.rpc("cancel_event_with_refunds" as never, { p_event: e.id, p_reason: reason, p_cause: cause, p_fm_detail: cause === "force_majeure" ? fmDetail : null } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "Only owners and managers can cancel events." : /already_happened|invalid_state/.test(error.message) ? "This event can’t be cancelled in its current state." : "Could not cancel the event." };
  const r = data as unknown as { orders_to_refund: number; tickets_voided: number; fees_due: number; fees_on_hold: number };
  const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
  const fees = r.fees_on_hold > 0 ? ` Platform fees of ${gbp(r.fees_on_hold)} are on hold while we review your force majeure claim.` : r.fees_due > 0 ? ` Platform fees of ${gbp(r.fees_due)} on the tickets sold remain payable.` : "";
  revalidatePath("/organizer/events"); revalidatePath(`/organizer/events/${e.id}`);
  return { ok: true, message: `${e.name} cancelled. ${r.tickets_voided} ticket${r.tickets_voided === 1 ? "" : "s"} voided; ${r.orders_to_refund} order${r.orders_to_refund === 1 ? "" : "s"} will be refunded in full and buyers have been told.${fees}` };
}

/**
 * Consumer event duplicate (Customer App): same server command and scrub rules as the organiser path (`duplicate_event`) —
 * a new future date + timezone and an explicit confirmation are required; guests, tickets, payments, bookings and files are never copied.
 */
export async function duplicateMyEvent(eventId: string, input?: unknown): Promise<ActionResult<{ id: string }>> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const p = DupInput.safeParse(input ?? {});
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Choose the new date and confirm the copy." };
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id").eq("id", id.data).eq("owner_id", ctx.user.id).is("workspace_id", null).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const { data, error } = await untyped(ctx.supabase).rpc("duplicate_event", { p_source: e.id, p_starts_local: p.data.starts_at, p_timezone: p.data.timezone, p_confirm: true, p_name: p.data.name || null, p_request_id: p.data.request_id ?? null });
  if (error) {
    const m = error.message;
    return { ok: false, error: /new_date_in_past/.test(m) ? "The new date must be in the future." : /invalid_timezone/.test(m) ? "Choose a valid timezone." : "Could not duplicate the event." };
  }
  const r = data as { id: string };
  revalidatePath("/account/events");
  return { ok: true, data: { id: r.id }, message: "Draft copy created for the new date. Guests, tickets, payments and bookings were not copied.", redirect: `/account/events/${r.id}` };
}

const ImportRow = z.object({ name: z.string().trim().min(1).max(120), event_type: z.string().trim().max(40).optional(), date: z.string().trim().optional(), venue: z.string().trim().max(120).optional(), capacity: z.coerce.number().int().min(0).max(500000).optional(), budget: z.coerce.number().min(0).max(1e9).optional() });
/** Bulk import from CSV rows: each row becomes a Draft professional event. */
export async function importEvents(rows: unknown[]): Promise<ActionResult<{ created: number; skipped: number }>> {
  const ctx = await getOrganizer();
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "The file has no rows." };
  if (rows.length > 200) return { ok: false, error: "Import up to 200 events at a time." };
  const valid = rows.map(r => ImportRow.safeParse(r)).filter(r => r.success).map(r => r.data);
  if (!valid.length) return { ok: false, error: "No valid rows found. Each row needs at least a name." };
  const toIso = (d?: string) => { if (!d) return null; const t = Date.parse(d); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
  const { error } = await ctx.supabase.from("events").insert(valid.map(v => ({
    owner_id: ctx.user.id, workspace_id: ctx.workspace.id, management: "professional" as const, status: "draft" as const, visibility: "private" as const,
    name: v.name, event_type: (v.event_type ?? "custom").toLowerCase().replace(/[^a-z_]+/g, "_").slice(0, 40) || "custom",
    starts_at: toIso(v.date), venue_name: v.venue ?? "", capacity: v.capacity ?? null, budget_total: v.budget ?? null, settings: { imported: true },
  })));
  if (error) return { ok: false, error: "Import failed — no events were created." };
  revalidatePath("/organizer/events");
  return { ok: true, message: `Imported ${valid.length} draft event${valid.length === 1 ? "" : "s"}${rows.length - valid.length ? ` · ${rows.length - valid.length} skipped` : ""}.`, data: { created: valid.length, skipped: rows.length - valid.length } };
}
