"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

const t = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const num = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); const n = Number(v); return v !== "" && Number.isFinite(n) ? n : null; };
const on = (fd: FormData, k: string) => fd.get(k) === "on";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function save(venueId: string | null, p: Record<string, unknown>) {
  const { db, workspace } = await getProvider();
  const { data, error } = await db.rpc("provider_save_listing", { p_ws: workspace.id, p_listing: venueId, p });
  if (error) return { ok: false as const, error: friendly(error) };
  revalidatePath("/provider/listings");
  if (venueId) revalidatePath(`/provider/venues/${venueId}`);
  return { ok: true as const, id: String(data) };
}
async function details(venueId: string) {
  const { db, workspace } = await getProvider();
  const { data } = await db.from("listings").select("details").eq("id", venueId).eq("workspace_id", workspace.id).eq("kind", "venue").maybeSingle();
  return data ? (data.details ?? {}) as Record<string, unknown> : null;
}

/** Geocodes a UK address with OpenStreetMap Nominatim (server-side, identified). Returns null when not found — never a guessed point. */
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb,ie&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "GalaDock/1.0 (venue setup)" }, signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch { return null; }
}

/** Step 1 — identity, contact and address. Creates the draft venue on first save. */
export async function saveIdentity(venueId: string | null, next: string | null, fd: FormData): Promise<ActionResult> {
  if (venueId && !isUuid(venueId)) return { ok: false, error: "Venue not found." };
  const name = t(fd, "name", 100), summary = t(fd, "summary", 500), email = t(fd, "email", 120);
  const a = { line1: t(fd, "line1", 120), line2: t(fd, "line2", 120), city: t(fd, "city", 80), postcode: t(fd, "postcode", 12).toUpperCase(), country: t(fd, "country", 60) || "United Kingdom" };
  if (name.length < 2) return { ok: false, error: "Enter the venue name." };
  if (summary.length < 40) return { ok: false, error: "Write a summary of at least 40 characters." };
  if (!email || !EMAIL.test(email)) return { ok: false, error: "Enter a valid contact email." };
  if (!a.line1 || !a.city || !a.postcode) return { ok: false, error: "Add the address, city and postcode." };
  const prev = venueId ? await details(venueId) : {};
  if (venueId && !prev) return { ok: false, error: "Venue not found." };
  const geo = await geocode(`${a.line1}, ${a.city}, ${a.postcode}`);
  const r = await save(venueId, {
    ...(venueId ? {} : { kind: "venue" }), name, description: summary, city: a.city, location: [a.line1, a.city, a.postcode].filter(Boolean).join(", "), category: t(fd, "type", 60),
    details: { type: t(fd, "type", 60), timezone: t(fd, "timezone", 40) || "Europe/London", address: a, geo,
      contact: { ...((prev?.contact ?? {}) as object), person: t(fd, "person", 80), email, phone: t(fd, "phone", 40) } },
  });
  if (!r.ok) return r;
  return { ok: true, message: geo ? "Venue details saved" : "Saved — we couldn’t place this address on the map; check the postcode", redirect: fd.get("_draft") ? `/provider/venues/new?venue=${r.id}&step=1` : (next ?? "").replace("{venue}", r.id) || `/provider/venues/new?venue=${r.id}&step=1` };
}

/** Step 3 — pricing, deposits, booking mode, response, cancellation and holds/standby/emergency. */
export async function saveCommercialStep(venueId: string, next: string | null, fd: FormData): Promise<ActionResult> {
  const prev = await details(venueId);
  if (!prev) return { ok: false, error: "Venue not found." };
  const pricing = t(fd, "pricing", 20) || "hourly", from = num(fd, "rate_from"), to = num(fd, "rate_to");
  if (pricing !== "quote" && (from === null || from <= 0)) return { ok: false, error: "Enter a starting rate, or choose Quote only." };
  if (from !== null && to !== null && to < from) return { ok: false, error: "The upper rate must be at least the starting rate." };
  const deposit = num(fd, "deposit") ?? 0, depositMode = t(fd, "deposit_mode", 10) || "percent";
  if (depositMode === "percent" && (deposit < 0 || deposit > 100)) return { ok: false, error: "Deposit must be between 0 and 100%." };
  const response = num(fd, "response_hours") ?? 4;
  if (![2, 4, 8, 12, 24].includes(response)) return { ok: false, error: "Choose a response commitment." };
  const cancellation = [0, 1, 2].map(i => ({ window: t(fd, `c_window_${i}`, 30), refund: Math.min(100, Math.max(0, num(fd, `c_refund_${i}`) ?? 0)) })).filter(c => c.window);
  if (!cancellation.length) return { ok: false, error: "Add at least one cancellation window." };
  const mode = t(fd, "booking_mode", 10) || "request";
  const r = await save(venueId, {
    booking_mode: mode, response_hours: response, price_from: pricing === "quote" ? null : from, price_unit: pricing === "daily" ? "per day" : pricing === "package" ? "per package" : "per hour",
    emergency_supply: on(fd, "emergency"),
    details: { commercial: { ...((prev.commercial ?? {}) as object), pricing, rate_from: from, rate_to: to, variable_rates: on(fd, "variable_rates"), minimum_spend: num(fd, "minimum_spend") ?? 0,
      deposit_mode: depositMode, deposit_pct: depositMode === "percent" ? deposit : null, deposit_fixed: depositMode === "fixed" ? deposit : null, balance_days: num(fd, "balance_days") ?? 14,
      security_deposit: num(fd, "security_deposit") ?? 0, lead_days: num(fd, "lead_days") ?? 0, short_notice: on(fd, "short_notice"), cancellation,
      holds: { enabled: on(fd, "holds"), hours: num(fd, "hold_hours") ?? 48 }, standby: { enabled: on(fd, "standby"), fee: num(fd, "standby_fee") ?? 0 },
      emergency: { enabled: on(fd, "emergency"), multiplier: num(fd, "emergency_multiplier") ?? 1.5 } } },
  });
  if (!r.ok) return r;
  return { ok: true, message: "Commercial terms saved — accepted bookings keep their agreed terms", ...(next ? { redirect: next } : {}) };
}

/** Step 4 — access, F&B, suppliers, accessibility, licences and notes. */
export async function saveOperations(venueId: string, next: string | null, fd: FormData): Promise<ActionResult> {
  const prev = await details(venueId);
  if (!prev) return { ok: false, error: "Venue not found." };
  const DOCS = ["Premises licence", "Public liability insurance", "Fire safety certificate", "Food hygiene rating"];
  const old = (prev.compliance ?? []) as { name: string; file?: string }[];
  const compliance = DOCS.map((name, i) => ({ name, reference: t(fd, `doc_ref_${i}`, 60), expires: t(fd, `doc_exp_${i}`, 10), file: old.find(o => o.name === name)?.file ?? null })).filter(d => d.reference || d.expires || d.file);
  // "Other certificates" (Manage documents): free-named entries; a cleared name removes the row.
  for (let k = 0; k < 20 && fd.has(`other_name_${k}`); k++) {
    const name = t(fd, `other_name_${k}`, 60);
    if (name && !DOCS.includes(name)) compliance.push({ name, reference: t(fd, `other_ref_${k}`, 60), expires: t(fd, `other_exp_${k}`, 10), file: old.find(o => o.name === name)?.file ?? null });
  }
  const r = await save(venueId, { details: {
    operations: { access_type: t(fd, "access_type", 60), load_in: t(fd, "load_in", 30), load_out: t(fd, "load_out", 30), access_notes: t(fd, "access_notes", 500),
      parking: on(fd, "f_parking"), loading_bay: on(fd, "f_loading"), lift: on(fd, "f_lift"), stairs: on(fd, "f_stairs"), always_open: on(fd, "f_247"), notes: t(fd, "ops_notes", 500) },
    fnb: { catering: t(fd, "catering", 40), bar: t(fd, "bar", 40), external_catering: t(fd, "external_catering", 40), corkage: t(fd, "corkage", 40), cash_bar: on(fd, "cash_bar"), drink_packages: on(fd, "drink_packages"), notes: t(fd, "fnb_notes", 500) },
    suppliers: { preferred: t(fd, "preferred", 40), external: t(fd, "external", 40), equipment: t(fd, "equipment", 40), noise: t(fd, "noise", 60), notes: t(fd, "supplier_notes", 500) },
    access: { step_free: on(fd, "a_stepfree"), toilets: on(fd, "a_toilets"), lift: on(fd, "a_lift"), hearing_loop: on(fd, "a_loop"), parking: on(fd, "a_parking"), assistance: on(fd, "a_assist"), notes: t(fd, "a_notes", 500) },
    compliance,
  } });
  if (!r.ok) return r;
  if (fd.get("_draft")) return { ok: true, message: "Draft saved" };
  return { ok: true, message: "Operations saved", ...(next ? { redirect: next } : {}) };
}

/** Step 5 — photo order/cover/removal. URLs must be ones this workspace uploaded (or already on the listing). */
export async function savePhotos(venueId: string, photos: string[]): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { data: l } = await db.from("listings").select("image,gallery").eq("id", venueId).eq("workspace_id", workspace.id).maybeSingle();
  if (!l) return { ok: false, error: "Venue not found." };
  const known = new Set([l.image, ...(l.gallery ?? [])]);
  const mine = (u: string) => known.has(u) || u.includes(`/listing-media/${workspace.id}/`);
  const clean = [...new Set(photos)].filter(mine).slice(0, 40);
  // listing_readiness checks details.photos, so keep it in step with image + gallery.
  const r = await save(venueId, { image: clean[0] ?? "", gallery: clean.slice(1), details: { photos: clean } });
  if (!r.ok) return r;
  return { ok: true, message: "Photos saved" };
}
