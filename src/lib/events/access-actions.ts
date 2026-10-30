"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/**
 * Organiser access & registration commands (Q18) used by Operations › Access & passes and Sell › Registration. Rules live in the
 * database commands (save_access_zone, set_zone_rules, save_badge_template, assign_event_scanner_by_email, registration drafts —
 * 202610294011 / 4036); these wrappers validate shape, translate error codes and refresh the event page.
 */
const Id = z.string().uuid();
const When = z.string().datetime({ offset: true }).nullable().optional();
const PASS_TYPES = ["guest", "staff", "supplier", "artist", "vip", "backstage", "press"] as const;
const ZONE_KINDS = ["general", "vip", "backstage", "staff", "artist", "supplier", "press", "accessible", "other"] as const;
/** Fields a badge may show. Contact, dietary and medical details are never printable (the database refuses them too). */
const BADGE_FIELDS = ["holder_name", "pass_type", "zones", "event_name", "event_date", "code", "qr", "organisation"] as const;

const why = (m: string) => /not_authorized|42501/.test(m) ? "You don't have permission to change this event's access."
  : /zone_not_in_event|tier_not_in_event/.test(m) ? "That zone or tier isn't part of this event."
  : /duplicate key|23505/.test(m) ? "A zone with that name already exists for this event."
  : /max_entries|check constraint/.test(m) ? "Check the values — limited re-entry needs a maximum number of entries."
  : /private_fields_not_allowed/.test(m) ? "Badges can't show email, phone, dietary or medical details."
  : /user_not_found/.test(m) ? "No Gala Dock account uses that email — ask them to sign up first, then assign them."
  : /invalid_email/.test(m) ? "Enter a valid email address."
  : /invalid_field_key/.test(m) ? "Each question needs a unique key (lowercase letters, numbers and underscores)."
  : /options_required/.test(m) ? "Choice questions need at least one option."
  : /invalid_field|invalid_fields/.test(m) ? "Check the form questions."
  : /published_form_immutable/.test(m) ? "Published forms can't be edited — save a draft and publish a new version."
  : /not_found|P0002/.test(m) ? "Nothing to publish — save a draft first." : "Could not save — try again.";

async function sb() { return untyped(await createClient()); }
const bump = (eventId: string) => revalidatePath(`/organizer/events/${eventId}`);

const Zone = z.object({
  name: z.string().trim().min(1, "Give the zone a name.").max(80), kind: z.enum(ZONE_KINDS), capacity: z.number().int().min(1).max(1_000_000).nullable(),
  opens_at: When, closes_at: When, reentry: z.enum(["allow", "deny", "limited"]), max_entries: z.number().int().min(1).max(100).nullable(), status: z.enum(["active", "closed"]).optional(),
}).refine(z => z.reentry !== "limited" || !!z.max_entries, { message: "Limited re-entry needs a maximum number of entries." })
  .refine(z => !z.opens_at || !z.closes_at || Date.parse(z.closes_at) > Date.parse(z.opens_at), { message: "The zone must close after it opens." });

export async function saveAccessZone(eventId: string, input: unknown, zoneId?: string): Promise<ActionResult<{ id: string }>> {
  if (!Id.safeParse(eventId).success || (zoneId && !Id.safeParse(zoneId).success)) return { ok: false, error: "Invalid zone." };
  const p = Zone.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the zone details." };
  const z0 = p.data;
  const { data, error } = await (await sb()).rpc("save_access_zone", { p_event: eventId, p_id: zoneId ?? null, p_zone: { ...z0, capacity: z0.capacity ?? "", max_entries: z0.reentry === "limited" ? z0.max_entries : "", opens_at: z0.opens_at ?? "", closes_at: z0.closes_at ?? "" } });
  if (error) return { ok: false, error: why(error.message) };
  bump(eventId); return { ok: true, data: { id: (data as { id: string }).id }, message: zoneId ? "Zone updated." : "Zone added." };
}

const Rule = z.object({ tier_id: Id.optional(), pass_type: z.enum(PASS_TYPES).optional(), valid_from: When, valid_to: When })
  .refine(r => !!r.tier_id !== !!r.pass_type, { message: "Each rule admits either a ticket tier or a pass type." });
export async function saveZoneAccessRules(eventId: string, zoneId: string, rules: unknown): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(zoneId).success) return { ok: false, error: "Invalid zone." };
  const p = z.array(Rule).max(100).safeParse(rules); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the access rules." };
  const { error } = await (await sb()).rpc("set_zone_rules", { p_zone: zoneId, p_rules: p.data.map(r => ({ tier_id: r.tier_id ?? "", pass_type: r.pass_type ?? "", valid_from: r.valid_from ?? "", valid_to: r.valid_to ?? "" })) });
  if (error) return { ok: false, error: why(error.message) };
  bump(eventId); return { ok: true, message: p.data.length ? `Access saved — ${p.data.length} rule${p.data.length === 1 ? "" : "s"}.` : "Access rules cleared — only passes listing this zone get in." };
}

const Badge = z.object({ name: z.string().trim().min(1, "Name the template.").max(80), pass_types: z.array(z.enum(PASS_TYPES)).max(7), show: z.array(z.enum(BADGE_FIELDS)).min(1, "Pick at least one field.").max(BADGE_FIELDS.length),
  size: z.enum(["cr80", "a6", "a7"]), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
/** Saves a badge template; passing the family creates the next version (the previous one is superseded, never edited). */
export async function saveBadgeTemplate(eventId: string, input: unknown, familyId?: string): Promise<ActionResult<{ id: string; version: number }>> {
  if (!Id.safeParse(eventId).success || (familyId && !Id.safeParse(familyId).success)) return { ok: false, error: "Invalid template." };
  const p = Badge.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the template." };
  const { data, error } = await (await sb()).rpc("save_badge_template", { p_event: eventId, p_name: p.data.name, p_layout: { show: p.data.show, size: p.data.size, accent: p.data.accent }, p_pass_types: p.data.pass_types, p_family: familyId ?? null });
  if (error) return { ok: false, error: why(error.message) };
  const r = data as { id: string; version: number };
  bump(eventId); return { ok: true, data: r, message: `Badge template v${r.version} saved.` };
}

export async function assignScannerByEmail(eventId: string, email: string, zones: string[] = [], expiresAt?: string | null): Promise<ActionResult> {
  const e = z.string().trim().email().max(200).safeParse(email);
  if (!Id.safeParse(eventId).success || !e.success) return { ok: false, error: "Enter a valid email address." };
  if (!z.array(Id).max(30).safeParse(zones).success || (expiresAt && !z.string().datetime({ offset: true }).safeParse(expiresAt).success)) return { ok: false, error: "Check the zones and expiry." };
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return { ok: false, error: "The expiry must be in the future." };
  const { error } = await (await sb()).rpc("assign_event_scanner_by_email", { p_event: eventId, p_email: e.data, p_zones: zones, p_expires_at: expiresAt ?? null });
  if (error) return { ok: false, error: why(error.message) };
  bump(eventId); return { ok: true, message: `Door access granted to ${e.data}.` };
}

// ── Registration forms (drafts → publish) ─────────────────────────────────────────────────────────────────────────
const Field = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Question keys use lowercase letters, numbers and underscores."), label: z.string().trim().min(1, "Every question needs a label.").max(160),
  type: z.enum(["text", "textarea", "email", "phone", "number", "date", "select", "multiselect", "checkbox"]), required: z.boolean().default(false), sensitive: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(), help: z.string().max(300).optional(), max: z.number().int().min(1).max(5000).optional() })
  .refine(f => !["select", "multiselect"].includes(f.type) || (f.options?.length ?? 0) > 0, { message: "Choice questions need at least one option." });
const Form = z.object({ title: z.string().trim().min(1).max(120), fields: z.array(Field).max(40), capacity: z.number().int().min(1).max(1_000_000).nullable(),
  per_email_limit: z.number().int().min(1).max(20), approval_required: z.boolean(), waitlist: z.boolean(), opens_at: When, closes_at: When })
  .refine(f => new Set(f.fields.map(x => x.key)).size === f.fields.length, { message: "Each question needs a unique key." })
  .refine(f => !f.opens_at || !f.closes_at || Date.parse(f.closes_at) > Date.parse(f.opens_at), { message: "Registration must close after it opens." });

export async function saveRegistrationDraft(eventId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const p = Form.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const { data, error } = await (await sb()).rpc("save_registration_form_draft", { p_event: eventId, p_form: { ...p.data, capacity: p.data.capacity ?? "", opens_at: p.data.opens_at ?? "", closes_at: p.data.closes_at ?? "" } });
  if (error) return { ok: false, error: why(error.message) };
  bump(eventId); return { ok: true, data: { id: (data as { id: string }).id }, message: "Draft saved." };
}
export async function publishRegistrationDraft(eventId: string): Promise<ActionResult<{ id: string; version: number }>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const { data, error } = await (await sb()).rpc("publish_registration_form_draft", { p_event: eventId });
  if (error) return { ok: false, error: why(error.message) };
  const r = data as { id: string; version: number };
  bump(eventId); return { ok: true, data: r, message: `Registration form v${r.version} published — the public form uses it now.` };
}
export async function discardRegistrationDraft(eventId: string): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Invalid event." };
  const { error } = await (await sb()).rpc("discard_registration_form_draft", { p_event: eventId });
  if (error) return { ok: false, error: why(error.message) };
  bump(eventId); return { ok: true, message: "Draft discarded." };
}

/** Sensitive answers live in registration_private; RLS returns them only to the event owner and workspace owners/managers. */
export async function sensitiveAnswers(registrationId: string): Promise<ActionResult<Record<string, unknown>>> {
  if (!Id.safeParse(registrationId).success) return { ok: false, error: "Invalid registration." };
  const { data, error } = await (await sb()).from("registration_private").select("answers").eq("registration_id", registrationId).maybeSingle();
  if (error) return { ok: false, error: "Could not load the answers." };
  if (!data) return { ok: true, data: {} };   // none given, or the caller's role can't read them (RLS) — never an error
  return { ok: true, data: (data.answers ?? {}) as Record<string, unknown> };
}
