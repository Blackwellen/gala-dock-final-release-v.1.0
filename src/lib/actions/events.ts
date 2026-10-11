"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer, getCustomer } from "@/lib/data/context";
import type { ActionResult } from "./shell";

const Id = z.string().uuid();
const LOCKED = ["live", "completed", "closed"];

/** Duplicate an event's plan structure only (no guests, payments, tickets sold, messages). Explicit user action. */
export async function duplicateEvent(eventId: string): Promise<ActionResult> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("*").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found in this workspace." };
  const { data: copy, error } = await ctx.supabase.from("events").insert({
    owner_id: ctx.user.id, workspace_id: ctx.workspace.id, management: "professional", name: `${e.name} (copy)`.slice(0, 120), event_type: e.event_type,
    visibility: "private", status: "draft", timezone: e.timezone, venue_name: e.venue_name, location: e.location, city: e.city, capacity: e.capacity,
    budget_total: e.budget_total, revenue_goal: e.revenue_goal, target_profit: e.target_profit, currency: e.currency, description: e.description, goal: e.goal,
    cover_image: e.cover_image, client_name: e.client_name, tags: e.tags, settings: { ...(e.settings as object), duplicated_from: e.id },
  }).select("id").single();
  if (error || !copy) return { ok: false, error: "Could not duplicate the event." };
  const { data: tiers } = await ctx.supabase.from("ticket_tiers").select("name,description,kind,price,quantity,order_limit,allocation,color,sort,badge").eq("event_id", e.id);
  if (tiers?.length) await ctx.supabase.from("ticket_tiers").insert(tiers.map(t => ({ ...t, event_id: copy.id, status: "draft" as const, sold: 0, held: 0 })));
  const { data: prog } = await ctx.supabase.from("programme_items").select("title,detail,area,kind,duration_minutes,starts_at,image").eq("event_id", e.id).eq("kind", "programme");
  if (prog?.length) await ctx.supabase.from("programme_items").insert(prog.map(p => ({ ...p, event_id: copy.id })));
  revalidatePath("/organizer/events");
  return { ok: true, message: "Draft copy created — guests, orders and payments were not copied.", redirect: `/organizer/events/${copy.id}` };
}

/** Archive: not allowed while live; financial records are preserved. */
export async function archiveEvent(eventId: string): Promise<ActionResult> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const ctx = await getOrganizer();
  if (!["owner", "manager"].includes(ctx.role)) return { ok: false, error: "Only owners and managers can archive events." };
  const { data: e } = await ctx.supabase.from("events").select("id,status,name").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found in this workspace." };
  if (e.status === "live") return { ok: false, error: "A live event can't be archived. End the event first." };
  const { count } = await ctx.supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "valid");
  if ((count ?? 0) > 0 && !LOCKED.includes(e.status)) return { ok: false, error: `${count} valid tickets exist. Cancel or refund them (or complete the event) before archiving.` };
  const { error } = await ctx.supabase.from("events").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", e.id);
  if (error) return { ok: false, error: "Could not archive the event." };
  revalidatePath("/organizer/events");
  return { ok: true, message: `${e.name} archived.` };
}

/** Cancel an event (owners/managers): voids tickets, queues full refunds incl. fees, notifies buyers. Irreversible. */
export async function cancelEvent(eventId: string, reason: string): Promise<ActionResult> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  if (reason.trim().length < 10) return { ok: false, error: "Tell attendees why the event is cancelled (at least 10 characters)." };
  const ctx = await getOrganizer();
  const { data: e } = await ctx.supabase.from("events").select("id,name").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found in this workspace." };
  const { data, error } = await ctx.supabase.rpc("cancel_event_with_refunds" as never, { p_event: e.id, p_reason: reason } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "Only owners and managers can cancel events." : /already_happened|invalid_state/.test(error.message) ? "This event can’t be cancelled in its current state." : "Could not cancel the event." };
  const r = data as unknown as { orders_to_refund: number; tickets_voided: number };
  revalidatePath("/organizer/events"); revalidatePath(`/organizer/events/${e.id}`);
  return { ok: true, message: `${e.name} cancelled. ${r.tickets_voided} ticket${r.tickets_voided === 1 ? "" : "s"} voided; ${r.orders_to_refund} order${r.orders_to_refund === 1 ? "" : "s"} will be refunded in full and buyers have been told.` };
}

/** Consumer event duplicate (Customer App). */
export async function duplicateMyEvent(eventId: string): Promise<ActionResult> {
  const id = Id.safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("*").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const { data: copy, error } = await ctx.supabase.from("events").insert({ owner_id: ctx.user.id, management: "consumer", name: `${e.name} (copy)`.slice(0, 120), event_type: e.event_type, visibility: "private", status: "draft", guest_count: e.guest_count, budget_total: e.budget_total, description: e.description, cover_image: e.cover_image, tags: e.tags, priorities: e.priorities, city: e.city }).select("id").single();
  if (error || !copy) return { ok: false, error: "Could not duplicate the event." };
  revalidatePath("/account/events");
  return { ok: true, message: "Draft copy created.", redirect: `/account/events/${copy.id}` };
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
