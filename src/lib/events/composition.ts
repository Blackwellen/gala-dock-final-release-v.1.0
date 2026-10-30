"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Q40 Advanced Event Composition (domains 247–256; migrations 202610291042–1046). Every rule is enforced in SQL — series
 * generation through the Q14 structure engine, this/following/all edits that keep local overrides, parent/child integrity,
 * day/room/venue bindings, pass components that can never oversell a date, lifecycle cascade, versioned forms and waivers,
 * append-only stock, merchandise orders (payments stay in Q07), lost property and sustainability. These actions validate
 * input shape and translate errors only.
 */
const Id = z.string().uuid();
const why = (m: string) =>
  /not_authorized|42501/.test(m) ? "You don't have permission to do that."
  : /sold_out/.test(m) ? "Not enough tickets left for every date in this pass."
  : /outside_parent_window/.test(m) ? "Sub-events must sit inside the parent event's dates."
  : /composition_cycle|composition_too_deep/.test(m) ? "That would nest events in a loop or too deeply."
  : /day_outside_event|tier_outside_day|item_outside_day|shift_outside_day/.test(m) ? "Keep it inside the event day."
  : /room_capacity_exceeded/.test(m) ? "Room tickets can't exceed the room's capacity."
  : /room_not_at_event_venue|venue_not_in_event/.test(m) ? "Choose a room or venue that belongs to this event."
  : /invalid_recurrence/.test(m) ? "Check the repeat pattern." : /field_not_editable/.test(m) ? "That field can't be edited across a series."
  : /pass_already_selling/.test(m) ? "This pass has sales — its dates can't change now."
  : /component_not_composed/.test(m) ? "Pass dates must belong to this event, its sub-events or the same series."
  : /guardian_consent_required|minors_not_allowed/.test(m) ? "A parent or guardian must consent for under-18s."
  : /field_required|field_invalid|field_too_long/.test(m) ? "Check the highlighted answers."
  : /insufficient_stock/.test(m) ? "Not enough stock." : /waiver_version_immutable|form_version_immutable/.test(m) ? "Published versions can't be edited — create a new version."
  : /not_found|P0002/.test(m) ? "Not found." : "Something went wrong.";

async function call<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const { data, error } = await untyped(await createClient()).rpc(fn, args);
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, data: data as T };
}
const bad = (error = "Invalid input.") => ({ ok: false as const, error });

// ── Series / recurring / tours ──
const Recurrence = z.object({ freq: z.enum(["daily", "weekly", "monthly"]), interval: z.number().int().min(1).max(52).default(1), byweekday: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), duration_minutes: z.number().int().min(15).max(20160).default(120),
  count: z.number().int().min(1).max(104).optional(), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const Series = z.object({ name: z.string().min(2).max(120), kind: z.enum(["series", "recurring", "tour", "festival", "conference"]).default("series"), visibility: z.enum(["private", "public"]).default("private"),
  timezone: z.string().max(60).default("Europe/London"), anchor_event_id: Id.optional(), recurrence: Recurrence.optional(), description: z.string().max(4000).optional(),
  branding: z.object({ cover_image: z.string().url().optional() }).optional() });
export async function createSeries(workspaceId: string, input: unknown) { const p = Series.safeParse(input); return p.success && Id.safeParse(workspaceId).success ? call<{ id: string; slug: string }>("create_event_series", { p_workspace: workspaceId, p_series: p.data }) : bad("Check the series details."); }
export async function generateOccurrences(seriesId: string, limit = 52) { return call<{ created: number; existing: number; skipped_past: number }>("generate_series_occurrences", { p_series: seriesId, p_limit: limit }); }
export async function addTourDate(seriesId: string, startsLocal: string, durationMinutes: number, venue: { venue_listing_id?: string; venue_name?: string; city?: string; location?: string }) {
  return call<{ id: string }>("add_tour_date", { p_series: seriesId, p_starts_local: startsLocal, p_duration_minutes: durationMinutes, p_venue: venue });
}
export async function editSeries(eventId: string, patch: Record<string, unknown>, scope: "this" | "following" | "all", expectedSeriesVersion?: number) {
  return call<{ ok: boolean; changed: number; skipped: { event_id: string; field: string; reason: string }[]; conflict?: boolean }>("series_edit", { p_event: eventId, p_patch: patch, p_scope: scope, p_expected_series_version: expectedSeriesVersion ?? null });
}
export async function detachOccurrence(eventId: string) { return call("detach_occurrence", { p_event: eventId }); }
export async function seriesReport(seriesId: string) { return call("series_report", { p_series: seriesId }); }
export async function seriesPage(slug: string) { return call("series_page", { p_slug: slug }); }

// ── Parent / child, venues, days, rooms ──
export async function addSubEvent(parentId: string, sub: { name?: string; role: "stage" | "track" | "session" | "day" | "sub_event"; starts_at?: string; ends_at?: string; event_id?: string; capacity?: number }) {
  return call<{ id: string }>("add_sub_event", { p_parent: parentId, p_sub: sub });
}
export async function compositionReadiness(eventId: string) { return call("event_composition_readiness", { p_event: eventId }); }
export async function compositionResources(eventId: string) { return call("event_composition_resources", { p_event: eventId }); }
export async function setEventVenues(eventId: string, venues: { id?: string; listing_id?: string; venue_name: string; role?: "primary" | "secondary" | "satellite"; starts_at?: string; ends_at?: string; capacity?: number }[]) {
  return call("set_event_venues", { p_event: eventId, p_venues: venues });
}
export async function venueSchedule(eventId: string) { return call("event_venue_schedule", { p_event: eventId }); }
export async function setEventDays(eventId: string, days: { date: string; label?: string; start_time?: string; end_time?: string; event_venue_id?: string; status?: "scheduled" | "cancelled" }[]) {
  return call("set_event_days", { p_event: eventId, p_days: days });
}
export async function dayReport(eventId: string) { return call("event_day_report", { p_event: eventId }); }
export async function roomSchedule(eventId: string) { return call("event_room_schedule", { p_event: eventId }); }
export async function cascadeTransition(eventId: string, to: string, childAction: "same" | "detach", reason?: string) { return call("cascade_event_transition", { p_event: eventId, p_to: to, p_child_action: childAction, p_reason: reason ?? null }); }

// ── Passes across occurrences / days ──
export async function setPassComponents(passTierId: string, kind: "season" | "multi_day" | "multi_venue" | "series", components: { tier_id: string; units?: number }[]) {
  return call("set_pass_components", { p_pass_tier: passTierId, p_kind: kind, p_components: components });
}
export async function passInventory(passTierId: string) { return call("event_pass_inventory", { p_pass_tier: passTierId }); }

// ── Forms and waivers ──
export async function saveForm(eventId: string, familyId: string | null, form: { title?: string; audience?: string; kind?: string; fields?: unknown[] }, publish = false) { return call("save_event_form", { p_event: eventId, p_family: familyId, p_form: form, p_publish: publish }); }
export async function submitForm(formId: string, answers: Record<string, unknown>, buildItemId?: string, requestId?: string) { return call("submit_form_response", { p_form: formId, p_answers: answers, p_build_item: buildItemId ?? null, p_request_id: requestId ?? null }); }
export async function saveWaiver(workspaceId: string, familyId: string | null, waiver: { title?: string; body?: string; minors_allowed?: boolean; adult_age?: number }, fromVersion?: number) {
  return call("save_waiver_template", { p_workspace: workspaceId, p_family: familyId, p_waiver: waiver, p_from_version: fromVersion ?? null });
}
export async function publishWaiver(templateId: string) { return call("publish_waiver_template", { p_template: templateId }); }
export async function setEventWaiver(eventId: string, templateId: string, tierIds: string[] | null, active = true) { return call("set_event_waiver", { p_event: eventId, p_template: templateId, p_tier_ids: tierIds, p_active: active }); }
export async function signWaiver(eventId: string, templateId: string, sign: Record<string, unknown>) { return call("sign_waiver", { p_event: eventId, p_template: templateId, p_sign: sign }); }
export async function waiverStatus(eventId: string) { return call("waiver_status", { p_event: eventId }); }

// ── Stock, merchandise, lost property, sustainability ──
export async function stockMove(itemId: string, kind: "receive" | "issue" | "return" | "waste" | "adjust" | "count", quantity: number, eventId?: string, reason?: string, requestId?: string, delta?: number) {
  return call("record_stock_movement", { p_item: itemId, p_kind: kind, p_quantity: quantity, p_event: eventId ?? null, p_reason: reason ?? null, p_request_id: requestId ?? null, p_delta: delta ?? null });
}
export async function stockReport(workspaceId: string, eventId?: string) { return call("stock_report", { p_workspace: workspaceId, p_event: eventId ?? null }); }
export async function reserveMerch(eventId: string, items: { merch_item_id: string; qty: number }[], requestId: string) { return call<{ order_ref: string; total_minor: number; collection_code?: string }>("merch_reserve", { p_event: eventId, p_items: items, p_request_id: requestId }); }
export async function collectMerch(orderRef: string, code: string) { return call("merch_collect", { p_order_ref: orderRef, p_code: code }); }
export async function refundMerch(orderRef: string, lines: { merch_item_id: string; qty: number }[], restock = true) { return call("merch_refund", { p_order_ref: orderRef, p_lines: lines, p_restock: restock }); }
export async function reportLost(eventId: string, report: Record<string, unknown>) { return call("report_lost_item", { p_event: eventId, p_report: report }); }
export async function logFound(eventId: string, item: Record<string, unknown>) { return call("log_found_item", { p_event: eventId, p_item: item }); }
export async function lostMatches(reportId: string) { return call("lost_property_matches", { p_report: reportId, p_limit: 10 }); }
export async function claimFound(reportId: string, itemId: string, evidence: Record<string, unknown> = {}) { return call("claim_found_item", { p_report: reportId, p_item: itemId, p_evidence: evidence }); }
export async function decideClaim(claimId: string, decision: "verified" | "failed" | "manual_review" | "collected", note?: string) { return call("decide_lost_claim", { p_claim: claimId, p_decision: decision, p_note: note ?? null }); }
export async function recordSustainability(eventId: string, entries: Record<string, unknown>[]) { return call("record_sustainability", { p_event: eventId, p_entries: entries }); }
export async function sustainabilityReport(eventId: string) { return call("event_sustainability_report", { p_event: eventId }); }
