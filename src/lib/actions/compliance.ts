"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { opsError } from "@/lib/ops/errors";
import type { ActionResult } from "./shell";

/**
 * Plan › Compliance / Accessibility and Operations › Weather (Q26, migration 202610293017). Rule packs are data and need legal
 * review — nothing here states that an event is legally compliant. Weather has no provider configured (BLOCKED_EXTERNAL).
 */
const MANAGE = ["owner", "admin", "manager"];
const Id = z.string().uuid();
const blank = z.union([z.literal(""), z.null()]).transform(() => undefined);
const opt = <T extends z.ZodTypeAny>(s: T) => z.union([blank, s.optional()]);
const iso = z.string().refine(v => !Number.isNaN(Date.parse(v)), "date");
const tri = z.boolean().nullable().default(null);
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const Profile = z.object({ country: z.string().trim().regex(/^[A-Za-z]{2}$/).or(z.literal("")).default(""), region: z.string().trim().max(60).default(""), expected_attendance: opt(int(0, 1_000_000)),
  alcohol: tri, live_music: tri, recorded_music: tri, late_night: tri, hot_food: tri, children_performing: tri, outdoor: tri, notes: z.string().max(2000).default("") });
const Licence = z.object({ licence_type: z.string().regex(/^[a-z0-9_]{2,60}$/).optional(), holder: z.enum(["organizer", "venue", "supplier", "other"]), authority: z.string().trim().max(160).default(""),
  reference: z.string().trim().max(120).default(""), valid_from: opt(iso), valid_to: opt(iso), conditions: z.string().max(2000).default("") });
const Plan = z.object({ title: z.string().trim().max(160).default(""), stewards: opt(int(0, 100000)), first_aiders: opt(int(0, 100000)), medical_provider: z.string().trim().max(160).default(""),
  review_due: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), sections: z.array(z.object({ heading: z.string().trim().min(1).max(160), body: z.string().max(8000).default("") })).max(40).default([]) });
const Access = z.object({ step_free: tri, accessible_toilets: int(0, 1000), changing_places: z.boolean(), hearing_loop: z.boolean(), bsl_interpretation: z.boolean(), captioning: z.boolean(), quiet_space: z.boolean(),
  assistance_dogs: z.boolean(), accessible_seating: int(0, 100000), companion_seats: int(0, 100000), venue_map_id: opt(Id), route_refs: z.string().max(1000).default(""),
  route_note: z.string().max(1000).default(""), public_summary: z.string().max(2000).default("") });
const Watch = z.object({ location_label: z.string().trim().max(160).default(""), latitude: opt(z.coerce.number().min(-90).max(90)), longitude: opt(z.coerce.number().min(-180).max(180)),
  window_from: opt(iso), window_to: opt(iso), wind_kph: opt(z.coerce.number().min(0).max(300)), gust_kph: opt(z.coerce.number().min(0).max(400)), rain_mm_h: opt(z.coerce.number().min(0).max(200)),
  temp_max_c: opt(z.coerce.number().min(-50).max(60)), temp_min_c: opt(z.coerce.number().min(-60).max(50)), lightning: z.boolean().default(true) });
const Contingency = z.object({ trigger_kind: z.enum(["wind", "rain", "heat", "cold", "lightning", "flood", "other"]), threshold_text: z.string().trim().max(200).default(""),
  action: z.enum(["delay", "move_indoors", "shelter", "reduce_capacity", "cancel", "other"]), action_detail: z.string().max(2000).default(""), decision_owner: z.string().trim().max(160).default(""),
  decision_deadline_hours: opt(int(0, 720)), comms_note: z.string().max(1000).default("") });

export type ComplianceOp = "profile" | "licence" | "licence_to" | "licence_clear" | "plan" | "plan_submit" | "plan_decide" | "access" | "access_approve" | "watch" | "watch_status" | "contingency" | "contingency_approve" | "contingency_retire" | "alert_ack";
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const first = (e: z.ZodError) => { const k = String(e.issues[0]?.path[0] ?? ""); return k ? `Check “${k.replace(/_/g, " ")}”.` : "Check the details entered."; };
const LICENCE_TO = ["submitted", "granted", "refused", "withdrawn", "expired", "revoked", "not_required", "draft"];

export async function complianceCommand(eventId: string, op: ComplianceOp, ref: string | null, extra: Record<string, unknown>, values: Record<string, unknown> = {}): Promise<ActionResult> {
  const ctx = await getOrganizer();
  if (!Id.safeParse(eventId).success || (ref !== null && !Id.safeParse(ref).success)) return { ok: false, error: "Record not found." };
  if (!MANAGE.includes(String(ctx.role))) return { ok: false, error: "Only the event's owners and managers can change compliance, accessibility and weather." };
  const sb = untyped(ctx.supabase);
  const res = async (fn: string, args: Record<string, unknown>, message: string) => {
    const r = await sb.rpc(fn, args); if (r.error) return { ok: false, error: opsError(r.error) };
    const d = r.data as { ok?: boolean; conflict?: boolean; current?: string } | null;
    if (d && d.ok === false && d.conflict) return { ok: false, error: `This record is now ${String(d.current ?? "changed").replace(/_/g, " ")} — refresh to see the latest.` };
    revalidatePath(`/organizer/events/${eventId}`); return { ok: true, message };
  };
  const note = z.object({ note: z.string().trim().max(1000).default("") }).safeParse(values); const n = note.success ? note.data.note : "";
  switch (op) {
    case "profile": {
      const p = Profile.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      return res("compliance_profile_save", { p_event: eventId, p: { ...p.data, country: p.data.country.toUpperCase(), expected_attendance: p.data.expected_attendance ?? "" } }, "Answers saved — requirements re-checked.");
    }
    case "licence": {
      const p = (ref ? Licence : Licence.extend({ licence_type: z.string().regex(/^[a-z0-9_]{2,60}$/) })).safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      return res("licence_save", { p_event: eventId, p: clean(p.data), p_id: ref }, ref ? "Licence updated." : "Licence recorded as draft.");
    }
    case "licence_to": {
      const to = String(extra.to ?? ""); if (!LICENCE_TO.includes(to)) return { ok: false, error: "Choose a valid status." };
      const g = z.object({ reference: z.string().trim().max(120).default(""), valid_from: opt(iso), valid_to: opt(iso) }).safeParse(values);
      if (!g.success) return { ok: false, error: first(g.error) };
      if (to === "not_required" && n.length < 10) return { ok: false, error: "Explain why this licence isn't needed (at least 10 characters)." };
      return res("licence_transition", { p_licence: ref, p_to: to, p_note: n || null, p: clean({ reference: g.data.reference || undefined, valid_from: g.data.valid_from, valid_to: g.data.valid_to }) }, `Licence ${to.replace(/_/g, " ")}.`);
    }
    case "licence_clear": {
      // Explicit clear of the valid-to date (licence_clear_expiry, 202610294040): the licence editor's blank date is ignored by design.
      // Refused for granted licences whose type expires (a granted expiring licence must keep its valid-to date).
      if (!ref) return { ok: false, error: "Record not found." };
      if (n.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
      return res("licence_clear_expiry", { p_licence: ref, p_reason: n || null }, "Expiry date cleared.");
    }
    case "plan": {
      const kind = String(extra.kind ?? values.kind ?? ""); if (!["event_safety", "crowd", "fire", "evacuation", "first_aid", "medical", "security", "safeguarding", "weather"].includes(kind)) return { ok: false, error: "Choose a plan kind." };
      const p = Plan.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      return res("safety_plan_save", { p_event: eventId, p_kind: kind, p: clean({ ...p.data, sections: p.data.sections }) }, "Draft saved.");
    }
    case "plan_submit": return res("safety_plan_submit", { p_plan: ref }, "Submitted — another manager (or the owner) must approve it.");
    case "plan_decide": {
      const dec = String(extra.decision ?? ""); if (!["approved", "changes_requested"].includes(dec)) return { ok: false, error: "Choose approve or request changes." };
      if (dec === "changes_requested" && n.length < 3) return { ok: false, error: "Say what needs to change." };
      return res("safety_plan_decide", { p_plan: ref, p_decision: dec, p_note: n || null }, dec === "approved" ? "Plan approved — the previous approved version is superseded." : "Changes requested.");
    }
    case "access": {
      const p = Access.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      const { route_refs, ...rest } = p.data; const refs = route_refs.split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);
      if (refs.length && !rest.venue_map_id) return { ok: false, error: "Choose the event map the route elements belong to." };
      return res("accessibility_save", { p_event: eventId, p: { ...clean(rest), step_free: rest.step_free, accessible_route_refs: refs } }, "Accessibility saved. A changed public summary needs approval again.");
    }
    case "access_approve": return res("accessibility_approve_summary", { p_event: eventId }, "Public accessibility summary approved.");
    case "watch": {
      const p = Watch.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      const { wind_kph, gust_kph, rain_mm_h, temp_max_c, temp_min_c, lightning, ...rest } = p.data;
      return res("weather_watch_save", { p_event: eventId, p: { ...clean(rest), status: "active", thresholds: clean({ wind_kph, gust_kph, rain_mm_h, temp_max_c, temp_min_c, lightning }) } }, "Weather watch saved. Forecasts arrive only once a weather provider is configured.");
    }
    case "watch_status": {
      const st = String(extra.status ?? ""); if (!["active", "paused", "ended"].includes(st)) return { ok: false, error: "Choose a status." };
      return res("weather_watch_save", { p_event: eventId, p: { status: st } }, st === "ended" ? "Weather watch ended." : st === "paused" ? "Weather watch paused." : "Weather watch restarted.");
    }
    case "contingency": {
      const p = Contingency.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      return res("contingency_plan_save", { p_event: eventId, p: clean(p.data), p_id: ref }, ref ? "Contingency plan updated — it's back to draft and needs approval." : "Contingency plan drafted.");
    }
    case "contingency_approve": return res("contingency_plan_approve", { p_plan: ref }, "Contingency plan approved.");
    case "contingency_retire": return res("contingency_plan_save", { p_event: eventId, p: { status: "retired" }, p_id: ref }, "Contingency plan retired.");
    case "alert_ack": return res("weather_alert_acknowledge", { p_alert: ref }, "Alert acknowledged.");
  }
  return { ok: false, error: "Unknown action." };
}
