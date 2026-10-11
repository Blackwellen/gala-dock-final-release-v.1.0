"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

const t = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const n = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); const x = Number(v); return v !== "" && Number.isFinite(x) ? x : null; };
const on = (fd: FormData, k: string) => fd.get(k) === "on";
const all = (fd: FormData, k: string) => fd.getAll(k).map(String).map(s => s.trim()).filter(Boolean).slice(0, 40);
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

async function current(id: string) {
  const { db, workspace } = await getProvider();
  const { data } = await db.from("listings").select("id,details,price_from,booking_mode").eq("id", id).eq("workspace_id", workspace.id).eq("kind", "service").maybeSingle();
  return data as { id: string; details: Record<string, unknown>; price_from: number | null; booking_mode: string } | null;
}
async function save(id: string | null, p: Record<string, unknown>) {
  const { db, workspace } = await getProvider();
  const { data, error } = await db.rpc("provider_save_listing", { p_ws: workspace.id, p_listing: id, p });
  if (error) return { ok: false as const, error: friendly(error) };
  revalidatePath("/provider/listings"); if (id) revalidatePath(`/provider/services/${id}`);
  return { ok: true as const, id: String(data) };
}
const svc = (d: Record<string, unknown> | undefined) => ((d?.service ?? {}) as Record<string, unknown>);

/** Step 1 — service, delivery, coverage, event types and credentials. Creates the draft service on first save. */
export async function saveServiceBasics(id: string | null, next: string | null, fd: FormData): Promise<ActionResult> {
  if (id && !isUuid(id)) return { ok: false, error: "Service not found." };
  const name = t(fd, "name", 100), desc = t(fd, "description", 500), category = t(fd, "category", 60);
  if (name.length < 2) return { ok: false, error: "Enter the service name." };
  if (!category) return { ok: false, error: "Choose a category." };
  if (desc.length < 40) return { ok: false, error: "Write a short description of at least 40 characters." };
  const radius = n(fd, "radius") ?? 50;
  if (radius < 1 || radius > 500) return { ok: false, error: "Set a coverage radius between 1 and 500 miles." };
  const prev = id ? await current(id) : null; if (id && !prev) return { ok: false, error: "Service not found." };
  const old = svc(prev?.details);
  const creds = ["Public liability insurance", "PAT testing (equipment)", "DBS check (if required)", "Other certifications"].map((name, i) => ({ name, reference: t(fd, `cred_ref_${i}`, 60), expires: t(fd, `cred_exp_${i}`, 10),
    required: on(fd, `cred_req_${i}`) })).filter(c => c.reference || c.expires || c.required);
  const r = await save(id, {
    ...(id ? {} : { kind: "service" }), name, description: desc, category, city: t(fd, "base", 60) || "London", location: t(fd, "base", 60) || "London",
    details: { service: { ...old, delivery: t(fd, "delivery", 10) || "onsite", coverage: { mode: t(fd, "coverage", 20) || "local", radius_miles: radius, base: t(fd, "base", 60) || "London", areas: t(fd, "areas", 300) },
      event_types: all(fd, "event_types"), credentials: creds } },
  });
  if (!r.ok) return r;
  return { ok: true, message: "Service saved", redirect: fd.get("_draft") ? `/provider/services/new?service=${r.id}&step=1` : (next ?? "").replace("{service}", r.id) || `/provider/services/new?service=${r.id}&step=2` };
}

/** Step 2 — pricing model, add-ons, setup requirements, questions, lead time and cancellation. */
export async function saveServicePricing(id: string, next: string | null, fd: FormData): Promise<ActionResult> {
  const prev = await current(id); if (!prev) return { ok: false, error: "Service not found." };
  const model = t(fd, "model", 10) || "package", from = n(fd, "price_from");
  if (model !== "quote" && (from === null || from <= 0)) return { ok: false, error: "Set a starting price, or choose Quote only." };
  const minLead = n(fd, "lead_min") ?? 0, maxLead = n(fd, "lead_max");
  if (maxLead !== null && maxLead < minLead) return { ok: false, error: "Maximum lead time must be after the minimum." };
  const addons = [0, 1, 2, 3, 4].map(i => ({ name: t(fd, `addon_name_${i}`, 60), desc: t(fd, `addon_desc_${i}`, 120), price: n(fd, `addon_price_${i}`) ?? 0, unit: t(fd, `addon_unit_${i}`, 20) || "per event" })).filter(a => a.name);
  if (addons.some(a => a.price < 0)) return { ok: false, error: "Add-on prices can’t be negative." };
  const questions = [0, 1, 2, 3, 4, 5].map(i => ({ label: t(fd, `q_label_${i}`, 80), type: t(fd, `q_type_${i}`, 20) || "text", required: on(fd, `q_req_${i}`) })).filter(q => q.label);
  const cancellation = [0, 1, 2].map(i => ({ window: t(fd, `c_window_${i}`, 30), refund: Math.min(100, Math.max(0, n(fd, `c_refund_${i}`) ?? 0)) })).filter(c => c.window);
  if (!cancellation.length) return { ok: false, error: "Add at least one cancellation window." };
  const old = svc(prev.details);
  const r = await save(id, { price_from: model === "quote" ? null : from, price_unit: model === "hourly" ? "per hour" : model === "daily" ? "per day" : "per event",
    details: { service: { ...old, pricing: { model, show_price: on(fd, "show_price"), currency: "GBP" }, addons, questions,
      setup: { setup_minutes: (n(fd, "setup_h") ?? 1) * 60, packdown_minutes: (n(fd, "packdown_h") ?? 1) * 60, space: t(fd, "space", 500), power: on(fd, "r_power"), covered: on(fd, "r_covered"), parking: on(fd, "r_parking"), dressing: on(fd, "r_dressing") },
      lead: { min_days: minLead, max_days: maxLead }, cancellation } } });
  if (!r.ok) return r;
  return { ok: true, message: "Pricing saved — accepted bookings keep their agreed terms", ...(next ? { redirect: next } : {}) };
}

/** Step 3 — weekly availability, capacity, holds/standby/emergency, booking mode and response commitment. */
export async function saveServiceAvailability(id: string, next: string | null, fd: FormData): Promise<ActionResult> {
  const prev = await current(id); if (!prev) return { ok: false, error: "Service not found." };
  const week: Record<string, [string, string] | null> = {};
  for (const d of DAYS) { if (!on(fd, `on_${d}`)) { week[d] = null; continue; } const a = t(fd, `from_${d}`, 5), b = t(fd, `to_${d}`, 5); if (!TIME.test(a) || !TIME.test(b)) return { ok: false, error: `Set opening hours for ${d.toUpperCase()}.` }; week[d] = [a, b]; }
  const perDay = n(fd, "per_day") ?? 1, perWeek = n(fd, "per_week");
  if (perDay < 1 || (perWeek !== null && perWeek < perDay)) return { ok: false, error: "Weekly capacity must be at least the daily limit." };
  const mode = t(fd, "booking_mode", 10) || "request", response = n(fd, "response_hours") ?? 4;
  if (mode === "instant" && !prev.price_from) return { ok: false, error: "Instant booking needs a published price — set one in Pricing." };
  const old = svc(prev.details);
  const r = await save(id, { booking_mode: mode, response_hours: response, emergency_supply: on(fd, "emergency"),
    details: { service: { ...old, availability: { week }, capacity: { per_day: perDay, per_week: perWeek, multi_same_day: on(fd, "multi"), travel_buffer_minutes: on(fd, "buffer") ? (n(fd, "buffer_h") ?? 1) * 60 : 0 },
      holds: { enabled: on(fd, "holds"), hours: n(fd, "hold_hours") ?? 24 }, standby: { enabled: on(fd, "standby") }, emergency: { enabled: on(fd, "emergency") } } } });
  if (!r.ok) return r;
  return { ok: true, message: "Availability saved", ...(next ? { redirect: next } : {}) };
}

/** Rate card (a real package linked to this service). */
export async function saveServicePackage(serviceId: string, pkgId: string | null, fd: FormData): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const name = t(fd, "name", 100), price = n(fd, "price");
  if (name.length < 2) return { ok: false, error: "Name the package." };
  if (price === null || price <= 0) return { ok: false, error: "Set a package price." };
  const { error } = await db.rpc("provider_save_package", { p_ws: workspace.id, p_package: pkgId, p: { listing_id: serviceId, name, base_price: price, price_basis: "fixed", status: "published",
    description: t(fd, "desc", 300), duration_hours: n(fd, "hours"), inclusions: t(fd, "desc", 300).split(/[•,]/).map(s => s.trim()).filter(Boolean).slice(0, 12) } });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath(`/provider/services/${serviceId}`);
  return { ok: true, message: pkgId ? "Package updated" : "Package added" };
}

/** Profile tab edits: included / not included / key info. */
export async function saveServiceInfo(id: string, fd: FormData): Promise<ActionResult> {
  const prev = await current(id); if (!prev) return { ok: false, error: "Service not found." };
  const lines = (k: string) => t(fd, k, 2000).split("\n").map(s => s.trim()).filter(Boolean).slice(0, 20);
  const old = svc(prev.details);
  const r = await save(id, { details: { service: { ...old, included: lines("included"), excluded: lines("excluded"), service_type: t(fd, "service_type", 120), durations: t(fd, "durations", 60),
    team: t(fd, "team", 80), equipment: t(fd, "equipment", 200), travel: t(fd, "travel", 120), docs: t(fd, "docs", 200) } } });
  return r.ok ? { ok: true, message: "Service information saved" } : r;
}
