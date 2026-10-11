"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

const t = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const n = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); const x = Number(v); return v !== "" && Number.isFinite(x) ? x : null; };
const on = (fd: FormData, k: string) => fd.get(k) === "on";
export type PkgItem = { kind: "space" | "service" | "equipment" | "staff"; ref?: string | null; name: string; sub: string };

async function load(id: string) {
  const { db, workspace } = await getProvider();
  const { data } = await db.from("packages").select("id,listing_id,status,details,base_price,image").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  return data as { id: string; listing_id: string; status: string; details: Record<string, unknown>; base_price: number; image: string } | null;
}
async function save(id: string | null, p: Record<string, unknown>) {
  const { db, workspace } = await getProvider();
  // provider_save_package resets status to 'draft' when omitted — carry the current status forward so edits never unpublish.
  if (id && p.status === undefined) { const cur = await load(id); if (cur) p = { ...p, status: cur.status }; }
  const { data, error } = await db.rpc("provider_save_package", { p_ws: workspace.id, p_package: id, p });
  if (error) return { ok: false as const, error: friendly(error) };
  revalidatePath("/provider/listings"); if (id) revalidatePath(`/provider/packages/${id}`);
  return { ok: true as const, id: String(data) };
}

/** Step 1 — parent, name, inclusions (spaces/services/equipment/staff), event details, features and add-ons. */
export async function savePackageOffer(id: string | null, next: string | null, fd: FormData): Promise<ActionResult> {
  if (id && !isUuid(id)) return { ok: false, error: "Package not found." };
  const listing = t(fd, "listing_id", 40), name = t(fd, "name", 100), desc = t(fd, "description", 500);
  if (!isUuid(listing)) return { ok: false, error: "Choose the venue or service this package is based on." };
  if (name.length < 2) return { ok: false, error: "Name the package." };
  if (desc.length < 20) return { ok: false, error: "Add a short description (20+ characters)." };
  const min = n(fd, "min_guests"), max = n(fd, "max_guests");
  if (min !== null && max !== null && max < min) return { ok: false, error: "Maximum guests must be at least the minimum." };
  let items: PkgItem[] = [];
  try { items = (JSON.parse(String(fd.get("items") ?? "[]")) as PkgItem[]).filter(x => x && typeof x.name === "string").slice(0, 30).map(x => ({ kind: x.kind, ref: x.ref && isUuid(x.ref) ? x.ref : null, name: x.name.slice(0, 80), sub: String(x.sub ?? "").slice(0, 120) })); }
  catch { return { ok: false, error: "The inclusions list couldn’t be read." }; }
  const addOns = [0, 1, 2, 3, 4].map(i => ({ name: t(fd, `addon_name_${i}`, 60), desc: t(fd, `addon_desc_${i}`, 80), price: n(fd, `addon_price_${i}`) ?? 0, enabled: on(fd, `addon_on_${i}`) })).filter(a => a.name);
  const prev = id ? await load(id) : null; if (id && !prev) return { ok: false, error: "Package not found." };
  const r = await save(id, {
    listing_id: listing, name, description: desc, ...(id ? {} : { status: "draft", base_price: 0 }), min_guests: min, max_guests: max, duration_hours: n(fd, "duration"),
    space_ids: items.filter(x => x.kind === "space" && x.ref).map(x => x.ref), inclusions: items.map(x => x.name), add_ons: addOns,
    details: { ...(prev?.details ?? {}), items, event_type: t(fd, "event_type", 60), suitable_for: t(fd, "suitable_for", 40),
      features: fd.getAll("features").map(String).filter(Boolean).slice(0, 12).concat(t(fd, "feature_custom", 60) ? [t(fd, "feature_custom", 60)] : []) },
  });
  if (!r.ok) return r;
  return { ok: true, message: "Package saved", redirect: fd.get("_draft") ? `/provider/packages/new?package=${r.id}&step=1` : (next ?? "").replace("{package}", r.id) || `/provider/packages/new?package=${r.id}&step=2` };
}

/** Step 2 — pricing, deposit, booking mode, restrictions, cancellation and holds. */
export async function savePackagePricing(id: string, next: string | null, fd: FormData): Promise<ActionResult> {
  const prev = await load(id); if (!prev) return { ok: false, error: "Package not found." };
  const model = t(fd, "model", 10) || "fixed", price = n(fd, "price") ?? 0, deposit = n(fd, "deposit") ?? 30;
  if (model !== "quote" && price <= 0) return { ok: false, error: "Set the package price, or choose Quote only." };
  if (deposit < 0 || deposit > 100) return { ok: false, error: "Deposit must be between 0 and 100%." };
  const mode = t(fd, "booking_mode", 10) || "request";
  if (mode === "instant" && model === "quote") return { ok: false, error: "Instant booking needs a price — choose Fixed or From price." };
  const cancellation = [0, 1, 2, 3].map(i => ({ window: t(fd, `c_window_${i}`, 30), refund: Math.min(100, Math.max(0, n(fd, `c_refund_${i}`) ?? 0)) })).filter(c => c.window);
  const r = await save(id, { base_price: model === "quote" ? 0 : price, price_basis: t(fd, "basis", 12) || "fixed", deposit_pct: deposit, booking_mode: mode,
    min_guests: on(fd, "x_min_guests") ? n(fd, "min_guests") : null, max_guests: on(fd, "x_max_guests") ? n(fd, "max_guests") : null,
    details: { ...prev.details, pricing: { model }, restrictions: { min_notice_days: on(fd, "x_min_notice") ? n(fd, "min_notice") : null, max_notice_days: on(fd, "x_max_notice") ? n(fd, "max_notice") : null,
      age: on(fd, "x_age") ? t(fd, "age", 20) : null, event_types: on(fd, "x_types") ? t(fd, "types", 200) : null },
      cancellation: cancellation.length ? cancellation : null, holds: { enabled: on(fd, "holds"), hours: n(fd, "hold_hours") ?? 24 }, standby: { enabled: on(fd, "standby") }, emergency: { enabled: on(fd, "emergency") } } });
  if (!r.ok) return r;
  return { ok: true, message: "Pricing & rules saved", ...(next ? { redirect: next } : {}) };
}

/** Step 3 — availability source and blocked dates (date-specific). */
export async function savePackageAvailability(id: string, next: string | null, fd: FormData): Promise<ActionResult> {
  const prev = await load(id); if (!prev) return { ok: false, error: "Package not found." };
  const blocked = String(fd.get("blocked") ?? "").split(",").map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).slice(0, 366);
  const r = await save(id, { details: { ...prev.details, availability: { mode: t(fd, "mode", 10) || "inherit", blocked } } });
  if (!r.ok) return r;
  return { ok: true, message: "Availability saved", ...(next ? { redirect: next } : {}) };
}

export async function savePackagePhotos(id: string, photos: string[]): Promise<ActionResult> {
  const { workspace } = await getProvider();
  const prev = await load(id); if (!prev) return { ok: false, error: "Package not found." };
  const known = new Set([prev.image, ...(((prev.details.gallery ?? []) as string[]))]);
  const clean = [...new Set(photos)].filter(u => known.has(u) || u.includes(`/listing-media/${workspace.id}/`) || u.startsWith("/assets/")).slice(0, 30);
  const r = await save(id, { image: clean[0] ?? "", details: { ...prev.details, gallery: clean.slice(1) } });
  return r.ok ? { ok: true, message: "Photos saved" } : r;
}

export async function setPackageLive(id: string, live: boolean): Promise<ActionResult> {
  const r = await save(id, { status: live ? "published" : "paused" });
  return r.ok ? { ok: true, message: live ? "Package published" : "Package paused — existing bookings are unaffected" } : r;
}

export async function duplicatePackage(id: string): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { data: p } = await db.from("packages").select("*").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (!p) return { ok: false, error: "Package not found." };
  const r = await save(null, { listing_id: p.listing_id, name: `${p.name} (copy)`.slice(0, 100), status: "draft", description: p.description, base_price: p.base_price, price_basis: p.price_basis,
    min_guests: p.min_guests, max_guests: p.max_guests, duration_hours: p.duration_hours, deposit_pct: p.deposit_pct, booking_mode: p.booking_mode, inclusions: p.inclusions, add_ons: p.add_ons,
    space_ids: p.space_ids, image: p.image, details: p.details });
  return r.ok ? { ok: true, message: "Copied as a new draft", redirect: `/provider/packages/${r.id}` } : r;
}
