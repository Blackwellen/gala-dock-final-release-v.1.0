"use server";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { badgeCredential } from "@/lib/tickets/credentials";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Guests / registration / passes / zones / scanners (Q18). Every rule lives in the database commands; these actions validate
 * input, translate errors and handle the two token flows (RSVP link, public registration) that run with the service role after
 * rate limiting — the functions behind them are not callable by anon or authenticated clients.
 */
const Id = z.string().uuid();
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const why = (m: string) => /not_authorized|42501/.test(m) ? "You don't have permission for this event." : /zone_not_in_event|tier_not_in_event|guest_not_in_event|booking_not_in_event/.test(m) ? "That item isn't part of this event."
  : /child_contact_not_allowed/.test(m) ? "Children's details can't include contact details — add them to the parent or guardian."
  : /notes_not_allowed_for_childrens_event/.test(m) ? "Free-text notes aren't stored for children's events — use the dietary, allergy and accessibility fields."
  : /household_capacity_exceeded/.test(m) ? "Not enough capacity left for this household." : /published_form_immutable/.test(m) ? "Published forms can't be edited — publish a new version."
  : /private_fields_not_allowed/.test(m) ? "Badges can't show email, phone, dietary or medical details." : /full/.test(m) ? "Registration is full." : "Could not save.";
async function sb() { return untyped(await createClient()); }
async function ip() { const h = await headers(); return (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "unknown"; }

/** Organiser creates (or replaces) a guest's personal RSVP link. Returns the path to share; only the hash is stored. */
export async function createRsvpLink(guestId: string): Promise<ActionResult<{ path: string }>> {
  if (!Id.safeParse(guestId).success) return { ok: false, error: "Invalid guest." };
  const token = randomBytes(32).toString("base64url");
  const { error } = await (await sb()).rpc("set_guest_rsvp_token", { p_guest: guestId, p_token_hash: hash(token) });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, data: { path: `/rsvp/${token}` }, message: "RSVP link created." };
}

const Rsvp = z.object({ response: z.enum(["confirmed", "declined", "pending"]), plus_ones: z.array(z.object({ name: z.string().trim().max(120), child: z.boolean().optional() })).max(10).default([]),
  note: z.string().max(500).default(""), care: z.object({ dietary: z.string().max(300).optional(), allergies: z.string().max(300).optional(), accessibility: z.string().max(500).optional() }).nullable().optional() });
/** Guest answers through their link (no account). Rate-limited per IP and per token. */
export async function respondRsvp(token: string, input: unknown): Promise<ActionResult<{ status: string; plus_ones: number }>> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { ok: false, error: "This RSVP link isn't valid." };
  const p = Rsvp.safeParse(input); if (!p.success) return { ok: false, error: "Check your answer." };
  if (!(await rateLimit(`rsvp:ip:${await ip()}`, 30, 600)) || !(await rateLimit(`rsvp:t:${hash(token).slice(0, 16)}`, 10, 600))) return { ok: false, error: "Too many attempts — try again later." };
  const { data, error } = await untyped(createAdminClient() as never).rpc("guest_rsvp", { p_token_hash: hash(token), p_response: p.data.response, p_plus_ones: p.data.plus_ones, p_note: p.data.note, p_care: p.data.care ?? null });
  const r = data as { ok: boolean; error?: string; status?: string; plus_ones?: number; allowed?: number } | null;
  if (error || !r) return { ok: false, error: "Could not save your RSVP." };
  if (!r.ok) return { ok: false, error: r.error === "too_many_plus_ones" ? `You can bring up to ${r.allowed} guest${r.allowed === 1 ? "" : "s"}.` : r.error === "not_found" ? "This RSVP link isn't valid." : "RSVPs for this event are closed." };
  return { ok: true, data: { status: r.status!, plus_ones: r.plus_ones ?? 0 }, message: r.status === "confirmed" ? "Thanks — you're on the list." : "Thanks for letting us know." };
}

/** Public registration (signed-in or not). Answers are validated against the published form version in the database. */
export async function submitRegistration(formId: string, input: { name: string; email: string; answers: Record<string, unknown>; request_id?: string }): Promise<ActionResult<{ id: string; status: string }>> {
  if (!Id.safeParse(formId).success) return { ok: false, error: "Invalid form." };
  if (!(await rateLimit(`reg:ip:${await ip()}`, 20, 600))) return { ok: false, error: "Too many attempts — try again later." };
  const { data: { user } } = await (await createClient()).auth.getUser();
  const { data, error } = await untyped(createAdminClient() as never).rpc("submit_registration", { p_form: formId, p_name: String(input.name ?? "").slice(0, 120), p_email: String(input.email ?? "").slice(0, 200),
    p_answers: input.answers ?? {}, p_user: user?.id ?? null, p_request_id: input.request_id && Id.safeParse(input.request_id).success ? input.request_id : null });
  const r = data as { ok: boolean; id?: string; status?: string; error?: string; field?: string } | null;
  if (error || !r) return { ok: false, error: "Could not submit the registration." };
  if (!r.ok) return { ok: false, error: r.error === "required" ? `Please answer "${r.field}".` : r.error === "full" ? "Registration is full." : r.error === "limit_per_email" ? "This email is already registered." : r.error === "outside_window" ? "Registration isn't open." : r.error === "form_closed" || r.error === "event_closed" ? "Registration is closed." : "Check your answers." };
  return { ok: true, data: { id: r.id!, status: r.status! }, message: r.status === "approved" ? "You're registered." : r.status === "waitlisted" ? "You're on the waiting list." : "Thanks — the organiser will confirm your place." };
}

export async function publishRegistrationForm(eventId: string, form: unknown): Promise<ActionResult<{ id: string; version: number }>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const { data, error } = await (await sb()).rpc("publish_registration_form", { p_event: eventId, p_form: form });
  if (error) return { ok: false, error: /invalid_field|options_required|invalid_fields/.test(error.message) ? "Check the form fields." : why(error.message) };
  const r = data as { id: string; version: number };
  return { ok: true, data: r, message: `Registration form v${r.version} published.` };
}
export async function decideRegistration(registrationId: string, to: "approved" | "rejected" | "cancelled" | "waitlisted", reason = ""): Promise<ActionResult> {
  if (!Id.safeParse(registrationId).success) return { ok: false, error: "Invalid registration." };
  const { error } = await (await sb()).rpc("decide_registration", { p_registration: registrationId, p_to: to, p_reason: reason.slice(0, 500) });
  return error ? { ok: false, error: /illegal registration transition/.test(error.message) ? "That change isn't allowed from the current status." : why(error.message) } : { ok: true, message: "Registration updated." };
}

export async function saveZone(eventId: string, zone: unknown, zoneId?: string): Promise<ActionResult<{ id: string }>> {
  if (!Id.safeParse(eventId).success || (zoneId && !Id.safeParse(zoneId).success)) return { ok: false, error: "Invalid zone." };
  const { data, error } = await (await sb()).rpc("save_access_zone", { p_event: eventId, p_zone: zone, p_id: zoneId ?? null });
  return error ? { ok: false, error: why(error.message) } : { ok: true, data: { id: (data as { id: string }).id }, message: "Zone saved." };
}
export async function setZoneRules(zoneId: string, rules: unknown[]): Promise<ActionResult> {
  if (!Id.safeParse(zoneId).success) return { ok: false, error: "Invalid zone." };
  const { error } = await (await sb()).rpc("set_zone_rules", { p_zone: zoneId, p_rules: rules });
  return error ? { ok: false, error: why(error.message) } : { ok: true, message: "Zone access saved." };
}

const Pass = z.object({ pass_type: z.enum(["guest", "staff", "supplier", "artist", "vip", "backstage", "press"]), holder_name: z.string().trim().min(1).max(120), holder_email: z.string().max(200).default(""),
  zones: z.array(Id).max(30).default([]), valid_from: z.string().datetime().nullable().optional(), valid_to: z.string().datetime().nullable().optional(),
  guest_id: Id.nullable().optional(), user_id: Id.nullable().optional(), build_item_id: Id.nullable().optional(), badge_template_id: Id.nullable().optional() });
export async function issuePass(eventId: string, input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  const p = Pass.safeParse(input); if (!Id.safeParse(eventId).success || !p.success) return { ok: false, error: "Check the pass details." };
  const d = p.data;
  const { data, error } = await (await sb()).rpc("issue_access_pass", { p_event: eventId, p_pass_type: d.pass_type, p_holder_name: d.holder_name, p_holder_email: d.holder_email, p_zones: d.zones,
    p_valid_from: d.valid_from ?? null, p_valid_to: d.valid_to ?? null, p_guest: d.guest_id ?? null, p_user: d.user_id ?? null, p_build_item: d.build_item_id ?? null, p_badge_template: d.badge_template_id ?? null });
  return error ? { ok: false, error: why(error.message) } : { ok: true, data: data as { id: string; code: string }, message: "Pass issued." };
}
export async function revokePass(passId: string, reason: string, status: "revoked" | "suspended" | "active" = "revoked"): Promise<ActionResult> {
  if (!Id.safeParse(passId).success) return { ok: false, error: "Invalid pass." };
  const { error } = await (await sb()).rpc("revoke_access_pass", { p_pass: passId, p_reason: reason.slice(0, 300), p_status: status });
  return error ? { ok: false, error: why(error.message) } : { ok: true, message: status === "active" ? "Pass reactivated." : "Pass revoked — its badge no longer scans." };
}
/** Badge print: audited; returns the signed badge QR payload (bound to the pass nonce, dies on revocation). */
export async function printBadge(passId: string): Promise<ActionResult<{ payload: string; code: string; printed: number }>> {
  if (!Id.safeParse(passId).success) return { ok: false, error: "Invalid pass." };
  const { data, error } = await (await sb()).rpc("record_badge_print", { p_pass: passId });
  if (error) return { ok: false, error: /pass_not_active/.test(error.message) ? "This pass isn't active." : why(error.message) };
  const { data: x } = await untyped(createAdminClient() as never).from("access_passes").select("nonce").eq("id", passId).maybeSingle();
  if (!x?.nonce) return { ok: false, error: "Pass unavailable." };
  const r = data as { printed_count: number; code: string };
  return { ok: true, data: { payload: badgeCredential(passId, x.nonce), code: r.code, printed: r.printed_count } };
}

export async function assignScanner(eventId: string, userId: string, zones: string[] = [], expiresAt?: string): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(userId).success || !z.array(Id).max(30).safeParse(zones).success) return { ok: false, error: "Invalid scanner." };
  const { error } = await (await sb()).rpc("assign_event_scanner", { p_event: eventId, p_user: userId, p_zones: zones, p_expires_at: expiresAt ?? null });
  return error ? { ok: false, error: why(error.message) } : { ok: true, message: "Scanner access granted." };
}
export async function revokeScanner(eventId: string, userId: string): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(userId).success) return { ok: false, error: "Invalid scanner." };
  const { error } = await (await sb()).rpc("revoke_event_scanner", { p_event: eventId, p_user: userId });
  return error ? { ok: false, error: why(error.message) } : { ok: true, message: "Scanner access removed." };
}

/** Counts only (dietary / allergies / accessibility) — for teams and booked providers who need numbers, not names. */
export async function careSummary(eventId: string) {
  if (!Id.safeParse(eventId).success) return null;
  const { data, error } = await (await sb()).rpc("event_care_summary", { p_event: eventId });
  return error ? null : (data as { dietary: Record<string, number>; allergies: number; accessibility: number; access_flags: Record<string, number> });
}
