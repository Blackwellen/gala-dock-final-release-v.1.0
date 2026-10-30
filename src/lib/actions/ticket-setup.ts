"use server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./shell";
import { lifecycleError } from "@/lib/events/lifecycle";

const Id = z.string().uuid();
const Tier = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), description: z.string().max(200), price: z.number().min(0).max(100000), quantity: z.number().int().min(0).max(1000000), badge: z.string().max(30).nullable(), color: z.string().regex(/^#[0-9a-f]{6}$/i), kind: z.enum(["general", "vip", "group", "accessible", "comp", "student", "press", "early"]) });
const Model = z.object({ model: z.enum(["general", "reserved", "free"]), capacity: z.number().int().min(1).max(1000000), tiers: z.array(Tier).min(1).max(20) });
const Promo = z.object({ id: z.string().uuid().optional(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/), kind: z.enum(["percent", "amount"]), amount: z.number().positive().max(100000), valid_from: z.string().nullable(), valid_until: z.string().nullable(), max_uses: z.number().int().positive().nullable() });
const Rules = z.object({ sale_start: z.string(), sale_end: z.string().nullable(), countdown: z.boolean(), order_limit: z.number().int().min(1).max(100), transfers: z.boolean(), resale: z.boolean(), refund: z.enum(["none", "7days", "partial", "custom"]), refund_text: z.string().max(1000), promos: z.array(Promo).max(20) });
export type TierInput = z.infer<typeof Tier>; export type RulesInput = z.infer<typeof Rules>;

async function access(eventId: string) {
  const id = Id.safeParse(eventId); if (!id.success) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return null;
  const { data: e } = await supabase.from("events").select("id,name,slug,status,starts_at,capacity,settings,management,workspace_id,visibility,owner_id,venue_listing_id").eq("id", id.data).maybeSingle();
  if (!e) return null;
  return { supabase, user, e };
}
const bump = (e: { id: string; management: string; slug: string | null }) => {
  const base = e.management === "consumer" ? `/account/events/${e.id}` : `/organizer/events/${e.id}`;
  for (const p of ["", "/guests-tickets", "/tickets/setup"]) revalidatePath(`${base}${p}`);
  revalidatePath("/organizer/tickets"); if (e.slug) revalidatePath(`/events/${e.slug}`);
};

/** Step 1: ticket model, capacity and tiers. Tiers with sales can't drop below sold or be removed. */
export async function saveTicketModel(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await access(eventId); if (!o) return { ok: false, error: "Event not found." };
  const p = Model.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path.includes("name") ? "Give every tier a name." : "Check your tiers and capacity." };
  const { model, capacity } = p.data; const tiers = p.data.tiers.map(t => model === "free" ? { ...t, price: 0 } : t);
  const total = tiers.reduce((s, t) => s + t.quantity, 0);
  if (total > capacity) return { ok: false, error: `Your tiers add up to ${total} tickets — more than the ${capacity} capacity.` };
  let venueCap = o.e.capacity ?? null;
  if (o.e.venue_listing_id) { const { data: v } = await o.supabase.from("listings").select("capacity_max").eq("id", o.e.venue_listing_id).maybeSingle(); venueCap = v?.capacity_max ?? venueCap; }
  if (venueCap && capacity > venueCap) return { ok: false, error: `Capacity can't exceed the approved venue capacity of ${venueCap}.` };
  const { data: existing } = await o.supabase.from("ticket_tiers").select("id,sold,held,name,status").eq("event_id", o.e.id);
  for (const ex of existing ?? []) {
    const next = tiers.find(t => t.id === ex.id);
    if (!next && ex.sold > 0) return { ok: false, error: `${ex.name} has ${ex.sold} sold — pause it instead of removing it.` };
    if (next && next.quantity < ex.sold + ex.held) return { ok: false, error: `${ex.name} already has ${ex.sold + ex.held} sold or held.` };
  }
  const remove = (existing ?? []).filter(ex => !tiers.some(t => t.id === ex.id)).map(ex => ex.id);
  if (remove.length) { const { error } = await o.supabase.from("ticket_tiers").delete().in("id", remove); if (error) return { ok: false, error: "Could not update tiers." }; }
  for (const [i, t] of tiers.entries()) {
    const row = { name: t.name, description: t.description, price: t.price, quantity: t.quantity, badge: t.badge, color: t.color, kind: t.kind, sort: i + 1 };
    const res = t.id && (existing ?? []).some(ex => ex.id === t.id) ? await o.supabase.from("ticket_tiers").update(row).eq("id", t.id).eq("event_id", o.e.id) : await o.supabase.from("ticket_tiers").insert({ ...row, event_id: o.e.id, status: "draft" });
    if (res.error) return { ok: false, error: `Could not save ${t.name}.` };
  }
  await o.supabase.from("events").update({ settings: { ...(o.e.settings as Record<string, unknown>), ticket_model: model, ticket_capacity: capacity, ticketed: true }, updated_at: new Date().toISOString() }).eq("id", o.e.id);
  bump(o.e); return { ok: true, message: "Ticket tiers saved." };
}

/** Step 2: sale window, purchase rules, refund policy and promo codes. */
export async function saveSalesRules(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await access(eventId); if (!o) return { ok: false, error: "Event not found." };
  const p = Rules.safeParse(input); if (!p.success) { const f = p.error.issues[0]?.path; return { ok: false, error: f?.includes("code") ? "Promo codes use 3–24 letters, numbers, - or _." : "Check your sale dates and rules." }; }
  const r = p.data; const start = Date.parse(r.sale_start); const end = r.sale_end ? Date.parse(r.sale_end) : null; const ev = o.e.starts_at ? Date.parse(o.e.starts_at) : null;
  if (Number.isNaN(start)) return { ok: false, error: "Choose when tickets go on sale." };
  if (end !== null && (Number.isNaN(end) || end <= start)) return { ok: false, error: "Sales must end after they start." };
  if (ev && start >= ev) return { ok: false, error: "Sales must start before the event." };
  if (ev && end && end > ev + 6 * 36e5) return { ok: false, error: "Sales can't end long after the event starts." };
  if (r.promos.some(x => x.kind === "percent" && x.amount > 100)) return { ok: false, error: "Percentage discounts can't exceed 100%." };
  if (new Set(r.promos.map(x => x.code)).size !== r.promos.length) return { ok: false, error: "Each promo code must be unique." };
  const { error } = await o.supabase.from("ticket_tiers").update({ sale_start: new Date(start).toISOString(), sale_end: end ? new Date(end).toISOString() : null, order_limit: r.order_limit }).eq("event_id", o.e.id);
  if (error) return { ok: false, error: "Could not save sale dates." };
  const { data: codes } = await o.supabase.from("discount_codes").select("id,used").eq("event_id", o.e.id).eq("purpose", "discount");
  const drop = (codes ?? []).filter(c => !r.promos.some(x => x.id === c.id));
  for (const c of drop) await (c.used > 0 ? o.supabase.from("discount_codes").update({ status: "disabled" }).eq("id", c.id) : o.supabase.from("discount_codes").delete().eq("id", c.id));
  for (const x of r.promos) {
    const row = { code: x.code, kind: x.kind, amount: x.amount, valid_from: x.valid_from || null, valid_until: x.valid_until || null, max_uses: x.max_uses, status: x.valid_from && Date.parse(x.valid_from) > Date.now() ? "scheduled" : "active" };
    const res = x.id ? await o.supabase.from("discount_codes").update(row).eq("id", x.id).eq("event_id", o.e.id) : await o.supabase.from("discount_codes").insert({ ...row, event_id: o.e.id });
    if (res.error) return { ok: false, error: res.error.code === "23505" ? `${x.code} is already used for this event.` : `Could not save ${x.code}.` };
  }
  const refundLabel = { none: "No refunds (all sales are final)", "7days": "Full refund up to 7 days before the event", partial: "Partial refund (50%) up to 7 days before", custom: r.refund_text.trim() || "Custom policy" }[r.refund];
  await o.supabase.from("events").update({ settings: { ...(o.e.settings as Record<string, unknown>), transfers: r.transfers, resale: r.resale, countdown: r.countdown, refund_policy: r.refund, refund_text: refundLabel, order_limit: r.order_limit }, updated_at: new Date().toISOString() }).eq("id", o.e.id);
  bump(o.e); return { ok: true, message: "Sales settings saved." };
}

/** Step 3: publish. Paid tickets need a verified payout account; free tickets can go live straight away. */
/** W11 ticketing guard refusals (event_ticketing_check reasons) → host-facing copy. */
function ticketPolicyError(m: string): string | null {
  if (/ticketing_not_enabled/.test(m)) return "Ticketing is off for this event type. Switch \"Sell tickets\" on first.";
  if (/ticketing_private_only/.test(m)) return "Tickets for this event type are invite-only. Keep the event private and use its private guest link.";
  return null;
}

export async function publishTickets(eventId: string, agreed: boolean): Promise<ActionResult> {
  const o = await access(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!agreed) return { ok: false, error: "Please agree to the ticketing terms." };
  const { data: tiers } = await o.supabase.from("ticket_tiers").select("id,price,sale_start,status,quantity").eq("event_id", o.e.id);
  if (!tiers?.length) return { ok: false, error: "Add at least one ticket tier." };
  if (tiers.some(t => !t.sale_start)) return { ok: false, error: "Set your sale dates first." };
  if (!o.e.starts_at || Date.parse(o.e.starts_at) < Date.now()) return { ok: false, error: "Your event needs a future date before tickets can go on sale." };
  const paid = tiers.some(t => Number(t.price) > 0);
  if (paid) {
    const { data: ws } = o.e.workspace_id ? await o.supabase.from("workspaces").select("payout_status").eq("id", o.e.workspace_id).maybeSingle() : { data: null };
    if (ws?.payout_status !== "active") return { ok: false, error: o.e.management === "consumer" ? "Paid tickets need a payout account. Upgrade to Organizer mode to get paid — or make your tickets free." : "Finish payout setup in Money before selling paid tickets." };
  }
  const now = Date.now();
  // W11: private_only types (children's party) only sell through a private invite link, and the tier guard checks for it —
  // so the invite token must exist BEFORE any tier goes on sale.
  const s = { ...(o.e.settings as Record<string, unknown>), ...(o.e.visibility === "private" && !(o.e.settings as Record<string, unknown>)?.invite_token ? { invite_token: randomBytes(16).toString("hex") } : {}) };
  if (s.invite_token !== (o.e.settings as Record<string, unknown>)?.invite_token) {
    const { error: invErr } = await o.supabase.from("events").update({ settings: s, updated_at: new Date().toISOString() }).eq("id", o.e.id);
    if (invErr) return { ok: false, error: "Could not prepare the private ticket link." };
  }
  for (const t of tiers) {
    const { error: tierErr } = await o.supabase.from("ticket_tiers").update({ status: Date.parse(t.sale_start!) > now ? "scheduled" : "on_sale" }).eq("id", t.id);
    if (tierErr) return { ok: false, error: ticketPolicyError(tierErr.message) ?? lifecycleError(tierErr)?.message ?? "Could not put your tickets on sale." };
  }
  let slug = o.e.slug;
  if (!slug) { slug = `${o.e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${randomBytes(3).toString("hex")}`; }
  const status = o.e.management === "professional" && ["draft", "planning", "ready", "published"].includes(o.e.status) ? "on_sale" : o.e.status;
  const { error } = await o.supabase.from("events").update({ slug, settings: { ...s, ticketing_live: true }, status, updated_at: new Date().toISOString() }).eq("id", o.e.id);
  if (error) return { ok: false, error: lifecycleError(error, status)?.message ?? "Could not publish tickets." };
  bump({ ...o.e, slug }); return { ok: true, message: "Tickets are live!", redirect: `${o.e.management === "consumer" ? `/account/events/${o.e.id}/guests-tickets` : `/organizer/events/${o.e.id}?tab=sell`}` };
}

/** W11: explicit "Sell tickets" switch for optional-off / private-only event types (event_set_ticketing; owner or events.write). */
export async function setEventTicketing(eventId: string, on: boolean): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Event not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_set_ticketing" as never, { p_event: eventId, p_on: on } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You can't change ticketing for this event." : "Could not change ticketing." };
  const r = (data ?? {}) as { ok?: boolean; message?: string; allowed?: boolean; reason?: string };
  if (r.ok === false) return { ok: false, error: r.message ?? "Could not change ticketing." };
  revalidatePath(`/account/events/${eventId}/guests-tickets`);
  return { ok: true, message: on ? (r.allowed === false && r.reason ? r.reason : "Tickets are switched on — set them up next.") : "Ticketing is switched off." };
}
