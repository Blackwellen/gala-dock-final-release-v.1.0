"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Marketplace lifecycle actions (§33–37, §44–45). Every rule — who may act, which state changes are legal, the money
// maths — lives in the database RPCs; these wrappers only validate shapes, call as the signed-in user and map errors.

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES: [RegExp, string][] = [
  [/not_authorized|42501/, "You don’t have permission to do that."],
  [/admin_review_required/, "This needs a Gala Dock review before it can be decided."],
  [/not_holdable|not_open|not_offered|not_accepted|not_quoted|request_closed|dispute_closed|no_proposal|not_cancellable|not_disputable/, "This has already moved on. Refresh to see the latest status."],
  [/invalid_hold_window/, "Choose a hold between 2 hours and 14 days."],
  [/invalid_dependency|invalid_primary/, "Pick a booking from the same event."],
  [/invalid_window|window_closed/, "Check the standby window — it must end in the future."],
  [/invalid_price|invalid_quote/, "Enter a valid amount."],
  [/terms_required/, "Add your standby terms (at least a sentence)."],
  [/standby_fee_unpaid/, "Pay the standby fee before activating."],
  [/offer_expired/, "That offer has expired."],
  [/reason_required/, "Add a short reason."],
  [/invalid_party/, "You can only cancel on your own behalf."],
  [/invalid_arrival/, "The arrival time must be in the future."],
  [/rate_limited|54000/, "Too many emergency requests in the last hour. Please wait a moment."],
  [/invalid_refund/, "The refund must be between zero and the amount paid."],
  [/empty_entry/, "Add a message or a file."],
];
const fail = (e: { message?: string; code?: string } | null): ActionResult => {
  const m = `${e?.message ?? ""} ${e?.code ?? ""}`;
  return { ok: false, error: MESSAGES.find(([re]) => re.test(m))?.[1] ?? "Something went wrong. Please try again." };
};

async function call<T>(fn: string, args: Record<string, unknown>, paths: string[]): Promise<ActionResult<T>> {
  for (const [k, v] of Object.entries(args)) if (k.endsWith("_item") || k.endsWith("_hold") || k.endsWith("_standby") || k.endsWith("_candidate") || k.endsWith("_dispute") || k.endsWith("_cancellation") || k === "p_event" || k === "p_ws") {
    if (v !== null && (typeof v !== "string" || !UUID.test(v))) return { ok: false, error: "That record could not be found." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) return fail(error) as ActionResult<T>;
  for (const p of paths) revalidatePath(p, "page");
  return { ok: true, data: data as T };
}

const ITEM_PATHS = ["/organizer/marketplace/bookings/[id]", "/provider/opportunities/[id]", "/account/events/[id]/bookings/[item]"];
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown) => Math.round(Number(v));

// ── §35 holds
export async function requestHold(itemId: string, hours: number, dependsOn: string | null, conditions: string) {
  return call<string>("request_conditional_hold", { p_item: itemId, p_hours: int(hours), p_depends_on: dependsOn || null, p_conditions: text(conditions, 1000) }, ITEM_PATHS);
}
export async function respondHold(holdId: string, accept: boolean, hours: number | null, note: string) {
  return call("provider_respond_hold", { p_hold: holdId, p_accept: accept, p_hours: hours ? int(hours) : null, p_note: text(note, 1000) }, ITEM_PATHS);
}
export async function releaseHold(holdId: string, reason: string) {
  return call("release_conditional_hold", { p_hold: holdId, p_reason: text(reason, 300) }, ITEM_PATHS);
}

// ── §36 standby
export async function requestStandby(itemId: string, primaryId: string | null, windowStart: string, windowEnd: string, note: string) {
  if (Number.isNaN(Date.parse(windowStart)) || Number.isNaN(Date.parse(windowEnd))) return { ok: false, error: "Choose the standby window." } as ActionResult;
  return call<string>("request_standby", { p_item: itemId, p_primary: primaryId || null, p_window_start: new Date(windowStart).toISOString(), p_window_end: new Date(windowEnd).toISOString(), p_note: text(note, 1000) }, ITEM_PATHS);
}
export async function offerStandby(standbyId: string, fee: number, activationPrice: number, validHours: number, terms: string) {
  return call("provider_offer_standby", { p_standby: standbyId, p_fee: Number(fee), p_activation_price: Number(activationPrice), p_valid_hours: int(validHours), p_terms: text(terms, 2000) }, ITEM_PATHS);
}
export async function declineStandby(standbyId: string, reason: string) {
  return call("provider_decline_standby", { p_standby: standbyId, p_reason: text(reason, 300) }, ITEM_PATHS);
}
export async function acceptStandby(standbyId: string) { return call<string>("accept_standby", { p_standby: standbyId }, ITEM_PATHS); }
export async function activateStandby(standbyId: string, reason: string) { return call("activate_standby", { p_standby: standbyId, p_reason: text(reason, 500) }, ITEM_PATHS); }
export async function releaseStandby(standbyId: string) { return call("release_standby", { p_standby: standbyId }, ITEM_PATHS); }

// ── §45 cancellation
export type CancellationQuote = { paid: number; total: number; refund_pct: number | null; refund_amount: number | null; provider_retains: number | null; requires_review: boolean; notes: string[]; days_before_event: number | null; event_within_72h: boolean };
export async function quoteCancellation(itemId: string, party: string, kind: string) {
  return call<CancellationQuote>("cancellation_quote", { p_item: itemId, p_party: party, p_kind: kind, p_at: new Date().toISOString() }, []);
}
export async function requestCancellation(itemId: string, party: string, kind: string, reason: string) {
  if (text(reason, 2000).length < 5) return { ok: false, error: "Add a short reason (at least 5 characters)." } as ActionResult;
  return call<string>("request_cancellation", { p_item: itemId, p_party: party, p_kind: kind, p_reason: text(reason, 2000) }, ITEM_PATHS);
}
export async function decideCancellation(cancellationId: string, accept: boolean, note: string) {
  return call("decide_cancellation", { p_cancellation: cancellationId, p_accept: accept, p_note: text(note, 1000), p_refund: null }, ITEM_PATHS);
}

// ── §44 disputes
const DISPUTE_PATHS = ["/organizer/disputes/[id]", "/provider/disputes/[id]", "/account/disputes/[id]", ...ITEM_PATHS];
export async function openDispute(itemId: string, reason: string, summary: string, amount: number | null) {
  if (text(summary, 4000).length < 10) return { ok: false, error: "Describe what happened (at least 10 characters)." } as ActionResult;
  return call<string>("open_booking_dispute", { p_item: itemId, p_reason: reason, p_summary: text(summary, 4000), p_amount: amount && amount > 0 ? Number(amount) : null }, DISPUTE_PATHS);
}
export async function addDisputeEntry(disputeId: string, kind: "statement" | "evidence", body: string, files: { path: string; name: string }[]) {
  const safe = files.filter(f => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$/i.test(f.path)).slice(0, 10).map(f => ({ path: f.path, name: f.name.slice(0, 120) }));
  return call("add_dispute_entry", { p_dispute: disputeId, p_kind: kind, p_body: text(body, 6000), p_files: safe }, DISPUTE_PATHS);
}
export async function acceptDisputeResolution(disputeId: string) { return call<string>("accept_dispute_resolution", { p_dispute: disputeId }, DISPUTE_PATHS); }

// ── §37 emergency supply
const EM_PATHS = ["/organizer/marketplace/emergency", "/organizer/marketplace/emergency/[id]", "/provider/emergency", "/provider/emergency/[id]"];
export async function createEmergencyRequest(eventId: string, input: { severity: string; category: string; requiredArrival: string; location: string; scope: string; failureReason: string; budgetMax: string; originalItemId: string }) {
  if (Number.isNaN(Date.parse(input.requiredArrival))) return { ok: false, error: "Set when you need them on site." } as ActionResult<string>;
  if (!["critical", "high", "standard"].includes(input.severity) || !/^[a-z_]{2,40}$/.test(input.category)) return { ok: false, error: "Choose a category and severity." } as ActionResult<string>;
  return call<string>("create_emergency_request", { p_event: eventId, p: {
    severity: input.severity, category: input.category, required_arrival: new Date(input.requiredArrival).toISOString(), location: text(input.location, 300),
    scope: text(input.scope, 2000), failure_reason: text(input.failureReason, 1000), budget_max: input.budgetMax ? String(Number(input.budgetMax)) : "",
    original_item_id: UUID.test(input.originalItemId) ? input.originalItemId : null,
  } }, EM_PATHS);
}
export async function respondEmergency(candidateId: string, action: "open" | "interested" | "quote" | "decline", quote: number | null, eta: number | null, note: string) {
  return call("provider_emergency_respond", { p_candidate: candidateId, p_action: action, p_quote: quote, p_eta: eta ? int(eta) : null, p_note: text(note, 1000) }, EM_PATHS);
}
export async function acceptEmergency(candidateId: string) { return call<string>("accept_emergency_candidate", { p_candidate: candidateId }, EM_PATHS); }
export async function cancelEmergency(requestId: string) {
  if (!UUID.test(requestId)) return { ok: false, error: "That record could not be found." } as ActionResult;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_emergency_request" as never, { p_request: requestId } as never);
  if (error) return fail(error);
  for (const p of EM_PATHS) revalidatePath(p, "page");
  return { ok: true } as ActionResult;
}
export async function saveEmergencyProfile(workspaceId: string, input: { enabled: boolean; categories: string[]; radiusKm: number; responseMinutes: number; surchargePct: number; rateNotes: string; availableNow: boolean; availableUntil: string; baseLat: string; baseLng: string }) {
  const cats = input.categories.filter(c => /^[a-z_]{2,40}$/.test(c)).slice(0, 14);
  return call("save_emergency_profile", { p_ws: workspaceId, p: {
    enabled: input.enabled, categories: cats, radius_km: int(input.radiusKm), response_minutes: int(input.responseMinutes), surcharge_pct: int(input.surchargePct),
    rate_notes: text(input.rateNotes, 1000), available_now: input.availableNow, available_until: input.availableUntil ? new Date(input.availableUntil).toISOString() : "",
    base_lat: input.baseLat, base_lng: input.baseLng,
  } }, EM_PATHS);
}

// ── §38 payments (orchestrated: payment order → Stripe Checkout; webhooks confirm)
export async function payBooking(kind: "deposit" | "balance_payment" | "standby_fee" | "emergency_service", ids: { itemId?: string; standbyId?: string }, returnPath: string): Promise<ActionResult<string>> {
  if ((ids.itemId && !UUID.test(ids.itemId)) || (ids.standbyId && !UUID.test(ids.standbyId))) return { ok: false, error: "That record could not be found." };
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.galadock.com";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const { startPayment } = await import("@/lib/commerce/orchestrator");
  const r = await startPayment(kind, ids, origin, returnPath);
  return r.ok ? { ok: true, data: r.url } : { ok: false, error: r.error };
}
