"use server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { can } from "@/lib/domain/permissions";
import type { Json } from "@/types/database";
import type { ActionResult } from "./shell";
import type { ProSettings } from "@/lib/ticket-pro-model";
import { untyped } from "@/lib/workspace/db";
import { transitionEvent, type EventBlocker } from "@/lib/events/lifecycle";

const Id = z.string().uuid();
const Iso = z.string().refine(v => !Number.isNaN(Date.parse(v)), "date");
const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const Section = z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), type: z.enum(["standing", "reserved", "vip", "accessible", "hold"]), capacity: z.number().int().min(0).max(1_000_000), color: Hex, tiers: z.array(z.string().max(40)).max(20), holds: z.number().int().min(0).max(1_000_000) });
const ModelIn = z.object({ model: z.enum(["general", "reserved", "hybrid"]), capacity: z.number().int().min(1).max(1_000_000), buffer_pct: z.number().min(0).max(30), map_source: z.enum(["venue", "custom", "upload"]), map_image: z.string().max(400).nullable(), sections: z.array(Section).max(30) });
const TierIn = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), description: z.string().max(200), kind: z.enum(["general", "vip", "group", "accessible", "comp", "student", "press", "early"]),
  price: z.number().min(0).max(100_000), quantity: z.number().int().min(0).max(1_000_000), sale_start: Iso.nullable(), sale_end: Iso.nullable(), release_name: z.string().max(60).nullable(),
  valid_from: Iso.nullable().default(null), valid_to: Iso.nullable().default(null),
  after: z.number().int().min(-1).max(40), enabled: z.boolean(), image: z.string().max(400).nullable(), order_limit: z.number().int().min(1).max(100), badge: z.string().max(30).nullable(), color: Hex,
});
const Phase = z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), starts_at: Iso.nullable() });
const Promo = z.object({ id: z.string().uuid().optional(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/), kind: z.enum(["percent", "amount"]), amount: z.number().positive().max(100_000), valid_from: Iso.nullable(), valid_until: Iso.nullable(), max_uses: z.number().int().positive().nullable() });
const Sales = z.object({ order_limit: z.number().int().min(1).max(100), min_age: z.number().int().min(0).max(25), timezone: z.string().max(40), waiting_list: z.boolean(), resale: z.boolean(), show_remaining: z.boolean(), countdown: z.boolean(), require_account: z.boolean(), discount_codes: z.boolean(), referral: z.boolean() });
const TiersIn = z.object({ tiers: z.array(TierIn).min(1).max(30), phases: z.array(Phase).max(10), sales: Sales, promos: z.array(Promo).max(30), allocations: z.array(z.object({ id: z.string().uuid(), qty: z.number().int().min(0).max(1_000_000).nullable() })).max(50) });
const AllocIn = z.object({ sections: z.array(Section).max(30) });
const AccessIn = z.object({
  transfers: z.boolean(), resale: z.boolean(), resale_cap: z.union([z.literal(100), z.literal(110), z.literal(120), z.literal(150)]), fee_buyer: z.number().min(0).max(15), fee_seller: z.number().min(0).max(15),
  refund: z.enum(["none", "date", "flexible", "cancel"]), refund_cutoff: Iso.nullable(), refund_amount: z.union([z.literal(100), z.literal(50)]),
  questions: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), label: z.string().trim().min(2).max(80), on: z.boolean(), required: z.boolean(), custom: z.boolean().optional() })).max(15),
  fee_display: z.enum(["upfront", "included", "checkout"]), terms_template: z.string().max(80), require_terms: z.boolean(), age_message: z.boolean(), age_text: z.string().max(120), info_text: z.string().max(2000),
  comps: z.number().int().min(0).max(100_000), companion: z.boolean(), accessible_seats: z.number().int().min(0).max(100_000),
  ticket_display: z.enum(["qr", "visual", "barcode"]).default("qr"), ticket_display_switch: z.boolean().default(true),
});

async function access(eventId: string, perm: "tickets.manage" = "tickets.manage") {
  if (!Id.safeParse(eventId).success) return { error: "Event not found." } as const;
  const ctx = await getOrganizer();
  if (!can("organizer", ctx.role, perm)) return { error: "You don't have permission to manage tickets for this workspace." } as const;
  const { data: e } = await ctx.supabase.from("events").select("id,name,slug,status,starts_at,capacity,settings,management,visibility,venue_listing_id").eq("id", eventId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e || e.management !== "professional") return { error: "Event not found." } as const;
  const settings = (e.settings ?? {}) as Record<string, unknown>;
  return { ctx, e, settings, pro: (settings.ticket_pro ?? {}) as Partial<ProSettings> };
}
const bump = (id: string, slug: string | null) => { for (const p of ["", "/tickets/setup", "/map"]) revalidatePath(`/organizer/events/${id}${p}`); revalidatePath("/organizer/tickets"); if (slug) revalidatePath(`/events/${slug}`); };
async function venueCapOf(o: Exclude<Awaited<ReturnType<typeof access>>, { error: string }>) {
  if (!o.e.venue_listing_id) return o.e.capacity ?? null;
  const { data } = await o.ctx.supabase.from("listings").select("capacity_max").eq("id", o.e.venue_listing_id).maybeSingle();
  return data?.capacity_max ?? o.e.capacity ?? null;
}
async function writeSettings(o: Exclude<Awaited<ReturnType<typeof access>>, { error: string }>, patch: Partial<ProSettings>, legacy: Record<string, unknown> = {}) {
  const pro = { ...o.pro, ...patch };
  const { error } = await o.ctx.supabase.from("events").update({ settings: { ...o.settings, ...legacy, ticket_pro: pro, ticketed: true } as Json, updated_at: new Date().toISOString() }).eq("id", o.e.id);
  return error;
}

/** Step 1 · Model & capacity: ticketing model, sellable capacity, safety buffer and the section breakdown. */
export async function saveProModel(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await access(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = ModelIn.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path.includes("name") ? "Give every section a name." : "Check your capacity and sections." };
  const m = p.data; const venueCap = await venueCapOf(o);
  if (venueCap && m.capacity > venueCap) return { ok: false, error: `Event capacity can't exceed the approved venue capacity of ${venueCap.toLocaleString("en-GB")}.` };
  const sum = m.sections.reduce((a, s) => a + s.capacity, 0);
  if (sum > m.capacity) return { ok: false, error: `Sections add up to ${sum.toLocaleString("en-GB")} — more than the ${m.capacity.toLocaleString("en-GB")} event capacity.` };
  if (m.map_image && !/^\/(assets|event-media)\//.test(m.map_image) && !m.map_image.includes("/storage/v1/object/public/event-media/")) return { ok: false, error: "Upload the map image to your event media first." };
  const { data: tiers } = await o.ctx.supabase.from("ticket_tiers").select("quantity").eq("event_id", o.e.id);
  const sellable = Math.floor(m.capacity * (1 - m.buffer_pct / 100)); const allocated = (tiers ?? []).reduce((a, t) => a + t.quantity, 0);
  if (allocated > sellable) return { ok: false, error: `Your tiers already allocate ${allocated.toLocaleString("en-GB")} tickets — raise capacity or lower the buffer (sellable: ${sellable.toLocaleString("en-GB")}).` };
  const prevSections = new Map((o.pro.sections ?? []).map(s => [s.id, s]));
  const sections = m.sections.map(s => ({ ...s, tiers: prevSections.get(s.id)?.tiers ?? s.tiers, holds: prevSections.get(s.id)?.holds ?? s.holds }));
  const error = await writeSettings(o, { ...m, sections }, { ticket_model: m.model === "general" ? "general" : "reserved", ticket_capacity: sellable });
  if (error) return { ok: false, error: "Could not save the ticket model." };
  bump(o.e.id, o.e.slug); return { ok: true, message: "Model and capacity saved." };
}

/** Step 2 · Tiers, releases & pricing: tiers with their own sale windows and release rules, phases, sales settings, codes and promoter allocations. */
export async function saveProTiers(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await access(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = TiersIn.safeParse(input);
  if (!p.success) { const f = p.error.issues[0]?.path ?? []; return { ok: false, error: f.includes("code") ? "Promo codes use 3–24 letters, numbers, - or _." : f.includes("name") ? "Give every tier and phase a name." : f.includes("sale_start") || f.includes("sale_end") ? "Check the tier sale windows." : "Check your tiers and settings." }; }
  const { tiers, phases, sales, promos, allocations } = p.data;
  const capacity = Number(o.pro.capacity) || Number(o.settings.ticket_capacity) || 0; const buffer = Number(o.pro.buffer_pct ?? 5);
  const sellable = capacity ? Math.floor(capacity * (1 - buffer / 100)) : Infinity; const total = tiers.reduce((a, t) => a + t.quantity, 0);
  if (total > sellable) return { ok: false, error: `Tiers add up to ${total.toLocaleString("en-GB")} tickets — above the ${sellable.toLocaleString("en-GB")} sellable capacity (after the ${buffer}% buffer).` };
  const ev = o.e.starts_at ? Date.parse(o.e.starts_at) : null;
  for (const [i, t] of tiers.entries()) {
    const s = t.sale_start ? Date.parse(t.sale_start) : null, en = t.sale_end ? Date.parse(t.sale_end) : null;
    if (t.enabled && !s && t.after < 0) return { ok: false, error: `Set when ${t.name} goes on sale, or release it after another tier.` };
    if (s && en && en <= s) return { ok: false, error: `${t.name}: sales must end after they start.` };
    if (ev && s && s >= ev) return { ok: false, error: `${t.name}: sales must start before the event.` };
    if (ev && en && en > ev + 12 * 36e5) return { ok: false, error: `${t.name}: sales can't end long after the event starts.` };
    if (t.valid_from && t.valid_to && Date.parse(t.valid_to) <= Date.parse(t.valid_from)) return { ok: false, error: `${t.name}: entry must end after it starts.` };
    if (t.after === i) return { ok: false, error: `${t.name} can't be released after itself.` };
    if (t.after >= tiers.length) return { ok: false, error: `${t.name}: choose a valid tier to release after.` };
    if (t.image && !/^\/(assets|event-media)\//.test(t.image) && !t.image.includes("/storage/v1/object/public/event-media/")) return { ok: false, error: `${t.name}: choose an image from your event media.` };
  }
  // Reject release cycles (A after B after A).
  for (const [i] of tiers.entries()) { let k = tiers[i]!.after, n = 0; while (k >= 0 && n++ < tiers.length) { if (k === i) return { ok: false, error: `${tiers[i]!.name} has a circular release rule.` }; k = tiers[k]!.after; } }
  if (promos.some(x => x.kind === "percent" && x.amount > 100)) return { ok: false, error: "Percentage discounts can't exceed 100%." };
  if (new Set(promos.map(x => x.code)).size !== promos.length) return { ok: false, error: "Each discount code must be unique." };
  const sb = o.ctx.supabase;
  const { data: existing } = await sb.from("ticket_tiers").select("id,sold,held,name,status").eq("event_id", o.e.id);
  for (const ex of existing ?? []) {
    const next = tiers.find(t => t.id === ex.id);
    if (!next && ex.sold > 0) return { ok: false, error: `${ex.name} has ${ex.sold} sold — switch it off instead of removing it.` };
    if (next && next.quantity < ex.sold + ex.held) return { ok: false, error: `${ex.name} already has ${ex.sold + ex.held} sold or held.` };
  }
  const live = !!o.settings.ticketing_live;
  const remove = (existing ?? []).filter(ex => !tiers.some(t => t.id === ex.id)).map(ex => ex.id);
  if (remove.length) { const { error } = await sb.from("ticket_tiers").delete().in("id", remove); if (error) return { ok: false, error: "Could not remove tiers." }; }
  const ids: string[] = [];
  for (const [i, t] of tiers.entries()) {
    const ex = (existing ?? []).find(x => x.id === t.id);
    // Before launch tiers stay draft/hidden; once live, switching a tier off pauses it and back on restores sale timing.
    const status = !t.enabled ? (live ? "paused" : "hidden") : !live ? "draft" : ex && ["on_sale", "scheduled", "sold_out"].includes(ex.status) ? ex.status : t.after >= 0 || (t.sale_start && Date.parse(t.sale_start) > Date.now()) ? "scheduled" : "on_sale";
    const row = { name: t.name, description: t.description, kind: t.kind, price: t.price, quantity: t.quantity, sale_start: t.sale_start, sale_end: t.sale_end, release_name: t.release_name ?? "", order_limit: Math.min(t.order_limit, sales.order_limit), image: t.image, badge: t.badge, color: t.color, sort: i + 1, status, after_tier: null, valid_from: t.valid_from, valid_to: t.valid_to };
    const res = ex ? await sb.from("ticket_tiers").update(row).eq("id", ex.id).eq("event_id", o.e.id).select("id").single() : await sb.from("ticket_tiers").insert({ ...row, event_id: o.e.id }).select("id").single();
    if (res.error || !res.data) return { ok: false, error: `Could not save ${t.name}.` };
    ids.push(res.data.id);
  }
  for (const [i, t] of tiers.entries()) if (t.after >= 0) await sb.from("ticket_tiers").update({ after_tier: ids[t.after]! }).eq("id", ids[i]!);
  const { data: codes } = await sb.from("discount_codes").select("id,used").eq("event_id", o.e.id).eq("purpose", "discount");
  for (const c of (codes ?? []).filter(c => !promos.some(x => x.id === c.id))) await (c.used > 0 ? sb.from("discount_codes").update({ status: "disabled" }).eq("id", c.id) : sb.from("discount_codes").delete().eq("id", c.id));
  for (const x of promos) {
    const row = { code: x.code, kind: x.kind, amount: x.amount, valid_from: x.valid_from, valid_until: x.valid_until, max_uses: x.max_uses, status: !sales.discount_codes ? "disabled" : x.valid_from && Date.parse(x.valid_from) > Date.now() ? "scheduled" : "active" };
    const res = x.id ? await sb.from("discount_codes").update(row).eq("id", x.id).eq("event_id", o.e.id) : await sb.from("discount_codes").insert({ ...row, event_id: o.e.id });
    if (res.error) return { ok: false, error: res.error.code === "23505" ? `${x.code} is already used for this event.` : `Could not save ${x.code}.` };
  }
  const allocTotal = allocations.reduce((a, x) => a + (x.qty ?? 0), 0);
  if (allocTotal > total) return { ok: false, error: "Promoter allocations can't exceed your total tickets." };
  for (const a of allocations) await sb.from("promoters").update({ ticket_allocation: a.qty }).eq("id", a.id).eq("event_id", o.e.id);
  const error = await writeSettings(o, { phases, sales }, { order_limit: sales.order_limit, resale: sales.resale, countdown: sales.countdown, waiting_list: sales.waiting_list, show_remaining: sales.show_remaining });
  if (error) return { ok: false, error: "Could not save sales settings." };
  bump(o.e.id, o.e.slug); return { ok: true, message: "Tiers and releases saved." };
}

/** Step 3 · Seating & allocation: which tiers sell from which section, and how many places are held back. */
export async function saveAllocation(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await access(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = AllocIn.safeParse(input); if (!p.success) return { ok: false, error: "Check your sections and holds." };
  const { data: tiers } = await o.ctx.supabase.from("ticket_tiers").select("id,name,quantity").eq("event_id", o.e.id);
  const known = new Set((tiers ?? []).map(t => t.id));
  for (const s of p.data.sections) {
    if (s.tiers.some(t => !known.has(t))) return { ok: false, error: "A section references a tier that no longer exists — reload and try again." };
    if (s.holds > s.capacity) return { ok: false, error: `${s.name}: holds can't exceed the section capacity.` };
  }
  const sum = p.data.sections.reduce((a, s) => a + s.capacity, 0); const capacity = Number(o.pro.capacity) || 0;
  if (capacity && sum > capacity) return { ok: false, error: `Sections add up to ${sum.toLocaleString("en-GB")} — more than the ${capacity.toLocaleString("en-GB")} event capacity.` };
  for (const t of tiers ?? []) {
    const secs = p.data.sections.filter(s => s.tiers.includes(t.id));
    const room = secs.reduce((a, s) => a + s.capacity - s.holds, 0);
    if (secs.length && t.quantity > room) return { ok: false, error: `${t.name} has ${t.quantity.toLocaleString("en-GB")} tickets but its sections only fit ${room.toLocaleString("en-GB")} after holds.` };
    await o.ctx.supabase.from("ticket_tiers").update({ allocation: secs.length ? secs.map(s => s.name).join(", ").slice(0, 200) : "" }).eq("id", t.id);
  }
  const error = await writeSettings(o, { sections: p.data.sections });
  if (error) return { ok: false, error: "Could not save allocation." };
  bump(o.e.id, o.e.slug); return { ok: true, message: "Seating and allocation saved." };
}

/** Step 4 · Access & controls: transfers, resale, refunds, buyer questions, fee display, terms, comps and accessibility. */
export async function saveAccess(eventId: string, input: unknown): Promise<ActionResult> {
  const o = await access(eventId); if ("error" in o) return { ok: false, error: o.error };
  const p = AccessIn.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path.includes("label") ? "Give each custom question a label (2–80 characters)." : "Check your access settings." };
  const a = p.data;
  if (a.refund === "date") {
    if (!a.refund_cutoff) return { ok: false, error: "Choose the refund cut-off date." };
    if (o.e.starts_at && Date.parse(a.refund_cutoff) >= Date.parse(o.e.starts_at)) return { ok: false, error: "The refund cut-off must be before the event." };
  }
  for (const k of ["full_name", "email"]) { const q = a.questions.find(x => x.key === k); if (!q?.on || !q.required) return { ok: false, error: "Full name and email are always required at checkout." }; }
  const cut = a.refund_cutoff ? new Date(a.refund_cutoff).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";
  const refundText = { none: "No refunds (all sales are final)", date: `${a.refund_amount === 100 ? "Full" : "50%"} refund available until ${cut}`, flexible: "Refunds available up to 24 hours before the event", cancel: "Refunds only if the event is cancelled" }[a.refund];
  const error = await writeSettings(o, { access: a }, { transfers: a.transfers, resale: a.resale, refund_policy: a.refund === "none" ? "none" : a.refund === "cancel" ? "custom" : "7days", refund_text: refundText, fee_display: a.fee_display, buyer_questions: a.questions.filter(q => q.on).map(({ key, label, required }) => ({ key, label, required })), age_restriction: a.age_message ? a.age_text : null, ticket_display: a.ticket_display, ticket_display_switch: a.ticket_display_switch });
  if (error) return { ok: false, error: "Could not save access settings." };
  bump(o.e.id, o.e.slug); return { ok: true, message: "Access and controls saved." };
}

/** Step 5 · Activate: switches tiers on sale (or scheduled / waiting on a release rule) and publishes the event page. */
export async function activateTickets(eventId: string, agreed: boolean): Promise<ActionResult> {
  const o = await access(eventId); if ("error" in o) return { ok: false, error: o.error };
  if (!agreed) return { ok: false, error: "Please confirm the ticketing terms." };
  if (!o.e.starts_at || Date.parse(o.e.starts_at) < Date.now()) return { ok: false, error: "Your event needs a future date before tickets can go on sale." };
  const sb = o.ctx.supabase;
  const { data: tiers } = await sb.from("ticket_tiers").select("id,price,sale_start,status,after_tier,quantity,sold").eq("event_id", o.e.id);
  const active = (tiers ?? []).filter(t => !["hidden", "paused"].includes(t.status));
  if (!active.length) return { ok: false, error: "Switch on at least one ticket tier." };
  if (active.some(t => !t.sale_start && !t.after_tier)) return { ok: false, error: "Every active tier needs a sale start or a release rule." };
  if (!o.pro.access) return { ok: false, error: "Review Access & Controls before activating." };
  if (active.some(t => Number(t.price) > 0)) {
    const { data: ws } = await sb.from("workspaces").select("payout_status").eq("id", o.ctx.workspace.id).maybeSingle();
    if (ws?.payout_status !== "active") return { ok: false, error: "Finish payout setup in Money before selling paid tickets." };
  }
  const status = ["draft", "planning", "ready", "published"].includes(o.e.status) ? "on_sale" : o.e.status;
  // W11: going on sale is a lifecycle transition. Preview its preconditions (event-type, ticketing policy, composition, venue,
  // payouts…) before touching any tier; "tickets" is ignored here because this step is what opens the tiers.
  if (status !== o.e.status) {
    const { data: pre } = await untyped(sb).rpc("event_lifecycle_blockers", { p_event: o.e.id, p_to: status });
    const blockers = ((pre ?? []) as EventBlocker[]).filter(b => b.key !== "tickets");
    if (blockers.length) return { ok: false, error: `Before tickets can go on sale: ${blockers.map(b => b.label.replace(/\.$/, "")).join("; ")}.`, data: { blockers } };
  }
  const now = Date.now(); const changed: { id: string; from: string }[] = [];
  const revert = async () => { for (const c of changed.reverse()) await sb.from("ticket_tiers").update({ status: c.from }).eq("id", c.id); };
  const setTier = async (t: { id: string; status: string }, to: string) => {
    if (to === t.status) return null;
    const { error } = await sb.from("ticket_tiers").update({ status: to }).eq("id", t.id);
    if (error) return /blocked_by_dependencies/.test(error.message) ? "A ticket tier is waiting on a dependency (Plan › Dependencies) before it can go on sale." : error.code === "22023" ? error.message.replace(/^[a-z_]+:\s*/, "") : "Could not open a ticket tier.";   // ticketing policy guard: '<code>: <reason>'
    changed.push({ id: t.id, from: t.status }); t.status = to; return null;
  };
  for (const t of active) {
    const to = t.sold >= t.quantity && t.quantity > 0 ? "sold_out" : t.after_tier ? "scheduled" : Date.parse(t.sale_start!) > now ? "scheduled" : "on_sale";
    const err = await setTier(t, to); if (err) { await revert(); return { ok: false, error: err }; }
  }
  // A tier released "after" one that is already sold out opens straight away.
  const soldOut = new Set(active.filter(t => t.sold >= t.quantity && t.quantity > 0).map(t => t.id));
  for (const t of active) if (t.after_tier && soldOut.has(t.after_tier)) { const err = await setTier(t, "on_sale"); if (err) { await revert(); return { ok: false, error: err }; } }
  const slug = o.e.slug ?? `${o.e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${randomBytes(3).toString("hex")}`;
  const { error } = await sb.from("events").update({ slug, settings: { ...o.settings, ticketing_live: true, ticket_pro: { ...o.pro, activated_at: new Date().toISOString() } } as Json, updated_at: new Date().toISOString() }).eq("id", o.e.id);
  if (error) { await revert(); return { ok: false, error: "Could not activate tickets." }; }
  if (status !== o.e.status) {
    // Through the guarded lifecycle command (permission, state machine, preconditions, audit), never a direct status write.
    const t = await transitionEvent(sb, o.e.id, status, o.e.status);
    if (!t.ok) { await revert(); await sb.from("events").update({ settings: o.settings as Json }).eq("id", o.e.id); return { ok: false, error: t.error ?? "Could not put the event on sale.", data: t.data }; }
  }
  bump(o.e.id, slug); return { ok: true, message: "Tickets are live!", redirect: `/organizer/events/${o.e.id}?tab=sell` };
}
