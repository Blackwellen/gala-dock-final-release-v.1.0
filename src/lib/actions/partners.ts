"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { opsError } from "@/lib/ops/errors";
import { siteUrl } from "@/lib/site-url";
import type { ActionResult } from "./shell";

/**
 * Plan › Partners (Q24): sponsors, exhibitors, talent, packages, deliverables, booths, passes, slots, riders, contracts and money.
 * Every write is one database command (migration 202610293015/3018) that re-checks authority (owner/manager of the event),
 * locks and state machines; this file validates input shape and translates the machine errors.
 */
const MANAGE = ["owner", "admin", "manager"];
const Id = z.string().uuid();
// Blank form fields mean "not set" (checked before coercion, so "" never becomes 0).
const opt = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal("").transform(() => undefined), z.null().transform(() => undefined), s.optional()]);
const money = z.coerce.number().min(0).max(10_000_000);
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const iso = z.string().refine(v => !Number.isNaN(Date.parse(v)), "date");

const PartyKind = z.enum(["sponsor", "exhibitor", "artist", "speaker", "performer", "host"]);
const Party = z.object({
  kind: PartyKind.optional(), name: z.string().trim().min(1).max(160), client_id: opt(Id), talent_profile_id: opt(Id), package_id: opt(Id),
  fee: opt(money), contact_name: z.string().trim().max(160).default(""), contact_email: z.string().trim().email().max(200).or(z.literal("")).default(""),
  contact_phone: z.string().trim().max(60).default(""), arrival_buffer_minutes: opt(int(0, 1440)), notes: z.string().max(2000).default(""),
});
const Benefit = z.object({ kind: z.enum(["logo_placement", "booth", "passes", "stage_mention", "speaking_slot", "social_post", "email_feature", "hospitality", "parking", "signage", "asset", "other"]),
  title: z.string().trim().min(1).max(160), quantity: opt(int(1, 1000)), pass_type: opt(z.enum(["guest", "staff", "supplier", "artist", "vip", "backstage", "press"])),
  owed_by: z.enum(["organizer", "party"]).default("organizer"), due_days_before: opt(int(0, 365)), evidence_required: z.boolean().default(true) })
  .refine(b => b.kind !== "passes" || !!b.pass_type, "pass_type");
const Package = z.object({ kind: z.enum(["sponsorship", "exhibitor"]).optional(), name: z.string().trim().min(1).max(120), tier: z.string().trim().max(60).default(""),
  description: z.string().max(2000).default(""), price: opt(money), quantity: opt(int(1, 10000)), status: opt(z.enum(["draft", "active", "retired"])), benefits: z.array(Benefit).max(50).optional() });
const Deliverable = z.object({ title: z.string().trim().min(1).max(160), kind: opt(z.string().max(40)), quantity: opt(int(1, 1000)), owed_by: z.enum(["organizer", "party"]).default("organizer"),
  due_at: opt(iso), evidence_required: z.boolean().default(true) });
const Evidence = z.object({ url: z.string().trim().max(600).regex(/^https:\/\//i, "https").or(z.literal("")).default(""), note: z.string().trim().max(1000).default("") })
  .refine(v => v.url || v.note.length >= 3, "evidence");
const Booth = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().max(120).default(""), package_id: opt(Id), width_m: opt(z.coerce.number().positive().max(1000)),
  depth_m: opt(z.coerce.number().positive().max(1000)), power_kw: opt(z.coerce.number().min(0).max(10000)), price: opt(money), venue_map_id: opt(Id),
  map_element_ref: z.string().trim().max(120).default(""), zone_id: opt(Id), status: opt(z.enum(["available", "blocked", "retired"])) });
const PassReq = z.object({ pass_type: z.enum(["guest", "staff", "supplier", "artist", "vip", "backstage", "press"]), quantity: int(1, 500), zone_id: opt(Id), valid_from: opt(iso), valid_to: opt(iso) });
const Holders = z.object({ holders: z.array(z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(200).or(z.literal("")).default("") })).min(1).max(500) });
const Slot = z.object({ item: Id, role: z.enum(["headline", "support", "performer", "speaker", "panelist", "host", "soundcheck", "other"]).default("performer"),
  status: z.enum(["tentative", "confirmed", "cancelled"]).default("tentative"), note: z.string().max(500).default("") });
const RiderItem = z.object({ category: z.enum(["backline", "audio", "lighting", "video", "power", "staging", "dressing_room", "catering", "drinks", "accommodation", "ground_transport", "flights", "parking", "guest_list", "security", "other"]),
  description: z.string().trim().min(1).max(500), quantity: opt(int(1, 1000)), required: z.boolean().default(true) });
const Rider = z.object({ kind: z.enum(["technical", "hospitality", "travel"]), summary: z.string().max(2000).default(""), items: z.array(RiderItem).min(1).max(200) });
const Note = z.object({ note: z.string().trim().max(1000).default("") });
const Money = z.object({ direction: z.enum(["receivable", "payable"]), ref: z.string().regex(/^(inv|pay):[0-9a-f-]{36}$/i), amount: opt(money), note: z.string().max(300).default("") });
const Talent = z.object({ kind: z.enum(["artist", "band", "dj", "speaker", "performer", "host", "other"]), name: z.string().trim().min(1).max(160), agent_name: z.string().trim().max(160).default(""),
  agent_email: z.string().trim().email().max(200).or(z.literal("")).default(""), website: z.string().trim().max(300).default("") });

export type PartnersOp = "package" | "party" | "transition" | "portal" | "unportal" | "deliverable" | "evidence" | "deliverable_to" | "booth" | "allocate" | "release"
  | "pass_request" | "issue" | "pass_cancel" | "slot" | "rider" | "rider_decide" | "rider_fulfil" | "contract_create" | "contract_link" | "money" | "talent";

const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const first = (e: z.ZodError) => { const i = e.issues[0]; const k = String(i?.path[0] ?? ""); return i?.message === "pass_type" ? "Passes benefits need a pass type." : i?.message === "https" ? "Links must start with https://" : i?.message === "evidence" ? "Add an https:// link or a note (3+ characters)." : k === "contact_email" || k === "agent_email" ? "Enter a valid email." : k ? `Check “${k.replace(/_/g, " ")}”.` : "Check the details entered."; };

/**
 * Dispatcher used by the Partners section (bound per row in the server component).
 * `ref` is the record the op acts on (party / package / booth / deliverable / request / rider / item id) or null to create.
 * `extra` carries fixed parameters chosen by the button (target state, expected version, decision).
 */
export async function partnersCommand(eventId: string, op: PartnersOp, ref: string | null, extra: Record<string, unknown>, values: Record<string, unknown> = {}): Promise<ActionResult> {
  const ctx = await getOrganizer();
  if (!Id.safeParse(eventId).success || (ref !== null && !Id.safeParse(ref).success)) return { ok: false, error: "Record not found." };
  if (!MANAGE.includes(String(ctx.role))) return { ok: false, error: "Only the event's owners and managers can change partners." };
  const sb = untyped(ctx.supabase);
  const call = async (fn: string, args: Record<string, unknown>) => { const r = await sb.rpc(fn, args); return r; };
  const done = (message: string, data?: unknown): ActionResult => { revalidatePath(`/organizer/events/${eventId}`); return { ok: true, message, data }; };
  const fail = (e: Parameters<typeof opsError>[0]) => ({ ok: false, error: opsError(e) });
  let r;
  switch (op) {
    case "package": {
      const p = Package.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      r = await call("package_save", { p_event: eventId, p: clean({ ...p.data, kind: p.data.kind ?? extra.kind, benefits: p.data.benefits?.map(clean) }), p_id: ref });
      return r.error ? fail(r.error) : done(ref ? "Package updated." : "Package created.");
    }
    case "party": {
      const p = (ref ? Party : Party.extend({ kind: PartyKind })).safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      const body = clean({ ...p.data, kind: ref ? undefined : p.data.kind });
      if (ref) for (const k of ["client_id", "talent_profile_id", "package_id"] as const) if (k in values) (body as Record<string, unknown>)[k] = p.data[k] ?? "";
      const version = typeof extra.version === "number" ? extra.version : null;
      r = await call("party_save", { p_event: eventId, p: body, p_id: ref, p_expected_version: version });
      if (r.error) return fail(r.error);
      const d = r.data as { ok: boolean; conflict?: boolean; current_version?: number };
      if (d?.conflict) return { ok: false, error: `Someone else changed this partner while you were editing (now version ${d.current_version}). Close this, refresh and re-apply your change.` };
      return done(ref ? "Partner saved." : "Partner added.");
    }
    case "transition": {
      const to = String(extra.to ?? ""); const n = Note.safeParse(values);
      if (!["prospect", "negotiating", "confirmed", "completed", "cancelled", "withdrawn"].includes(to) || !n.success) return { ok: false, error: "Choose a valid status." };
      if (["cancelled", "withdrawn"].includes(to) && n.data.note.length < 3) return { ok: false, error: "Add a short reason." };
      r = await call("party_transition", { p_party: ref, p_to: to, p_reason: n.data.note || null, p_expected: typeof extra.from === "string" ? extra.from : null });
      if (r.error) return fail(r.error);
      const d = r.data as { ok?: boolean; conflict?: boolean; current?: string };
      if (d?.conflict) return { ok: false, error: `This partner is now ${String(d.current ?? "changed").replace(/_/g, " ")} — refresh to see the latest status.` };
      return done(to === "confirmed" ? "Confirmed — package allocated, deliverables and pass requests created." : `Moved to ${to}.`);
    }
    case "portal": {
      const e = z.object({ email: z.string().trim().email().max(200) }).safeParse(values); if (!e.success) return { ok: false, error: "Enter the email of their Gala Dock login." };
      r = await call("party_link_portal_user", { p_party: ref, p_email: e.data.email });
      return r.error ? fail(r.error) : done("Portal access linked — they get an in-app notification with the link.", { copy: `${siteUrl()}/portal/parties/${ref}`, title: "Portal link (share with them)" });
    }
    case "unportal": r = await call("party_link_portal_user", { p_party: ref, p_email: null }); return r.error ? fail(r.error) : done("Portal access removed.");
    case "deliverable": {
      const p = Deliverable.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      const party = String(extra.party ?? ""); if (!Id.safeParse(party).success) return { ok: false, error: "Partner not found." };
      r = await call("deliverable_save", { p_party: party, p: clean(p.data), p_id: ref });
      return r.error ? fail(r.error) : done(ref ? "Deliverable updated." : "Deliverable added.");
    }
    case "evidence": {
      const p = Evidence.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      r = await call("deliverable_add_evidence", { p_deliverable: ref, p: clean({ url: p.data.url || undefined, note: p.data.note, kind: p.data.url ? "url" : "note" }) });
      return r.error ? fail(r.error) : done("Evidence added.");
    }
    case "deliverable_to": {
      const to = String(extra.to ?? ""); const n = Note.safeParse(values);
      if (!["pending", "in_progress", "submitted", "approved", "rejected", "waived"].includes(to) || !n.success) return { ok: false, error: "Choose a valid status." };
      r = await call("deliverable_transition", { p_deliverable: ref, p_to: to, p_note: n.data.note || null });
      return r.error ? fail(r.error) : done(`Deliverable ${to.replace("_", " ")}.`);
    }
    case "booth": {
      const p = Booth.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      const body: Record<string, unknown> = clean({ ...p.data, map_element_ref: p.data.map_element_ref || undefined });
      if (ref) { body.map_element_ref = p.data.map_element_ref; body.venue_map_id = p.data.venue_map_id ?? ""; body.zone_id = p.data.zone_id ?? ""; body.package_id = p.data.package_id ?? ""; }
      r = await call("booth_save", { p_event: eventId, p: body, p_id: ref });
      return r.error ? fail(r.error) : done(ref ? "Booth updated." : "Booth added.");
    }
    case "allocate": {
      // ref = the partner; the booth is chosen in the form.
      const p = z.object({ booth: Id, reserve_only: z.boolean().default(false) }).safeParse(values); if (!p.success) return { ok: false, error: "Choose a booth." };
      r = await call("booth_allocate", { p_booth: p.data.booth, p_party: ref, p_reserve_only: p.data.reserve_only });
      return r.error ? fail(r.error) : done(p.data.reserve_only ? "Booth reserved." : "Booth allocated.");
    }
    case "release": r = await call("booth_release", { p_booth: ref }); return r.error ? fail(r.error) : done("Booth released.");
    case "pass_request": {
      const p = PassReq.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      if (p.data.valid_from && p.data.valid_to && Date.parse(p.data.valid_to) <= Date.parse(p.data.valid_from)) return { ok: false, error: "The pass window must end after it starts." };
      r = await call("pass_request_save", { p_party: ref, p: clean({ pass_type: p.data.pass_type, quantity: p.data.quantity, zone_ids: p.data.zone_id ? [p.data.zone_id] : [], valid_from: p.data.valid_from, valid_to: p.data.valid_to }) });
      return r.error ? fail(r.error) : done("Pass request added.");
    }
    case "issue": {
      const p = Holders.safeParse(values); if (!p.success) return { ok: false, error: "Add a name (2+ characters) and optional valid email for every holder." };
      r = await call("party_issue_passes", { p_request: ref, p_holders: p.data.holders });
      if (r.error) return fail(r.error);
      const d = r.data as { issued: number; quantity: number };
      return done(`Passes issued (${d.issued} of ${d.quantity}). Holders are not emailed from here.`);
    }
    case "pass_cancel": r = await call("pass_request_cancel", { p_request: ref }); return r.error ? fail(r.error) : done("Pass request cancelled.");
    case "slot": {
      const p = Slot.safeParse(values); if (!p.success) return { ok: false, error: "Choose a programme item." };
      r = await call("party_slot_set", { p_party: ref, p_item: p.data.item, p_role: p.data.role, p_status: p.data.status, p_note: p.data.note });
      return r.error ? fail(r.error) : done(p.data.status === "confirmed" ? "Slot confirmed." : `Slot ${p.data.status}.`);
    }
    case "rider": {
      const p = Rider.safeParse(values); if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "items" ? "Add at least one rider item with a description." : first(p.error) };
      r = await call("rider_submit", { p_party: ref, p_kind: p.data.kind, p_summary: p.data.summary, p_items: p.data.items.map(clean) });
      return r.error ? fail(r.error) : done(`Rider v${(r.data as { version: number }).version} recorded.`);
    }
    case "rider_decide": {
      const decision = String(extra.decision ?? ""); const n = Note.safeParse(values);
      if (!["accepted", "changes_requested"].includes(decision) || !n.success) return { ok: false, error: "Choose accept or request changes." };
      r = await call("rider_decide", { p_rider: ref, p_decision: decision, p_note: n.data.note || null });
      if (r.error) return fail(r.error);
      const t = (r.data as { tasks: number }).tasks;
      return done(decision === "accepted" ? `Rider accepted${t ? ` — ${t} task${t > 1 ? "s" : ""} opened for required items` : ""}.` : "Changes requested.");
    }
    case "rider_fulfil": {
      const p = z.object({ status: z.enum(["pending", "confirmed", "substituted", "declined", "not_needed"]), note: z.string().max(500).default("") }).safeParse(values);
      if (!p.success) return { ok: false, error: "Choose a fulfilment status." };
      r = await call("rider_item_fulfil", { p_item: ref, p_status: p.data.status, p_note: p.data.note || null });
      return r.error ? fail(r.error) : done("Rider item updated.");
    }
    case "contract_create": {
      const p = z.object({ title: z.string().trim().max(200).default("") }).safeParse(values); if (!p.success) return { ok: false, error: "Check the title." };
      r = await call("party_create_contract", { p_party: ref, p_title: p.data.title || null, p_body: null });
      return r.error ? fail(r.error) : done("Draft contract created — open Sales › Contracts to edit and send it.");
    }
    case "contract_link": {
      const p = z.object({ contract: Id }).safeParse(values); if (!p.success) return { ok: false, error: "Choose a contract." };
      r = await call("party_link_contract", { p_party: ref, p_contract: p.data.contract });
      return r.error ? fail(r.error) : done("Contract linked.");
    }
    case "money": {
      if (!["owner", "admin", "manager"].includes(String(ctx.role))) return { ok: false, error: "Only owners and managers can link money." };
      const p = Money.safeParse(values); if (!p.success) return { ok: false, error: "Choose an invoice or payment." };
      const [kind, id] = p.data.ref.split(":") as ["inv" | "pay", string];
      r = await call("party_link_money", { p_party: ref, p_direction: p.data.direction, p_invoice: kind === "inv" ? id : null, p_payment: kind === "pay" ? id : null, p_amount: p.data.amount ?? null, p_due: null, p_note: p.data.note });
      return r.error ? fail(r.error) : done("Money linked (reference only — payments are unchanged).");
    }
    case "talent": {
      const p = Talent.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      const ins = await sb.from("talent_profiles").insert({ workspace_id: ctx.workspace.id, ...p.data }).select("id").single();
      if (ins.error) return { ok: false, error: ins.error.code === "23505" ? "A talent profile with this name already exists." : "Couldn't add the talent profile." };
      return done("Talent profile added — link it from the partner editor.");
    }
  }
  return { ok: false, error: "Unknown action." };
}
