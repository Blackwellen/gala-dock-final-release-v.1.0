"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import type { MapEl } from "../_components/venue-map";

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 30);
const text = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);
const intOrNull = (v: FormDataEntryValue | null) => { const n = Number(v); return String(v ?? "").trim() !== "" && Number.isFinite(n) ? Math.round(n) : null; };

async function saveListing(venueId: string, p: Record<string, unknown>, message: string): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { error } = await db.rpc("provider_save_listing", { p_ws: workspace.id, p_listing: venueId, p });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath(`/provider/venues/${venueId}`);
  return { ok: true, message };
}

/** Key information, contact details and feature tags (Operations tab). */
export async function saveVenueInfo(venueId: string, fd: FormData): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { data: l } = await db.from("listings").select("details").eq("id", venueId).eq("workspace_id", workspace.id).maybeSingle();
  if (!l) return { ok: false, error: "Venue not found." };
  const description = text(fd.get("description"), 2000);
  if (description.length < 40) return { ok: false, error: "Add a description of at least 40 characters." };
  const email = text(fd.get("email"), 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid contact email." };
  const d = (l.details ?? {}) as Record<string, unknown>;
  return saveListing(venueId, {
    description, location: text(fd.get("location"), 160) || undefined,
    details: {
      type: text(fd.get("type"), 60) || d.type, features: list(fd.get("features")),
      contact: { phone: text(fd.get("phone"), 40), email, website: text(fd.get("website"), 120).replace(/^https?:\/\//, "") },
      info: { event_types: list(fd.get("event_types")), accessibility: text(fd.get("accessibility")), parking: text(fd.get("parking")), licences: list(fd.get("licences")),
        curfew: text(fd.get("curfew"), 5), staffing: text(fd.get("staffing")) },
    },
  }, "Venue information saved");
}

/** Commercial terms (Commercial tab). Contradictory settings (instant booking without a price) are refused by the RPC. */
export async function saveCommercial(venueId: string, fd: FormData): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { data: l } = await db.from("listings").select("details").eq("id", venueId).eq("workspace_id", workspace.id).maybeSingle();
  if (!l) return { ok: false, error: "Venue not found." };
  const rateFrom = intOrNull(fd.get("rate_from")), rateTo = intOrNull(fd.get("rate_to")), deposit = intOrNull(fd.get("deposit_pct")) ?? 30;
  if (rateFrom !== null && rateTo !== null && rateTo < rateFrom) return { ok: false, error: "The upper rate must be at least the starting rate." };
  if (deposit < 0 || deposit > 100) return { ok: false, error: "Deposit must be between 0 and 100%." };
  const refunds = [0, 1, 2].map(i => ({ window: text(fd.get(`c_window_${i}`), 30), refund: Math.min(100, Math.max(0, intOrNull(fd.get(`c_refund_${i}`)) ?? 0)) })).filter(r => r.window);
  if (!refunds.length) return { ok: false, error: "Add at least one cancellation window." };
  const prev = ((l.details ?? {}) as Record<string, unknown>).commercial as Record<string, unknown> | undefined;
  return saveListing(venueId, {
    booking_mode: text(fd.get("booking_mode"), 10), price_from: rateFrom, price_unit: "per hour",
    details: { commercial: { ...(prev ?? {}), pricing: "hourly", rate_from: rateFrom, rate_to: rateTo, minimum_spend: intOrNull(fd.get("minimum_spend")) ?? 0, deposit_pct: deposit,
      balance_days: intOrNull(fd.get("balance_days")) ?? 14, security_deposit: intOrNull(fd.get("security_deposit")) ?? 0, lead_days: intOrNull(fd.get("lead_days")) ?? 0,
      cancellation: refunds, holds: { enabled: fd.get("holds") === "on", hours: intOrNull(fd.get("hold_hours")) ?? 48 } } },
  }, "Commercial terms saved — accepted bookings keep the terms they were agreed on");
}

export type SpaceInput = { name: string; indoor: boolean; capacity_standing: number | null; capacity_seated: number | null; area_sqm: number | null; rate_hourly: number | null;
  min_hours: number; turnaround_minutes: number; layouts: Record<string, number>; amenities: string[]; description: string; status?: "draft" | "published" | "paused" };

export async function saveSpace(venueId: string, spaceId: string | null, s: SpaceInput): Promise<ActionResult & { id?: string }> {
  const { db, workspace } = await getProvider();
  if (!s.name.trim()) return { ok: false, error: "Give the space a name." };
  if (!Object.keys(s.layouts).length) return { ok: false, error: "Add at least one layout with a capacity." };
  // provider_save_space resets status to 'draft' when omitted — keep the current status unless explicitly changed.
  let status = s.status;
  if (!status && spaceId) { const { data } = await db.from("spaces").select("status").eq("id", spaceId).maybeSingle(); status = (data?.status as SpaceInput["status"]) ?? undefined; }
  const { data, error } = await db.rpc("provider_save_space", { p_ws: workspace.id, p_venue: venueId, p_space: spaceId, p: {
    name: s.name, indoor: s.indoor, capacity_standing: s.capacity_standing, capacity_seated: s.capacity_seated, area_sqm: s.area_sqm, rate_hourly: s.rate_hourly,
    min_hours: s.min_hours, turnaround_minutes: s.turnaround_minutes, layouts: s.layouts, amenities: s.amenities, details: { description: s.description.slice(0, 500) },
    ...(status ? { status } : {}) } });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath(`/provider/venues/${venueId}`);
  return { ok: true, message: spaceId ? "Space saved" : "Space added as a draft", id: String(data) };
}

export type StructureMeta = { capacity_max?: number | null; rule_pack?: string; calibration?: { units_per_m?: number; rotation_deg?: number; origin?: [number, number]; underlay?: { file_ref?: string; kind?: "image" | "pdf"; opacity?: number } } };
export type StructureSaveResult = ActionResult & { version?: number; conflict?: number };

/**
 * Saves a new structure version (Q19 `venue_structure_save`): version-checked against the version this editor opened
 * (`baseVersion`, 0 for a first save) → `stale_version:N` comes back as `conflict: N` for the reload-merge prompt.
 * Publishing replaces the live map; protected/locked exits, routes and rooms can't be dropped (enforced in the RPC).
 * Without `baseVersion` (older callers) it falls back to the legacy unchecked `provider_save_structure`.
 */
export async function saveStructure(venueId: string, elements: MapEl[], publish: boolean, baseVersion?: number, meta?: StructureMeta): Promise<StructureSaveResult> {
  const { db, workspace } = await getProvider();
  const clean = elements.slice(0, 2000).map(e => ({ ...e, label: String(e.label ?? "").slice(0, 60) }));
  if (baseVersion === undefined) {
    const { data, error } = await db.rpc("provider_save_structure", { p_ws: workspace.id, p_venue: venueId, p_elements: clean.slice(0, 200), p_publish: publish });
    if (error) return { ok: false, error: friendly(error) };
    revalidatePath(`/provider/venues/${venueId}`);
    return { ok: true, version: Number(data), message: publish ? `Map v${data} published` : `Map saved as draft v${data}` };
  }
  const m: StructureMeta = {};
  if (meta?.capacity_max !== undefined) m.capacity_max = meta.capacity_max === null ? null : Math.max(0, Math.round(Number(meta.capacity_max)));
  if (meta?.rule_pack) m.rule_pack = String(meta.rule_pack).slice(0, 40);
  if (meta?.calibration) m.calibration = meta.calibration;
  const { data, error } = await (db as unknown as { rpc: (f: string, a: object) => Promise<{ data: { version: number } | null; error: { message: string; code?: string } | null }> })
    .rpc("venue_structure_save", { p_venue: venueId, p_elements: clean, p_publish: publish, p_base_version: baseVersion, p_meta: m });
  if (error) {
    const stale = /stale_version:(\d+)/.exec(error.message);
    if (stale) return { ok: false, conflict: Number(stale[1]), error: `Someone saved version ${stale[1]} of this map while you were editing.` };
    if (/protected_element_removed/.test(error.message)) return { ok: false, error: "Protected exits, routes and rooms from the published map can’t be removed. Unlock them first or put them back." };
    if (/invalid_calibration/.test(error.message)) return { ok: false, error: "The calibration isn’t valid: units per metre 1–1000, rotation −360 to 360°, origin as two numbers." };
    if (/invalid_rule_pack/.test(error.message)) return { ok: false, error: "Choose an active safety rule pack." };
    return { ok: false, error: friendly(error) };
  }
  revalidatePath(`/provider/venues/${venueId}`);
  const v = Number(data?.version);
  return { ok: true, version: v, message: publish ? `Map v${v} published` : `Map saved as draft v${v}` };
}

/** Reads one structure version (default: the latest of any status) for the reload-merge prompt and compare. */
export async function loadStructure(venueId: string, version?: number): Promise<{ ok: true; version: number; status: string; elements: MapEl[]; meta: StructureMeta } | { ok: false; error: string }> {
  const { db, workspace } = await getProvider();
  let q = db.from("venue_structures").select("version,status,elements,calibration,capacity_max,rule_pack").eq("venue_id", venueId).eq("workspace_id", workspace.id);
  q = version ? q.eq("version", version) : q.order("version", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  if (!data) return { ok: false, error: "That map version wasn’t found." };
  const r = data as { version: number; status: string; elements: MapEl[]; calibration: StructureMeta["calibration"] | null; capacity_max: number | null; rule_pack: string | null };
  return { ok: true, version: r.version, status: r.status, elements: r.elements ?? [], meta: { calibration: r.calibration ?? {}, capacity_max: r.capacity_max, rule_pack: r.rule_pack ?? "uk_default" } };
}
