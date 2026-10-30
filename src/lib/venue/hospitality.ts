"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Q13 hospitality service (migration 202610291035–1036). Thin typed wrappers: the database commands authorise the caller
 * (event editor vs provider of the booking line), validate allergens/dietary keys, price in pence, version-check and write
 * audit/outbox. Lines, BEO sections and budget totals are always read back from the server — never computed here.
 */
export type HospitalityResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string };
export type HospitalityLine = { source: "catering" | "bar" | "schedule"; kind: string; label: string; section: string | null; course: string | null;
  basis: "per_head" | "fixed" | "quantity" | "included" | "consumption_estimate" | "contingent" | "top_up"; qty: number; unit_minor: number; total_minor: number;
  dietary: string[]; allergens: string[]; may_contain: string[]; service_at: string | null };
export type HospitalityBooking = { build_item_id: string; event_id: string; status: "draft" | "submitted" | "confirmed" | "cancelled"; catering_minor: number; bar_minor: number;
  schedule_minor: number; contingent_minor: number; total_minor: number; applied_minor: number; adjustment_minor: number; guests: number | null; cutoff_at: string | null;
  allergens: string[]; may_contain: string[]; warnings: { code: string; text: string }[]; version: number };

const Id = z.string().uuid();
const Dietary = z.enum(["vegetarian", "vegan", "gluten_free", "halal", "kosher", "dairy_free", "nut_free", "pescatarian"]);
const Counts = z.partialRecord(Dietary, z.number().int().min(0).max(100000));
const Iso = z.string().refine(v => !Number.isNaN(Date.parse(v)));
const CateringSelection = z.object({
  menu_id: Id, guests: z.number().int().min(1).max(100000),
  items: z.array(z.object({ item_id: Id, variant_id: Id.optional(), qty: z.number().int().min(0).max(100000).optional() })).max(200),
  dietary_counts: Counts.default({}), serving_style: z.string().max(40).optional(), programme_item_id: Id.optional(), service_at: Iso.optional(),
  course_timing: z.array(z.object({ course: z.enum(["canape", "starter", "main", "dessert", "side", "drink", "late", "other"]), serve_at: Iso })).max(12).default([]),
  staffing: z.string().max(1000).optional(), equipment: z.string().max(1000).optional(), notes: z.string().max(2000).optional(), submit: z.boolean().default(false),
});
const BarSelection = z.object({
  bar_package_id: Id, mode: z.enum(["cash_bar", "hosted_bar", "open_bar", "drink_tokens", "prepaid_package", "minimum_spend", "consumption_tab", "dry_hire", "mobile_bar", "bartenders_only"]).optional(),
  guests: z.number().int().min(1).max(100000), starts_at: Iso.optional(), ends_at: Iso.optional(), programme_item_id: Id.optional(),
  tokens: z.number().int().min(0).max(1000000).default(0), corkage_bottles: z.number().int().min(0).max(100000).default(0),
  tab_limit_minor: z.number().int().min(0).optional(), notes: z.string().max(2000).optional(), submit: z.boolean().default(false),
});
const HospitalitySchedule = z.object({
  kind: z.enum(["green_room", "artist_catering", "vip", "staff_meals", "crew_catering", "guest_hospitality"]), title: z.string().min(2).max(120),
  space_id: Id.optional(), location: z.string().max(200).optional(), programme_item_id: Id.optional(), starts_at: Iso.optional(), ends_at: Iso.optional(),
  headcount: z.number().int().min(1).max(100000), dietary_counts: Counts.default({}), build_item_id: Id.optional(), menu_id: Id.optional(),
  requirements: z.array(z.object({ item: z.string().min(1).max(120), qty: z.number().int().min(0).max(100000).optional() })).max(100).default([]),
  notes: z.string().max(2000).optional(), status: z.enum(["planned", "confirmed", "cancelled"]).default("planned"),
});
/** The 14 UK FIC allergens (reference table food_allergens). */
export type AllergenKey = "celery" | "gluten" | "crustaceans" | "eggs" | "fish" | "lupin" | "milk" | "molluscs" | "mustard" | "nuts" | "peanuts" | "sesame" | "soya" | "sulphites";

const MSG: [RegExp, string][] = [
  [/not_authorized|42501/, "You don’t have permission to do that."], [/stale_version/, "Someone else changed this first — reload to see the latest version."],
  [/final_numbers_closed/, "The final-numbers deadline has passed — ask the caterer to change it."], [/final_numbers_locked|bar_locked/, "This selection is locked."],
  [/invalid_dietary|dietary_exceeds_guests/, "Check the dietary counts — they can’t exceed the guest count."], [/invalid_menu/, "That menu isn’t available for this booking."],
  [/invalid_bar_package/, "That bar package isn’t available for this booking."], [/bar_mode_not_offered/, "This bar package doesn’t offer that bar type."],
  [/corkage_not_offered/, "This bar doesn’t allow corkage."], [/tokens_required|tokens_not_applicable/, "Drink tokens only apply to a token bar."],
  [/tab_not_applicable/, "A tab limit only applies to a tab or hosted bar."], [/invalid_programme_item/, "Choose a programme item from this event."],
  [/service_outside_event|invalid_bar_hours|invalid_schedule_time/, "Check the times — they must fall around the event."], [/invalid_space/, "Choose a room at the event’s venue."],
  [/booking_closed/, "This booking can no longer be changed."], [/invalid_/, "Some details aren’t valid."],
];
const fail = (m: string): { ok: false; error: string; code: string } => ({ ok: false, error: MSG.find(([re]) => re.test(m))?.[1] ?? "Something went wrong. Please try again.", code: m.split(/[:\s]/)[0] ?? "error" });
const PATHS = ["/provider/opportunities/[id]", "/provider/beo/[id]", "/organizer/marketplace/bookings/[id]", "/account/events/[id]/bookings/[item]", "/account/events/[id]/money"];

async function call<T>(fn: string, args: Record<string, unknown>, revalidate = true): Promise<HospitalityResult<T>> {
  const sb = await createClient();
  const { data, error } = await sb.rpc(fn as never, args as never);
  if (error) return fail(error.message);
  if (revalidate) for (const p of PATHS) revalidatePath(p, "page");
  return { ok: true, data: data as T };
}

/** Event side: save the catering selection (version-checked). A confirmed booking returns needs_confirmation until accepted. */
export async function saveCateringSelection(itemId: string, sel: z.input<typeof CateringSelection>, expectedVersion?: number, acceptChange = false) {
  const p = CateringSelection.safeParse(sel);
  if (!Id.safeParse(itemId).success || !p.success) return { ok: false, error: "Check the selection." } as HospitalityResult<never>;
  return call<{ saved?: boolean; needs_confirmation?: boolean; version?: number; difference_minor?: number; booking?: HospitalityBooking }>("hospitality_save_catering",
    { p_item: itemId, p_sel: p.data, p_expected_version: expectedVersion ?? null, p_accept_change: acceptChange });
}
/** Final numbers: event side until the cut-off, provider afterwards. */
export async function setFinalNumbers(itemId: string, guests: number, dietary?: Record<string, number>, expectedVersion?: number) {
  if (!Id.safeParse(itemId).success || !Number.isInteger(guests) || guests < 1) return { ok: false, error: "Enter a guest count." } as HospitalityResult<never>;
  const d = dietary ? Counts.safeParse(dietary) : null;
  if (d && !d.success) return { ok: false, error: "Check the dietary counts." } as HospitalityResult<never>;
  return call<{ saved: boolean; version: number; booking: HospitalityBooking }>("hospitality_set_final_numbers", { p_item: itemId, p_guests: guests, p_dietary: d?.data ?? null, p_expected_version: expectedVersion ?? null });
}
export async function saveBarSelection(itemId: string, bar: z.input<typeof BarSelection>, expectedVersion?: number) {
  const p = BarSelection.safeParse(bar);
  if (!Id.safeParse(itemId).success || !p.success) return { ok: false, error: "Check the bar details." } as HospitalityResult<never>;
  return call<{ saved: boolean; version: number; booking: HospitalityBooking; licensing: { min_age: number; provided_by: string | null; licence_ref: string | null } }>("hospitality_save_bar",
    { p_item: itemId, p_bar: p.data, p_expected_version: expectedVersion ?? null });
}
export async function saveHospitalitySchedule(eventId: string, row: z.input<typeof HospitalitySchedule>, id?: string, expectedVersion?: number) {
  const p = HospitalitySchedule.safeParse(row);
  if (!Id.safeParse(eventId).success || !p.success || (id && !Id.safeParse(id).success)) return { ok: false, error: "Check the schedule." } as HospitalityResult<never>;
  return call<{ id: string; version: number }>("hospitality_save_schedule", { p_event: eventId, p_row: p.data, p_id: id ?? null, p_expected_version: expectedVersion ?? null });
}
/** Provider: freeze the commercial snapshot (also happens automatically when the booking line is confirmed/paid). */
export async function confirmHospitality(itemId: string) {
  if (!Id.safeParse(itemId).success) return { ok: false, error: "Booking not found." } as HospitalityResult<never>;
  return call<Record<string, unknown> | null>("hospitality_confirm", { p_item: itemId });
}
/** Provider: write a new BEO version whose `hospitality` section is generated from the structured lines. */
export async function syncBeoHospitality(itemId: string, send: boolean, note = "") {
  if (!Id.safeParse(itemId).success) return { ok: false, error: "Booking not found." } as HospitalityResult<never>;
  return call<{ order_id: string; reference: string; version: number; status: string }>("event_order_sync_hospitality", { p_item: itemId, p_send: send, p_note: note.slice(0, 500) });
}
export async function getHospitalityBooking(itemId: string) {
  if (!Id.safeParse(itemId).success) return { ok: false, error: "Booking not found." } as HospitalityResult<never>;
  return call<HospitalityBooking & { exists: boolean; beo: { id: string; status: string; stale: boolean } | null; allergen_changes: { item: string }[]; section: Record<string, unknown> | null }>(
    "hospitality_booking", { p_item: itemId }, false);
}
export async function getHospitalitySummary(eventId: string) {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Event not found." } as HospitalityResult<never>;
  return call<{ total_minor: number; contingent_minor: number; adjustment_minor: number; bookings: unknown[]; allergen_matrix: Partial<Record<AllergenKey, string[]>>; schedules: unknown[] }>(
    "hospitality_event_summary", { p_event: eventId }, false);
}
