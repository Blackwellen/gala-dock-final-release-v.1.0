"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Venue hire, BEO, menus, catering and bar actions (§59–65). Rules live in RLS + RPCs; these validate shape and map errors.
export type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG: [RegExp, string][] = [
  [/not_authorized|42501|row-level security/, "You don’t have permission to do that."], [/space_conflict|23P01/, "That space is already booked or hard-held for this window."],
  [/invalid_space/, "Choose a space at this venue."], [/invalid_hold|invalid_window|invalid_alternative/, "Check the dates, times and hold length."],
  [/stale_version/, "A newer version was sent — review the latest one."], [/final_numbers_locked/, "Final numbers are locked for this event."],
  [/invalid_menu/, "That menu isn’t available for this booking."], [/invalid_guests/, "Enter a guest count."], [/check constraint|22023|23514/, "Some details aren’t valid — check the highlighted fields."],
  [/not_holdable|not_open/, "This has already moved on. Refresh to see the latest status."],
];
const fail = (e: { message?: string; code?: string }): Result => ({ ok: false, error: MSG.find(([re]) => re.test(`${e.message} ${e.code}`))?.[1] ?? "Something went wrong. Please try again." });
const iso = (v: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const paths = (...p: string[]) => { for (const x of p) revalidatePath(x, "page"); };
const ITEM = ["/provider/opportunities/[id]", "/organizer/marketplace/bookings/[id]", "/account/events/[id]/bookings/[item]"];

async function rpc<T>(fn: string, args: Record<string, unknown>, revalidate: string[]): Promise<Result<T>> {
  const sb = await createClient();
  const { data, error } = await sb.rpc(fn as never, args as never);
  if (error) return fail(error) as Result<T>;
  paths(...revalidate);
  return { ok: true, data: data as T };
}

// ── §60/§61 venue
export type VenueQuoteResult = { quote: Record<string, unknown>; conflicts: { level: string; reason: string }[] };
export async function quoteVenue(spaceId: string, starts: string, ends: string, guests: number): Promise<Result<VenueQuoteResult>> {
  if (!UUID.test(spaceId) || !iso(starts) || !iso(ends)) return { ok: false, error: "Choose a space and a time." };
  const sb = await createClient();
  const [{ data: quote, error }, { data: conflicts }] = await Promise.all([
    sb.rpc("venue_quote" as never, { p_space: spaceId, p_starts: iso(starts), p_ends: iso(ends), p_guests: Math.max(0, Math.round(guests)) } as never),
    sb.rpc("space_conflicts" as never, { p_space: spaceId, p_starts: iso(starts), p_ends: iso(ends) } as never),
  ]);
  if (error) return fail(error) as Result<VenueQuoteResult>;
  return { ok: true, data: { quote: quote as Record<string, unknown>, conflicts: (conflicts ?? []) as VenueQuoteResult["conflicts"] } };
}
export async function placeVenueHold(itemId: string, spaceId: string, starts: string, ends: string, hours: number, blocking: "soft" | "hard", note: string) {
  if (!UUID.test(itemId) || !UUID.test(spaceId)) return { ok: false, error: "Choose a space." } as Result;
  return rpc<string>("venue_place_hold", { p_item: itemId, p_space: spaceId, p_starts: iso(starts), p_ends: iso(ends), p_hours: Math.round(hours), p_blocking: blocking, p_note: note.slice(0, 1000) }, ITEM);
}
export async function offerAlternative(itemId: string, kind: "space" | "date" | "both", spaceId: string, starts: string, ends: string, price: string, note: string) {
  if (!UUID.test(itemId)) return { ok: false, error: "Not found." } as Result;
  return rpc<string>("venue_offer_alternative", { p_item: itemId, p_kind: kind, p_space: UUID.test(spaceId) ? spaceId : null, p_starts: iso(starts), p_ends: iso(ends), p_price: price ? Number(price) : null, p_note: note.slice(0, 1000) }, ITEM);
}
export async function decideAlternative(altId: string, accept: boolean) {
  if (!UUID.test(altId)) return { ok: false, error: "Not found." } as Result;
  return rpc("decide_venue_alternative", { p_alt: altId, p_accept: accept }, ITEM);
}

type RateCardInput = { id?: string; workspaceId: string; venueId: string; spaceId: string; name: string; model: string; amount: string; perPerson: string; minHours: string; minSpend: string;
  barMin: string; cateringMin: string; days: number[]; timeFrom: string; timeTo: string; seasonFrom: string; seasonTo: string; peak: boolean; setup: string; cleanup: string;
  overtime: string; securityFee: string; securityRequired: boolean; damageDeposit: string; depositPct: string; active: boolean };
const num = (v: string) => (v === "" || v == null ? null : Number(v));
export async function saveRateCard(i: RateCardInput) {
  if (!UUID.test(i.workspaceId) || !UUID.test(i.venueId)) return { ok: false, error: "Not found." } as Result;
  const sb = await createClient();
  const row = {
    workspace_id: i.workspaceId, venue_id: i.venueId, space_id: UUID.test(i.spaceId) ? i.spaceId : null, name: i.name.trim().slice(0, 80), model: i.model,
    amount: num(i.amount) ?? 0, per_person: num(i.perPerson), min_hours: num(i.minHours), min_spend: num(i.minSpend), bar_min: num(i.barMin), catering_min: num(i.cateringMin),
    days_of_week: i.days.filter(d => d >= 0 && d <= 6), time_from: i.timeFrom || null, time_to: i.timeTo || null, season_from: i.seasonFrom || null, season_to: i.seasonTo || null,
    peak: i.peak, active: i.active, updated_at: new Date().toISOString(),
    fees: Object.fromEntries(Object.entries({ setup: num(i.setup), cleanup: num(i.cleanup), overtime_hourly: num(i.overtime), security_fee: num(i.securityFee), security_required: i.securityRequired,
      damage_deposit: num(i.damageDeposit), booking_deposit_pct: num(i.depositPct) }).filter(([, v]) => v !== null && v !== false)),
  };
  const { error } = i.id && UUID.test(i.id) ? await sb.from("venue_rate_cards" as never).update(row as never).eq("id", i.id) : await sb.from("venue_rate_cards" as never).insert(row as never);
  if (error) return fail(error);
  paths("/provider/venues/[id]");
  return { ok: true } as Result;
}
export async function deleteRateCard(id: string) {
  if (!UUID.test(id)) return { ok: false, error: "Not found." } as Result;
  const sb = await createClient();
  const { error } = await sb.from("venue_rate_cards" as never).delete().eq("id", id);
  if (error) return fail(error);
  paths("/provider/venues/[id]");
  return { ok: true } as Result;
}

// ── §62 BEO
export async function saveEventOrder(jobId: string, content: Record<string, string>, financial: Record<string, string>, note: string, send: boolean) {
  if (!UUID.test(jobId)) return { ok: false, error: "Not found." } as Result;
  const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([k, v]) => /^[a-z_]{2,30}$/.test(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 4000)]));
  return rpc<string>("save_event_order", { p_job: jobId, p_content: clean(content), p_financial: clean(financial), p_note: note.slice(0, 500), p_send: send }, ["/provider/beo/[id]", ...ITEM]);
}
export async function approveEventOrder(orderId: string, version: number) {
  if (!UUID.test(orderId)) return { ok: false, error: "Not found." } as Result;
  return rpc("approve_event_order", { p_order: orderId, p_version: Math.round(version) }, ["/provider/beo/[id]", ...ITEM]);
}

// ── §63 menus & §65 bar (provider-managed; RLS limits to owners/managers of the workspace)
export async function saveMenu(i: { id?: string; workspaceId: string; listingId: string; name: string; kind: string; description: string; servingStyle: string; pricing: string; price: string;
  minGuests: string; maxGuests: string; serviceWindow: string; prep: string; finalDays: string; status: string }) {
  const sb = await createClient();
  const row = { workspace_id: i.workspaceId, listing_id: UUID.test(i.listingId) ? i.listingId : null, name: i.name.trim().slice(0, 100), kind: i.kind, description: i.description.slice(0, 2000),
    serving_style: i.servingStyle || null, pricing: i.pricing, price: num(i.price), min_guests: num(i.minGuests), max_guests: num(i.maxGuests), service_window_minutes: num(i.serviceWindow),
    prep_requirements: i.prep.slice(0, 1000), final_numbers_days: num(i.finalDays) ?? 7, status: i.status, updated_at: new Date().toISOString() };
  const q = i.id && UUID.test(i.id) ? sb.from("menus" as never).update(row as never).eq("id", i.id).select("id").single() : sb.from("menus" as never).insert(row as never).select("id").single();
  const { data, error } = await q;
  if (error) return fail(error) as Result<string>;
  paths("/provider/menus", "/provider/menus/[id]");
  return { ok: true, data: (data as unknown as { id: string }).id } as Result<string>;
}
export async function saveMenuSection(menuId: string, name: string, id?: string) {
  const sb = await createClient();
  const { error } = id && UUID.test(id) ? await sb.from("menu_sections" as never).update({ name: name.slice(0, 80) } as never).eq("id", id) : await sb.from("menu_sections" as never).insert({ menu_id: menuId, name: name.slice(0, 80) } as never);
  if (error) return fail(error);
  paths("/provider/menus/[id]");
  return { ok: true } as Result;
}
export async function saveMenuItem(i: { id?: string; menuId: string; sectionId: string; name: string; description: string; price: string; unit: string; dietary: string[]; allergens: string[]; allergenNote: string; available: boolean }) {
  const sb = await createClient();
  const row = { menu_id: i.menuId, section_id: UUID.test(i.sectionId) ? i.sectionId : null, name: i.name.trim().slice(0, 120), description: i.description.slice(0, 600), price: num(i.price), unit: i.unit.slice(0, 20) || "portion",
    dietary: i.dietary, allergens: i.allergens, allergen_note: i.allergenNote.slice(0, 300), available: i.available };
  const { error } = i.id && UUID.test(i.id) ? await sb.from("menu_items" as never).update(row as never).eq("id", i.id) : await sb.from("menu_items" as never).insert(row as never);
  if (error) return fail(error);
  paths("/provider/menus/[id]");
  return { ok: true } as Result;
}
export async function deleteMenuRow(table: "menu_items" | "menu_sections", id: string) {
  if (!UUID.test(id)) return { ok: false, error: "Not found." } as Result;
  const sb = await createClient();
  const { error } = await sb.from(table as never).delete().eq("id", id);
  if (error) return fail(error);
  paths("/provider/menus/[id]");
  return { ok: true } as Result;
}
export async function saveBarPackage(i: { id?: string; workspaceId: string; listingId: string; name: string; model: string; description: string; price: string; perPerson: string; tokenPrice: string;
  minSpend: string; corkage: string; glassware: boolean; hoursFrom: string; hoursTo: string; staffing: string; setupMinutes: string; depositPct: string;
  licenceProvidedBy: string; licenceRef: string; ruleId: string; minAge: string; status: string }) {
  const sb = await createClient();
  const row = { workspace_id: i.workspaceId, listing_id: UUID.test(i.listingId) ? i.listingId : null, name: i.name.trim().slice(0, 100), model: i.model, description: i.description.slice(0, 2000),
    price: num(i.price), per_person: num(i.perPerson), token_price: num(i.tokenPrice), min_spend: num(i.minSpend), corkage_per_bottle: num(i.corkage), glassware: i.glassware,
    hours_from: i.hoursFrom || null, hours_to: i.hoursTo || null, staffing: i.staffing.slice(0, 500), setup_minutes: num(i.setupMinutes) ?? 60, deposit_pct: num(i.depositPct) ?? 30, status: i.status,
    licensing: { provided_by: i.licenceProvidedBy || null, licence_ref: i.licenceRef.slice(0, 60) || null, jurisdiction_rule_id: UUID.test(i.ruleId) ? i.ruleId : null, min_age: num(i.minAge) }, updated_at: new Date().toISOString() };
  const { error } = i.id && UUID.test(i.id) ? await sb.from("bar_packages" as never).update(row as never).eq("id", i.id) : await sb.from("bar_packages" as never).insert(row as never);
  if (error) return fail(error);
  paths("/provider/menus");
  return { ok: true } as Result;
}

// ── §64 catering build (event side)
export async function saveCatering(i: { itemId: string; menuId: string; guests: number; items: { item_id: string; qty?: number }[]; dietary: Record<string, number>; style: string; serviceAt: string;
  staffing: string; equipment: string; notes: string; submit: boolean; acceptChange: boolean }) {
  if (!UUID.test(i.itemId) || !UUID.test(i.menuId)) return { ok: false, error: "Choose a menu." } as Result;
  return rpc<Record<string, unknown>>("save_catering_selection", { p_item: i.itemId, p_menu: i.menuId, p_guests: Math.round(i.guests), p_items: i.items.filter(x => UUID.test(x.item_id)).slice(0, 200),
    p_dietary: Object.fromEntries(Object.entries(i.dietary).filter(([k, v]) => /^[a-z_]{2,20}$/.test(k) && Number.isFinite(v) && v >= 0).map(([k, v]) => [k, Math.round(v)])),
    p_style: i.style || null, p_service_at: iso(i.serviceAt), p_staffing: i.staffing.slice(0, 1000), p_equipment: i.equipment.slice(0, 1000), p_notes: i.notes.slice(0, 2000),
    p_submit: i.submit, p_accept_change: i.acceptChange }, [...ITEM, "/organizer/marketplace/bookings/[id]/catering", "/account/events/[id]/bookings/[item]/catering"]);
}
export type CateringPrice = { total: number; per_guest: number | null; lines: { label: string; amount: number }[]; warnings: string[]; allergen_disclaimer: string };
export async function priceCatering(menuId: string, guests: number, items: { item_id: string; qty?: number }[]): Promise<Result<CateringPrice>> {
  if (!UUID.test(menuId)) return { ok: false, error: "Choose a menu." };
  return rpc<CateringPrice>("catering_price", { p_menu: menuId, p_guests: Math.round(guests), p_items: items }, []);
}
