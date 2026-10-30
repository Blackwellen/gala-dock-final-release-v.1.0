"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped, type Db } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Reserved inventory commands (Q20) for Sell › Inventory & allocations. ticket_allocations / discount_codes are written under RLS
 * (can_access_event); the allocation guard trigger enforces "never more than the tier". Writes here are limited to roles with
 * events.write (owner / manager / member) — finance can read the inventory but not change it.
 */
const Id = z.string().uuid();
const KINDS = ["promoter", "accessible", "guest", "comp", "vip", "partner", "hold"] as const;
const WRITE_ROLES = ["owner", "manager", "member"];
const bump = (eventId: string) => revalidatePath(`/organizer/events/${eventId}`);
const why = (m: string) => /allocation_exceeds_inventory/.test(m) ? "Allocations on a tier can't add up to more than the tier's tickets."
  : /tier_not_in_event|promoter_not_in_event/.test(m) ? "Pick a tier and promoter from this event." : /not_authorized|42501|row-level security/.test(m) ? "You don't have permission to change this event's inventory."
  : /duplicate key|23505/.test(m) ? "That code is already used for this event." : "Could not save — try again.";

type Inv = { tier_id: string; quantity: number; allocations: { id: string; used: number; quantity: number; status: string }[] }[];

/** The caller's client plus a check that they may write this event (event owner, or an organiser role with events.write). */
async function writer(eventId: string): Promise<{ db: Db } | { error: string }> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const db = untyped(client);
  const { data: ev } = await db.from("events").select("id,owner_id,workspace_id").eq("id", eventId).maybeSingle();
  if (!ev) return { error: "Event not found." };
  if (ev.owner_id === user.id) return { db };
  const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ev.workspace_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  return m && WRITE_ROLES.includes(String(m.role)) ? { db } : { error: "Your role can view inventory but not change it." };
}
async function inventory(db: Db, eventId: string): Promise<Inv> {
  const { data } = await db.rpc("event_ticket_inventory", { p_event: eventId });
  return (data ?? []) as Inv;
}

const Allocation = z.object({ tier_id: Id, kind: z.enum(KINDS), label: z.string().trim().max(80).default(""), quantity: z.number().int().min(1, "Reserve at least one ticket.").max(1_000_000), promoter_id: Id.nullable().optional() })
  .refine(a => a.kind !== "promoter" || !!a.promoter_id, { message: "Pick the promoter this allocation is for." });

export async function saveAllocation(eventId: string, input: unknown, allocationId?: string): Promise<ActionResult<{ id: string }>> {
  if (!Id.safeParse(eventId).success || (allocationId && !Id.safeParse(allocationId).success)) return { ok: false, error: "Invalid allocation." };
  const p = Allocation.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the allocation." };
  const w = await writer(eventId); if ("error" in w) return { ok: false, error: w.error };
  const row = { tier_id: p.data.tier_id, kind: p.data.kind, label: p.data.label, quantity: p.data.quantity, promoter_id: p.data.kind === "promoter" ? p.data.promoter_id ?? null : null };
  if (allocationId) {
    const inv = await inventory(w.db, eventId);
    const cur = inv.flatMap(t => t.allocations.map(a => ({ ...a, tier: t.tier_id }))).find(a => a.id === allocationId);
    if (!cur) return { ok: false, error: "Allocation not found." };
    if (p.data.quantity < cur.used) return { ok: false, error: `${cur.used} of these tickets are already used — the allocation can't go below that.` };
    if (cur.tier !== p.data.tier_id && cur.used > 0) return { ok: false, error: "Tickets were already issued from this allocation — it can't move to another tier." };
    const { data: src } = await w.db.from("ticket_allocations").select("source").eq("id", allocationId).maybeSingle();
    if (src?.source === "promoter_mirror") return { ok: false, error: "This allocation is synced from the promoter's ticket allocation — change it there, then sync." };
    const { error } = await w.db.from("ticket_allocations").update(row).eq("id", allocationId).eq("event_id", eventId);
    if (error) return { ok: false, error: why(error.message) };
    bump(eventId); return { ok: true, data: { id: allocationId }, message: "Allocation updated." };
  }
  const { data, error } = await w.db.from("ticket_allocations").insert({ ...row, event_id: eventId, status: "active" }).select("id").single();
  if (error || !data) return { ok: false, error: why(error?.message ?? "") };
  bump(eventId); return { ok: true, data: { id: data.id as string }, message: `${p.data.quantity} tickets reserved.` };
}

/** Releasing returns the unused units to public sale (used units stay counted); reactivating re-checks the tier limit. */
export async function setAllocationStatus(eventId: string, allocationId: string, status: "active" | "released"): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(allocationId).success) return { ok: false, error: "Invalid allocation." };
  const w = await writer(eventId); if ("error" in w) return { ok: false, error: w.error };
  const { error } = await w.db.from("ticket_allocations").update({ status }).eq("id", allocationId).eq("event_id", eventId);
  if (error) return { ok: false, error: why(error.message) };
  bump(eventId); return { ok: true, message: status === "released" ? "Allocation released — unused tickets are back on public sale." : "Allocation reactivated." };
}

export async function deleteAllocation(eventId: string, allocationId: string): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(allocationId).success) return { ok: false, error: "Invalid allocation." };
  const w = await writer(eventId); if ("error" in w) return { ok: false, error: w.error };
  const cur = (await inventory(w.db, eventId)).flatMap(t => t.allocations).find(a => a.id === allocationId);
  if (!cur) return { ok: false, error: "Allocation not found." };
  if (cur.used > 0) return { ok: false, error: "Tickets were issued from this allocation — release it instead of deleting." };
  const { error } = await w.db.from("ticket_allocations").delete().eq("id", allocationId).eq("event_id", eventId);
  if (error) return { ok: false, error: why(error.message) };
  bump(eventId); return { ok: true, message: "Allocation deleted." };
}

const Code = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,32}$/, "Codes are 4–32 letters, numbers, dashes or underscores."), max_uses: z.number().int().min(1).max(1_000_000).nullable(),
  per_customer_limit: z.number().int().min(1).max(100).nullable(), valid_from: z.string().datetime({ offset: true }).nullable(), valid_until: z.string().datetime({ offset: true }).nullable() })
  .refine(c => !c.valid_from || !c.valid_until || Date.parse(c.valid_until) > Date.parse(c.valid_from), { message: "The code must end after it starts." });
/** An access code draws tickets only from its allocation (purpose = access, no discount). */
export async function createAccessCode(eventId: string, allocationId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(allocationId).success) return { ok: false, error: "Invalid allocation." };
  const p = Code.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the code." };
  const w = await writer(eventId); if ("error" in w) return { ok: false, error: w.error };
  const { data: a } = await w.db.from("ticket_allocations").select("id,tier_id,status").eq("id", allocationId).eq("event_id", eventId).maybeSingle();
  if (!a) return { ok: false, error: "Allocation not found." };
  if (a.status !== "active") return { ok: false, error: "Reactivate the allocation before adding codes." };
  const scheduled = p.data.valid_from && Date.parse(p.data.valid_from) > Date.now();
  const { data, error } = await w.db.from("discount_codes").insert({ event_id: eventId, code: p.data.code, kind: "amount", amount: 0, purpose: "access", allocation_id: allocationId, tier_ids: [a.tier_id],
    max_uses: p.data.max_uses, per_customer_limit: p.data.per_customer_limit, valid_from: p.data.valid_from, valid_until: p.data.valid_until, stackable: false, status: scheduled ? "scheduled" : "active" }).select("id").single();
  if (error || !data) return { ok: false, error: why(error?.message ?? "") };
  bump(eventId); return { ok: true, data: { id: data.id as string }, message: `Access code ${p.data.code} created.` };
}
export async function setAccessCodeStatus(eventId: string, codeId: string, status: "active" | "disabled"): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(codeId).success) return { ok: false, error: "Invalid code." };
  const w = await writer(eventId); if ("error" in w) return { ok: false, error: w.error };
  const { data, error } = await w.db.from("discount_codes").update({ status }).eq("id", codeId).eq("event_id", eventId).eq("purpose", "access").select("id");
  if (error || !data?.length) return { ok: false, error: error ? why(error.message) : "Code not found." };
  bump(eventId); return { ok: true, message: status === "disabled" ? "Code disabled — it can't be used at checkout." : "Code re-enabled." };
}

export type SyncRow = { name: string; action: string; quantity?: number; target?: number; capped?: boolean; reason?: string };
/** Mirrors promoters.ticket_allocation into promoter allocations (202610294036). The first sync opts the event in. */
export async function syncPromoterAllocations(eventId: string, tierId?: string | null): Promise<ActionResult<SyncRow[]>> {
  if (!Id.safeParse(eventId).success || (tierId && !Id.safeParse(tierId).success)) return { ok: false, error: "Invalid tier." };
  const client = untyped(await createClient());
  const { data, error } = await client.rpc("sync_promoter_allocations", { p_event: eventId, p_tier: tierId || null });
  if (error) return { ok: false, error: /tier_not_in_event/.test(error.message) ? "Pick a ticket tier from this event." : /not_authorized/.test(error.message) ? "Your role can't change this event's inventory." : "Could not sync promoter allocations." };
  const rows = ((data as { results: SyncRow[] }).results ?? []);
  const changed = rows.filter(r => ["created", "updated", "released"].includes(r.action)).length, capped = rows.filter(r => r.capped).length;
  bump(eventId);
  return { ok: true, data: rows, message: !rows.length ? "This event has no promoters yet." : `${changed} promoter allocation${changed === 1 ? "" : "s"} changed${capped ? ` · ${capped} limited by available stock` : ""}.` };
}
