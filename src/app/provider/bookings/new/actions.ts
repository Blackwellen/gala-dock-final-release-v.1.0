"use server";

import { cookies } from "next/headers";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { DRAFT_COOKIE, POLICIES, readDraft, type BookingDraft } from "./draft";
import { resolveTerm } from "@/lib/master-data";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const num = (v: unknown, min = 0, max = 1e7) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; };

/** Merges a step's fields into the draft (sanitised) and moves to the requested step. */
export async function saveBookingStep(patch: BookingDraft, next: 1 | 2 | 3 | null): Promise<ActionResult> {
  const draft = { ...(await readDraft()) };
  const clean: BookingDraft = {
    venueId: str(patch.venueId, 40), eventName: str(patch.eventName, 120), eventType: str(patch.eventType, 40), guests: num(patch.guests, 1, 100000), date: str(patch.date, 10),
    start: str(patch.start, 5), end: str(patch.end, 5), description: str(patch.description, 500), requirements: Array.isArray(patch.requirements) ? patch.requirements.map(r => String(r).slice(0, 40)).slice(0, 12) : undefined,
    clientName: str(patch.clientName, 120), clientOrg: str(patch.clientOrg, 120), contactName: str(patch.contactName, 120), contactEmail: str(patch.contactEmail, 160), contactPhone: str(patch.contactPhone, 40), source: str(patch.source, 20),
    spaceId: str(patch.spaceId, 40), layout: str(patch.layout, 30), packageId: str(patch.packageId, 40), setupHours: num(patch.setupHours, 0, 24), breakdownHours: num(patch.breakdownHours, 0, 24),
    hold: typeof patch.hold === "boolean" ? patch.hold : undefined, holdHours: num(patch.holdHours, 2, 72),
    hire: num(patch.hire), hireBasis: patch.hireBasis === "hourly" ? "hourly" : patch.hireBasis === "fixed" ? "fixed" : undefined, minimumSpend: num(patch.minimumSpend),
    includes: Array.isArray(patch.includes) ? patch.includes.map(String).slice(0, 10) : undefined, fnbMode: ["none", "package", "custom"].includes(String(patch.fnbMode)) ? patch.fnbMode : undefined,
    fnbPerGuest: num(patch.fnbPerGuest), fnbIncludes: Array.isArray(patch.fnbIncludes) ? patch.fnbIncludes.map(String).slice(0, 12) : undefined,
    services: Array.isArray(patch.services) ? patch.services.slice(0, 12).map(s => ({ listingId: String(s.listingId).slice(0, 40), label: String(s.label).slice(0, 80), detail: String(s.detail ?? "").slice(0, 80), qty: num(s.qty, 1, 1000) ?? 1, unitPrice: num(s.unitPrice) ?? 0, image: String(s.image ?? "").slice(0, 300) })) : undefined,
    depositPct: num(patch.depositPct, 0, 100), secondPct: num(patch.secondPct, 0, 100), secondDays: num(patch.secondDays, 0, 365), finalPct: num(patch.finalPct, 0, 100), finalDays: num(patch.finalDays, 0, 365),
    policy: patch.policy && POLICIES[patch.policy] ? patch.policy : undefined, notes: str(patch.notes, 500),
  };
  for (const [k, v] of Object.entries(clean)) if (v !== undefined) (draft as Record<string, unknown>)[k] = v;
  if (next && next > 1 && (!draft.eventName || !draft.clientName || !draft.date || !draft.start || !draft.end || !draft.venueId)) {
    return { ok: false, error: "Add the venue, event name, date, times and client before continuing." };
  }
  if (next === 3 && !draft.spaceId) return { ok: false, error: "Choose a space to continue." };
  (await cookies()).set(DRAFT_COOKIE, JSON.stringify(draft), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/provider/bookings/new", maxAge: 60 * 60 * 24 * 7 });
  return { ok: true, message: next ? undefined : "Draft saved", redirect: next ? `/provider/bookings/new?step=${next}` : undefined };
}

export async function discardBookingDraft(): Promise<ActionResult> {
  (await cookies()).delete({ name: DRAFT_COOKIE, path: "/provider/bookings/new" });
  return { ok: true, redirect: "/provider/bookings" };
}

/** London wall-clock date + time → ISO instant (handles BST/GMT). */
function londonIso(date: string, time: string, addDays = 0) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d + addDays, hh, mm);
  const tz = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" }).formatToParts(new Date(guess)).find(p => p.type === "timeZoneName")?.value ?? "GMT";
  const off = Number(tz.match(/GMT([+-]\d+)/)?.[1] ?? 0);
  return new Date(guess - off * 36e5).toISOString();
}

/** Creates the booking atomically via provider_create_booking. Creating a booking never records a payment. */
export async function confirmBooking(patch: BookingDraft): Promise<ActionResult> {
  const saved = await saveBookingStep(patch, null);
  if (!saved.ok) return saved;
  const d = await readDraft();
  if (!d.eventName || !d.clientName || !d.date || !d.start || !d.end || !d.spaceId) return { ok: false, error: "Some details are missing — go back and complete steps 1 and 2." };
  const startsAt = londonIso(d.date, d.start), endsAt = londonIso(d.date, d.end, d.end <= d.start ? 1 : 0);
  const hours = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 36e5;
  const hire = d.hireBasis === "hourly" ? (d.hire ?? 0) * hours : d.hire ?? 0;
  const fnb = d.fnbMode === "none" ? 0 : (d.fnbPerGuest ?? 0) * (d.guests ?? 0);
  const services = (d.services ?? []).reduce((a, s) => a + s.qty * s.unitPrice, 0);
  const value = Math.round((Math.max(hire + fnb, d.minimumSpend ?? 0) + services) * 100) / 100;
  if (value <= 0) return { ok: false, error: "Set the venue hire or another price before confirming." };
  const { db, workspace } = await getProvider();
  const policy = POLICIES[d.policy ?? "standard"];
  const { data, error } = await db.rpc("provider_create_booking", { p_ws: workspace.id, p: {
    listing_id: d.venueId, space_id: d.spaceId, package_id: d.packageId || null, client_name: d.clientName, client_org: d.clientOrg ?? "", client_email: d.contactEmail ?? "",
    // The draft keeps the wording; the record stores the canonical key.
    event_name: d.eventName, event_type: resolveTerm("event_type", d.eventType) ?? "custom",
    starts_at: startsAt, ends_at: endsAt, guests: d.guests ?? null, layout: d.layout ?? "", hold: d.hold ? "true" : "false",
    value, deposit_pct: d.depositPct ?? 25, cancellation: policy.tiers,
    items: [{ label: "Venue hire", amount: hire }, ...(fnb ? [{ label: "Food & beverage", amount: fnb }] : []), ...(d.services ?? []).map(s => ({ label: s.label, amount: s.qty * s.unitPrice }))],
    details: { beo: { setup: `${d.setupHours ?? 0} hours before doors`, breakdown: `${d.breakdownHours ?? 0} hours after close`, fnb: d.fnbMode === "none" ? "No F&B" : (d.fnbIncludes ?? []).join(", "), access: "", compliance: [] },
      requirements: d.requirements ?? [], description: d.description ?? "", source: d.source ?? "direct", contact: { name: d.contactName, phone: d.contactPhone },
      schedule: { deposit_pct: d.depositPct ?? 25, second_pct: d.secondPct ?? 50, second_days: d.secondDays ?? 30, final_pct: d.finalPct ?? 25, final_days: d.finalDays ?? 7 }, notes: d.notes ?? "", hold_hours: d.hold ? d.holdHours ?? 24 : null },
  } });
  if (error) return { ok: false, error: friendly(error) };
  (await cookies()).delete({ name: DRAFT_COOKIE, path: "/provider/bookings/new" });
  return { ok: true, message: d.hold ? "Booking created on hold" : "Booking confirmed", redirect: `/provider/bookings/${data}` };
}
