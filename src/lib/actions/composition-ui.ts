"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Lane D · S4 — organiser UI actions over the Q40 composition commands (migrations 202610291042–1046): Plan › Structure,
 * Plan › Forms & waivers, Operations › Merch & stock, Lost property and Sustainability. All rules live in SQL (series engine,
 * overrides, composition guards, pass components, versioned forms/waivers, append-only stock, lp-v1 matching, factors);
 * these validate shape, translate error codes and revalidate the event page.
 */
const Id = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Iso = z.string().datetime({ offset: true });

const why = (m: string) =>
  /not_authorized|42501/.test(m) ? "You don't have permission to do that."
  : /sold_out/.test(m) ? "Not enough tickets left for every date in this pass."
  : /outside_parent_window/.test(m) ? "Sub-events must sit inside the parent event's dates."
  : /composition_cycle|composition_too_deep/.test(m) ? "That would nest events in a loop or more than three levels deep."
  : /day_outside_event/.test(m) ? "Days must fall within the event's dates." : /venue_outside_event/.test(m) ? "Venue times must fall within the event's dates."
  : /room_capacity_exceeded/.test(m) ? "Room tickets can't exceed the room's capacity." : /venue_not_found/.test(m) ? "That venue listing wasn't found."
  : /invalid_recurrence/.test(m) ? "Check the repeat pattern (count up to 104 or an end date)." : /field_not_editable/.test(m) ? "That field can't be edited across a series."
  : /no_recurrence/.test(m) ? "Add a repeat pattern to the series before generating dates." : /series_archived/.test(m) ? "This series is archived."
  : /new_date_in_past/.test(m) ? "Choose a future date." : /not_an_occurrence/.test(m) ? "This event isn't part of a series."
  : /pass_already_selling/.test(m) ? "This pass has sales — its dates are frozen now." : /pass_needs_two_components/.test(m) ? "A pass needs at least two dates."
  : /component_not_composed/.test(m) ? "Pass dates must belong to this event, its sub-events or the same series." : /invalid_component/.test(m) ? "A pass can't include another pass."
  : /event_not_in_workspace/.test(m) ? "Choose an event from this workspace." : /invalid_timezone/.test(m) ? "Choose a valid time zone."
  : /form_version_immutable|waiver_version_immutable/.test(m) ? "Published versions can't be edited — save a new version instead."
  : /invalid_field/.test(m) ? "Each field needs a key (lowercase letters, numbers, _) and a supported type." : /waiver_not_published/.test(m) ? "Publish the waiver before attaching it."
  : /tier_not_in_event/.test(m) ? "Choose ticket types from this event." : /invalid_decision/.test(m) ? "This response has already been decided."
  : /insufficient_stock/.test(m) ? "Not enough stock for that movement." : /stock_item_required/.test(m) ? "Link the merch item to a merchandise stock item."
  : /stock_items_sku|duplicate key/.test(m) ? "That SKU is already used in this workspace."
  : /already_collected/.test(m) ? "This order was already collected." : /wrong_code/.test(m) ? "That collection code doesn't match." : /not_paid/.test(m) ? "This order hasn't been paid."
  : /item_unavailable/.test(m) ? "That item is no longer available to claim." : /not_a_candidate/.test(m) ? "That item isn't a match for this report."
  : /claim_not_verified/.test(m) ? "Verify the claim before marking it collected." : /claim_closed/.test(m) ? "This claim has already been decided."
  : /unknown_factor|unit_mismatch/.test(m) ? "Choose a factor and its unit." : /split_must_total_1/.test(m) ? "Travel shares must add up to 100%." : /invalid_distance/.test(m) ? "Distance must be between 1 and 2,000 km."
  : /tier_has_sales/.test(m) ? "This ticket type has sales or holds — its day, room and venues are fixed now."
  : /pass_tier_not_day_bound/.test(m) ? "A pass spans several dates, so it can't be limited to one day."
  : /day_not_in_event/.test(m) ? "Choose a day of this event." : /day_cancelled/.test(m) ? "That day is cancelled — choose another day."
  : /tier_outside_day/.test(m) ? "The ticket's valid times fall outside that day." : /item_outside_day/.test(m) ? "This programme item starts outside that day's hours."
  : /shift_outside_day/.test(m) ? "This shift is more than six hours outside that day's hours." : /venue_not_in_event/.test(m) ? "Choose one of this event's venues."
  : /room_not_at_event_venue|space_not_at_event_venue/.test(m) ? "That room isn't at one of this event's venues."
  : /programme_overlap: (.+)/.test(m) ? `Room clash: ${/programme_overlap: (.+)/.exec(m)![1]}.` : /invalid_binding|invalid_kind/.test(m) ? "Check the binding."
  : /waiver_not_draft/.test(m) ? "Only unpublished drafts can be retired." : /invalid_reason/.test(m) ? "Keep the reason under 500 characters."
  : /already_disposed/.test(m) ? "This item has already been disposed of." : /item_claimed_or_returned/.test(m) ? "Claimed or returned items can't be disposed of."
  : /item_has_open_claim/.test(m) ? "Decide the open claim on this item first." : /retention_not_elapsed/.test(m) ? "This item is still inside its retention period — it can be disposed of after its dispose-after date."
  : /reason_required/.test(m) ? "Give a reason of at least 5 characters." : /invalid_method/.test(m) ? "Choose how the item was disposed of."
  : /rate_limited|54000/.test(m) ? "Too many requests — try again shortly."
  : /illegal|transition/.test(m) ? "That status change isn't allowed right now." : /check constraint|22P02|22023/.test(m) ? "Check the values entered."
  : /not_found|P0002/.test(m) ? "Not found." : "Something went wrong. Please try again.";

async function db() { return untyped(await createClient()); }
async function rpc<T>(fn: string, args: Record<string, unknown>, eventId: string, message?: string): Promise<ActionResult<T>> {
  const { data, error } = await (await db()).rpc(fn, args);
  if (error) return { ok: false, error: why(error.message) };
  revalidatePath(`/organizer/events/${eventId}`);
  return { ok: true, data: data as T, message };
}
async function wsOf(eventId: string) {
  const { data } = await (await db()).from("events").select("workspace_id").eq("id", eventId).maybeSingle();
  return (data as { workspace_id: string | null } | null)?.workspace_id ?? null;
}
const bad = (error: string) => ({ ok: false as const, error });

// ── Series / recurring / tours ──
const Recurrence = z.object({ freq: z.enum(["daily", "weekly", "monthly"]), interval: z.number().int().min(1).max(52), byweekday: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  start_date: Day, start_time: Hm, duration_minutes: z.number().int().min(15).max(20160), count: z.number().int().min(1).max(104).optional(), until: Day.optional() });
const SeriesIn = z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(["series", "recurring", "tour", "festival", "conference"]), visibility: z.enum(["private", "public"]),
  timezone: z.string().min(2).max(60), description: z.string().max(4000).optional(), recurrence: Recurrence.optional() });
/** Creates a series with this event as its anchor (occurrence 0). Recurring series can then generate their dates. */
export async function createSeriesFromEvent(eventId: string, input: unknown) {
  const p = SeriesIn.safeParse(input); if (!Id.safeParse(eventId).success || !p.success) return bad("Check the series details.");
  if (p.data.recurrence && !p.data.recurrence.count && !p.data.recurrence.until) return bad("Set how many dates (up to 104) or an end date.");
  const ws = await wsOf(eventId); if (!ws) return bad("Event not found.");
  return rpc<{ id: string; slug: string }>("create_event_series", { p_workspace: ws, p_series: { ...p.data, anchor_event_id: eventId } }, eventId, "Series created");
}
export async function generateSeriesDates(eventId: string, seriesId: string, limit: number) {
  if (!Id.safeParse(seriesId).success || !Number.isInteger(limit) || limit < 1 || limit > 104) return bad("Choose up to 104 dates.");
  const r = await rpc<{ created: number; existing: number; skipped_past: number }>("generate_series_occurrences", { p_series: seriesId, p_limit: limit }, eventId);
  return r.ok && r.data ? { ...r, message: `${r.data.created} date(s) created · ${r.data.existing} already existed · ${r.data.skipped_past} in the past skipped` } : r;
}
export async function addSeriesTourDate(eventId: string, seriesId: string, startsLocal: string, duration: number, venue: { venue_name: string; city: string }) {
  if (!Id.safeParse(seriesId).success || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsLocal) || !Number.isInteger(duration) || duration < 15 || duration > 20160) return bad("Choose a date, time and duration.");
  if (venue.venue_name.trim().length < 2 || venue.city.trim().length < 2) return bad("Add the venue name and city.");
  return rpc<{ id: string }>("add_tour_date", { p_series: seriesId, p_starts_local: `${startsLocal}:00`, p_duration_minutes: duration, p_venue: { venue_name: venue.venue_name.trim(), city: venue.city.trim() } }, eventId, "Tour date added");
}
const Patch = z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().max(4000).optional(), capacity: z.number().int().min(1).max(1_000_000).optional(),
  venue_name: z.string().trim().min(2).max(160).optional(), city: z.string().trim().min(2).max(80).optional(), start_time: Hm.optional(), duration_minutes: z.number().int().min(15).max(20160).optional() }).strict();
export async function editSeriesDates(eventId: string, patch: unknown, scope: string, expectedVersion: number | null) {
  const p = Patch.safeParse(patch); if (!p.success || !Object.keys(p.data).length || !["this", "following", "all"].includes(scope)) return bad("Change at least one field.");
  const r = await rpc<{ ok: boolean; changed: number; skipped: { event_id: string; field: string; reason: string }[]; conflict?: boolean }>("series_edit", { p_event: eventId, p_patch: p.data, p_scope: scope, p_expected_series_version: expectedVersion }, eventId);
  if (r.ok && r.data?.conflict) return bad("The series changed since you opened it — refresh and try again.");
  return r.ok && r.data ? { ...r, message: `${r.data.changed} date(s) updated${r.data.skipped.length ? ` · ${r.data.skipped.length} field(s) skipped (local overrides)` : ""}` } : r;
}
export async function detachFromSeries(eventId: string) { return Id.safeParse(eventId).success ? rpc("detach_occurrence", { p_event: eventId }, eventId, "Detached from the series") : bad("Invalid event."); }

// ── Parent / child, cascade ──
const Sub = z.object({ name: z.string().trim().min(2).max(120), role: z.enum(["stage", "track", "session", "day", "sub_event"]), starts_at: Iso.optional(), ends_at: Iso.optional(), capacity: z.number().int().min(1).max(1_000_000).optional() });
export async function addChildEvent(eventId: string, input: unknown) {
  const p = Sub.safeParse(input); if (!Id.safeParse(eventId).success || !p.success) return bad("Give the sub-event a name and type.");
  if (p.data.starts_at && p.data.ends_at && Date.parse(p.data.ends_at) <= Date.parse(p.data.starts_at)) return bad("The sub-event must end after it starts.");
  return rpc<{ id: string }>("add_sub_event", { p_parent: eventId, p_sub: p.data }, eventId, "Sub-event added");
}
const EventTo = z.enum(["planning", "ready", "published", "on_sale", "live", "completed", "closed", "archived", "cancelled", "postponed", "suspended"]);
export async function cascadeEventStatus(eventId: string, to: string, childAction: string, reason: string) {
  if (!Id.safeParse(eventId).success || !EventTo.safeParse(to).success || !["same", "detach"].includes(childAction)) return bad("Choose a status and what happens to sub-events.");
  if (["cancelled", "postponed", "suspended"].includes(to) && reason.trim().length < 10) return bad("Give a reason of at least 10 characters.");
  const r = await rpc<{ ok: boolean; error?: string; blockers?: { label: string }[]; children: { action: string }[] }>("cascade_event_transition", { p_event: eventId, p_to: to, p_child_action: childAction, p_reason: reason.trim() || null }, eventId);
  if (!r.ok || !r.data) return r;
  if (!r.data.ok) return bad(r.data.blockers?.length ? `Resolve first: ${r.data.blockers.map(b => b.label).join("; ")}` : "The event couldn't move to that status — check its readiness.");
  const failed = r.data.children.filter(c => ["failed", "skipped"].includes(c.action)).length;
  return { ok: true, message: `Moved with ${r.data.children.length} sub-event(s)${failed ? ` · ${failed} skipped or failed` : ""}`, data: r.data };
}

// ── Venues, days, passes ──
const Venue = z.object({ id: Id.optional(), venue_name: z.string().trim().min(2).max(160), role: z.enum(["primary", "secondary", "satellite"]), starts_at: Iso.optional(), ends_at: Iso.optional(), capacity: z.number().int().min(1).max(1_000_000).optional() });
export async function saveEventVenues(eventId: string, venues: unknown) {
  const p = z.array(Venue).max(20).safeParse(venues); if (!Id.safeParse(eventId).success || !p.success) return bad("Check each venue's name and role.");
  if (p.data.filter(v => v.role === "primary").length > 1) return bad("Only one venue can be primary.");
  return rpc("set_event_venues", { p_event: eventId, p_venues: p.data }, eventId, "Venues saved");
}
const DayIn = z.object({ date: Day, label: z.string().trim().max(80).optional(), start_time: Hm, end_time: Hm, event_venue_id: Id.optional(), status: z.enum(["scheduled", "cancelled"]) });
export async function saveEventDays(eventId: string, days: unknown) {
  const p = z.array(DayIn).min(1).max(60).safeParse(days); if (!Id.safeParse(eventId).success || !p.success) return bad("Check each day's date and times.");
  return rpc("set_event_days", { p_event: eventId, p_days: p.data }, eventId, "Days saved");
}
export async function savePassComponents(eventId: string, passTierId: string, kind: string, components: unknown) {
  const p = z.array(z.object({ tier_id: Id, units: z.number().int().min(1).max(10) })).min(2).max(60).safeParse(components);
  if (!Id.safeParse(passTierId).success || !["season", "multi_day", "multi_venue", "series"].includes(kind)) return bad("Choose a pass type.");
  if (!p.success) return bad("A pass needs at least two dates.");
  if (p.data.some(c => c.tier_id === passTierId)) return bad("A pass can't include itself.");
  return rpc("set_pass_components", { p_pass_tier: passTierId, p_kind: kind, p_components: p.data }, eventId, "Pass saved");
}

/** Day / room / venue bindings (202610294039 set_composition_binding). A key with null (or an empty venue list) unbinds. */
const Binding = z.object({ event_day_id: Id.nullable().optional(), space_id: Id.nullable().optional(), valid_venue_ids: z.array(Id).max(20).nullable().optional(), event_venue_id: Id.nullable().optional() }).strict();
const BIND_KEYS: Record<string, string[]> = { ticket_tier: ["event_day_id", "space_id", "valid_venue_ids"], shift: ["event_day_id", "space_id", "event_venue_id"], programme_item: ["event_day_id", "space_id"] };
export async function bindComposition(eventId: string, kind: string, id: string, binding: unknown) {
  const p = Binding.safeParse(binding);
  if (!Id.safeParse(eventId).success || !Id.safeParse(id).success || !BIND_KEYS[kind] || !p.success || !Object.keys(p.data).length) return bad("Check the binding.");
  if (Object.keys(p.data).some(k => !BIND_KEYS[kind]!.includes(k))) return bad("That binding doesn't apply here.");
  const unbinding = Object.values(p.data).every(v => v === null || (Array.isArray(v) && !v.length));
  return rpc<Record<string, unknown>>("set_composition_binding", { p_kind: kind, p_id: id, p_binding: p.data }, eventId, unbinding ? "Unbound" : "Binding saved");
}

// ── Forms and waivers ──
const Field = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: z.string().trim().min(1).max(200), type: z.enum(["text", "textarea", "number", "email", "phone", "date", "select", "multiselect", "checkbox", "consent", "signature"]),
  required: z.boolean(), options: z.array(z.string().trim().min(1).max(80)).max(40).optional(), max_length: z.number().int().min(1).max(20000).optional() });
const FormIn = z.object({ title: z.string().trim().min(2).max(140), audience: z.enum(["guest", "provider", "client", "staff", "custom"]), kind: z.enum(["form", "consent"]), fields: z.array(Field).max(80) });
export async function saveEventFormVersion(eventId: string, familyId: string | null, input: unknown, publish: boolean) {
  const p = FormIn.safeParse(input); if (!Id.safeParse(eventId).success || (familyId && !Id.safeParse(familyId).success)) return bad("Invalid form.");
  if (!p.success) return bad(p.error.issues.some(i => i.path.includes("key")) ? "Field keys use lowercase letters, numbers and _ and start with a letter." : "Check the form title and fields.");
  if (new Set(p.data.fields.map(f => f.key)).size !== p.data.fields.length) return bad("Each field needs a unique key.");
  if (p.data.fields.some(f => ["select", "multiselect"].includes(f.type) && !(f.options?.length))) return bad("Choice fields need at least one option.");
  if (publish && !p.data.fields.length) return bad("Add at least one field before publishing.");
  return rpc<{ id: string; family_id: string; version: number; status: string }>("save_event_form", { p_event: eventId, p_family: familyId, p_form: p.data, p_publish: publish }, eventId, publish ? "Form published" : "Draft saved");
}
export async function decideFormResponse(eventId: string, responseId: string, decision: string) {
  if (!Id.safeParse(responseId).success || !["accepted", "rejected"].includes(decision)) return bad("Invalid decision.");
  return rpc("decide_form_response", { p_response: responseId, p_decision: decision }, eventId, decision === "accepted" ? "Response accepted" : "Response rejected");
}
const WaiverIn = z.object({ title: z.string().trim().min(2).max(140), body: z.string().trim().min(20).max(40000), minors_allowed: z.boolean(), adult_age: z.number().int().min(16).max(21) });
export async function saveWaiverDraft(eventId: string, familyId: string | null, input: unknown) {
  const p = WaiverIn.safeParse(input); if (!p.success) return bad("Waivers need a title and at least 20 characters of text.");
  if (familyId && !Id.safeParse(familyId).success) return bad("Invalid waiver.");
  const ws = await wsOf(eventId); if (!ws) return bad("Event not found.");
  return rpc<{ id: string; family_id: string; version: number }>("save_waiver_template", { p_workspace: ws, p_family: familyId, p_waiver: p.data, p_from_version: null }, eventId, "Waiver draft saved");
}
export async function publishWaiverVersion(eventId: string, templateId: string) { return Id.safeParse(templateId).success ? rpc("publish_waiver_template", { p_template: templateId }, eventId, "Waiver published — the previous version is retired") : bad("Invalid waiver."); }
/** Retires an unpublished draft version (202610294040 retire_waiver_draft). Published versions retire only by publishing a successor. */
export async function retireWaiverDraft(eventId: string, templateId: string, reason: string) {
  if (!Id.safeParse(eventId).success || !Id.safeParse(templateId).success) return bad("Invalid waiver.");
  if (reason.length > 500) return bad("Keep the reason under 500 characters.");
  return rpc("retire_waiver_draft", { p_template: templateId, p_reason: reason.trim() || null }, eventId, "Draft retired");
}
export async function attachWaiver(eventId: string, templateId: string, tierIds: string[] | null, active: boolean) {
  if (!Id.safeParse(templateId).success || (tierIds && !z.array(Id).max(100).safeParse(tierIds).success)) return bad("Choose a waiver.");
  return rpc("set_event_waiver", { p_event: eventId, p_template: templateId, p_tier_ids: tierIds && tierIds.length ? tierIds : null, p_active: active }, eventId, active ? "Waiver required for this event" : "Waiver no longer required");
}

// ── Stock and merchandise ──
const StockIn = z.object({ name: z.string().trim().min(2).max(120), category: z.enum(["consumable", "equipment", "furniture", "bar_stock", "merchandise"]), sku: z.string().regex(/^[A-Za-z0-9\-_.]{1,40}$/).optional(),
  unit: z.string().trim().min(1).max(20), reorder_level: z.number().int().min(0).max(1_000_000).optional(), event_only: z.boolean() });
export async function createStockItem(eventId: string, input: unknown) {
  const p = StockIn.safeParse(input); if (!p.success) return bad("Check the item name, SKU (letters, numbers, - _ .) and unit.");
  const ws = await wsOf(eventId); if (!ws) return bad("Event not found.");
  const { event_only, ...d } = p.data;
  return rpc<{ id: string }>("save_stock_item", { p_workspace: ws, p_item: null, p_data: { ...d, event_id: event_only ? eventId : null } }, eventId, "Stock item added");
}
export async function moveStock(eventId: string, itemId: string, kind: string, quantity: number, reason: string, requestId: string, delta?: number) {
  if (!Id.safeParse(itemId).success || !["receive", "issue", "return", "waste", "adjust", "count"].includes(kind) || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return bad("Choose a movement.");
  if (kind === "adjust" ? !Number.isInteger(delta) || delta === 0 || Math.abs(delta!) > 1_000_000 : !Number.isInteger(quantity) || quantity < (kind === "count" ? 0 : 1) || quantity > 1_000_000) return bad("Enter a whole-number quantity.");
  if (["adjust", "waste"].includes(kind) && reason.trim().length < 3) return bad("Give a reason for adjustments and waste.");
  return rpc<{ on_hand: number; replayed?: boolean }>("record_stock_movement", { p_item: itemId, p_kind: kind, p_quantity: kind === "adjust" ? Math.abs(delta!) : quantity, p_event: eventId, p_reason: reason.trim() || null, p_request_id: requestId, p_delta: kind === "adjust" ? delta : null }, eventId, "Movement recorded");
}
export async function transferStockBetween(eventId: string, fromId: string, toId: string, quantity: number, reason: string) {
  if (!Id.safeParse(fromId).success || !Id.safeParse(toId).success || fromId === toId) return bad("Choose two different items of the same category.");
  if (!Number.isInteger(quantity) || quantity < 1) return bad("Enter a whole-number quantity.");
  return rpc("transfer_stock", { p_from: fromId, p_to: toId, p_quantity: quantity, p_reason: reason.trim() || null }, eventId, "Stock transferred");
}
const MerchIn = z.object({ name: z.string().trim().min(2).max(120), stock_item_id: Id, price_minor: z.number().int().min(0).max(1_000_000), vat_rate_bps: z.number().int().min(0).max(10000), per_order_limit: z.number().int().min(1).max(100), status: z.enum(["draft", "on_sale", "off_sale"]) });
export async function createMerchItem(eventId: string, input: unknown) {
  const p = MerchIn.safeParse(input); if (!p.success) return bad("Check the name, price and stock item.");
  const ws = await wsOf(eventId); if (!ws) return bad("Event not found.");
  return rpc<{ id: string }>("save_merch_item", { p_workspace: ws, p_item: null, p_data: { ...p.data, event_id: eventId } }, eventId, "Merch item added");
}
export async function setMerchStatus(eventId: string, itemId: string, status: string) {
  if (!Id.safeParse(itemId).success || !["draft", "on_sale", "off_sale"].includes(status)) return bad("Invalid status.");
  const ws = await wsOf(eventId); if (!ws) return bad("Event not found.");
  return rpc("save_merch_item", { p_workspace: ws, p_item: itemId, p_data: { status } }, eventId, status === "on_sale" ? "Now on sale" : status === "off_sale" ? "Taken off sale" : "Moved to draft");
}
export async function collectMerchOrder(eventId: string, orderRef: string, code: string) {
  if (!/^GD-M-[A-Z0-9]{10}$/.test(orderRef.trim().toUpperCase()) || !/^[A-Za-z0-9]{6,12}$/.test(code.trim())) return bad("Enter the order reference (GD-M-…) and the buyer's collection code.");
  const r = await rpc<{ ok: boolean; error?: string }>("merch_collect", { p_order_ref: orderRef.trim().toUpperCase(), p_code: code.trim() }, eventId);
  if (!r.ok || !r.data) return r;
  return r.data.ok ? { ok: true, message: "Order collected" } : bad(why(r.data.error ?? ""));
}

// ── Lost property ──
const Cat = z.enum(["phone", "wallet", "bag", "keys", "clothing", "jewellery", "documents", "electronics", "other"]);
const Found = z.object({ category: Cat, description: z.string().trim().min(3).max(1000), colour: z.string().trim().max(40).optional(), brand: z.string().trim().max(60).optional(), location: z.string().trim().max(120).optional(), storage_location: z.string().trim().max(120).optional(), found_at: Iso.optional() });
export async function logFoundItem(eventId: string, input: unknown) { const p = Found.safeParse(input); return p.success ? rpc("log_found_item", { p_event: eventId, p_item: p.data }, eventId, "Found item logged") : bad("Describe the item (at least 3 characters)."); }
const Lost = Found.omit({ storage_location: true, found_at: true }).extend({ contact_email: z.string().email().max(200).optional(), lost_from: Iso.optional(), lost_to: Iso.optional() });
export async function recordLostReport(eventId: string, input: unknown) { const p = Lost.safeParse(input); return p.success ? rpc("report_lost_item", { p_event: eventId, p_report: p.data }, eventId, "Lost report recorded") : bad("Describe the item and check the contact email."); }
export async function claimFoundItem(eventId: string, reportId: string, itemId: string, note: string) {
  if (!Id.safeParse(reportId).success || !Id.safeParse(itemId).success) return bad("Choose a match.");
  return rpc("claim_found_item", { p_report: reportId, p_item: itemId, p_evidence: note.trim() ? { note: note.trim().slice(0, 500) } : {} }, eventId, "Claim opened");
}
export async function decideLostPropertyClaim(eventId: string, claimId: string, decision: string, note: string) {
  if (!Id.safeParse(claimId).success || !["verified", "failed", "manual_review", "collected"].includes(decision)) return bad("Invalid decision.");
  if (["verified", "failed"].includes(decision) && note.trim().length < 3) return bad("Note how ownership was checked (at least 3 characters).");
  return rpc("decide_lost_claim", { p_claim: claimId, p_decision: decision, p_note: note.trim().slice(0, 500) || null }, eventId, "Claim updated");
}

const DISPOSAL = ["donated", "destroyed", "recycled", "handed_to_police", "returned_to_venue", "other"] as const;
/** Disposal once the retention period has passed (202610294040 dispose_found_item); claimed / returned items are refused. */
export async function disposeFoundItem(eventId: string, itemId: string, method: string, reason: string) {
  if (!Id.safeParse(eventId).success || !Id.safeParse(itemId).success) return bad("Choose an item.");
  if (!(DISPOSAL as readonly string[]).includes(method)) return bad("Choose how the item was disposed of.");
  if (reason.trim().length < 5 || reason.length > 500) return bad("Give a reason of at least 5 characters.");
  return rpc("dispose_found_item", { p_item: itemId, p_reason: reason.trim(), p_method: method }, eventId, "Item marked as disposed");
}

// ── Sustainability ──
const Entry = z.object({ factor_key: z.string().regex(/^[a-z_]{3,40}$/).optional(), kind: z.enum(["waste", "energy", "water", "travel", "supplier", "note"]), quantity: z.number().min(0).max(100_000_000).optional(), unit: z.string().max(20).optional(),
  method: z.enum(["measured", "estimated"]), note: z.string().trim().max(2000).optional(), supplier_listing_id: Id.optional() });
export async function recordSustainabilityEntry(eventId: string, input: unknown) {
  const p = Entry.safeParse(input); if (!p.success) return bad("Choose a factor and enter a quantity.");
  if (p.data.kind === "note" ? !p.data.note : p.data.quantity == null || (p.data.kind !== "supplier" && !p.data.factor_key)) return bad(p.data.kind === "note" ? "Write the note." : "Choose a factor and enter a quantity.");
  return rpc("record_sustainability", { p_event: eventId, p_entries: [p.data] }, eventId, "Entry recorded");
}
export async function estimateTravel(eventId: string, avgKm: number, split: { car: number; rail: number; bus: number }) {
  if (!(avgKm > 0 && avgKm <= 2000)) return bad("Distance must be between 1 and 2,000 km.");
  const s = { car: split.car / 100, rail: split.rail / 100, bus: split.bus / 100 };
  if (Object.values(s).some(v => v < 0 || v > 1) || Math.abs(s.car + s.rail + s.bus - 1) > 0.01) return bad("Travel shares must add up to 100%.");
  return rpc<{ attendees: number }>("estimate_attendee_travel", { p_event: eventId, p_avg_km: avgKm, p_split: Object.fromEntries(Object.entries(s).filter(([, v]) => v > 0)) }, eventId, "Travel estimate updated");
}
