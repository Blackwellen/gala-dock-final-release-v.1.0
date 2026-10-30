"use server";

import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { planSeats } from "@/components/venue-plan/inventory";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";

const MSG: Record<string, string> = {
  not_authorized: "You don’t have permission to edit this event’s layout.", seats_in_use: "Some sold or held seats would be removed or re-tiered — keep them in the plan.",
  invalid_tier: "A ticket tier on the plan doesn’t belong to this event.", too_many_seats: "That’s more seats than a single event plan supports.", invalid_elements: "The plan couldn’t be read — reload and try again.",
  venue_lock: "That element is fixed by the venue (exits, routes, rooms, walls) — ask the venue to change it.",
  map_validation_failed: "The layout can’t be published until its safety and capacity issues are fixed", too_many_elements: "That’s more elements than a single plan supports.",
  not_found: "That layout version wasn’t found.",
};
const UUID = /^[0-9a-f-]{36}$/i;
export type Finding = { code: string; severity: "error" | "warning"; element_id?: string | null; text: string };
export type Validation = { ok: boolean; errors: Finding[]; warnings: Finding[]; stats?: Record<string, number | null>; version?: number; status?: string; map?: boolean; rule_pack?: { key: string; version: number } };
export type MapSaveResult = { ok: boolean; message?: string; error?: string; version?: number; status?: string; validation?: Validation; conflict?: number };
type Rpc = { rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message: string; details?: string; code?: string } | null }> };

const explain = (e: { message: string; details?: string }) => {
  const k = Object.keys(MSG).find(x => e.message.includes(x));
  return k ? MSG[k] + (e.details ? ` (${e.details})` : "") : "Couldn’t save the layout. Please try again.";
};

/**
 * ORG-013 · Version-checked save (Q19 `event_map_save`): `baseVersion` = the latest version this editor opened (0 = none).
 * Another session's save comes back as `conflict: N` (stale_version) for the reload-merge prompt; venue locks and publish
 * validation are enforced server-side, and the saved version's validation comes back for the findings panel.
 */
export async function saveEventMap(eventId: string, overlay: MapEl[], publish: boolean, baseVersion: number): Promise<MapSaveResult> {
  if (!UUID.test(eventId)) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  let seats;
  try { seats = planSeats(overlay); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const clean = overlay.slice(0, 5000).map(e => ({ ...e, label: String(e.label ?? "").slice(0, 60) }));
  const { data, error } = await (untyped(ctx.supabase) as unknown as Rpc).rpc("event_map_save", { p_event: eventId, p_overlay: clean, p_seats: seats, p_publish: publish, p_base_version: Math.max(0, Math.round(baseVersion)) });
  if (error) {
    const stale = /stale_version:(\d+)/.exec(error.message);
    if (stale) return { ok: false, conflict: Number(stale[1]), error: `Someone saved version ${stale[1]} of this layout while you were editing.` };
    return { ok: false, error: explain(error) };
  }
  const r = data as { version: number; status: string; validation: Validation | null };
  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/organizer/events/${eventId}/map`);
  const n = r.validation ? r.validation.errors.length + r.validation.warnings.length : 0;
  return { ok: true, version: r.version, status: r.status, validation: r.validation ?? undefined,
    message: publish ? `Layout v${r.version} published · ${seats.length.toLocaleString("en-GB")} reserved seats synced` : `Layout saved as draft v${r.version}${n ? ` · ${n} finding${n === 1 ? "" : "s"} to review` : ""}` };
}

/** Findings for a saved version (default latest): errors block publishing; warnings are advisory. */
export async function validateEventMap(eventId: string, version?: number): Promise<{ ok: true; validation: Validation } | { ok: false; error: string }> {
  if (!UUID.test(eventId)) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  const { data, error } = await (untyped(ctx.supabase) as unknown as Rpc).rpc("event_map_validate", { p_event: eventId, p_version: version ?? null });
  return error ? { ok: false, error: explain(error) } : { ok: true, validation: data as Validation };
}

export async function compareEventMap(eventId: string, a: number, b: number): Promise<{ ok: true; added: string[]; removed: string[]; changed: string[] } | { ok: false; error: string }> {
  if (!UUID.test(eventId) || !Number.isInteger(a) || !Number.isInteger(b)) return { ok: false, error: "Choose two versions." };
  const ctx = await getOrganizer();
  const { data, error } = await (untyped(ctx.supabase) as unknown as Rpc).rpc("event_map_compare", { p_event: eventId, p_a: a, p_b: b });
  if (error) return { ok: false, error: explain(error) };
  const d = data as { added: string[]; removed: string[]; changed: string[] };
  return { ok: true, added: d.added ?? [], removed: d.removed ?? [], changed: d.changed ?? [] };
}

/** Restore = a new draft copied from an earlier version (history is never rewritten). Version-checked like a save. */
export async function restoreEventMap(eventId: string, version: number, baseVersion: number): Promise<MapSaveResult> {
  if (!UUID.test(eventId)) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  const { data, error } = await (untyped(ctx.supabase) as unknown as Rpc).rpc("event_map_restore", { p_event: eventId, p_version: version, p_base_version: baseVersion });
  if (error) {
    const stale = /stale_version:(\d+)/.exec(error.message);
    if (stale) return { ok: false, conflict: Number(stale[1]), error: `Version ${stale[1]} was saved meanwhile — reload, then restore again.` };
    return { ok: false, error: explain(error) };
  }
  const r = data as { version: number; validation: Validation | null };
  revalidatePath(`/organizer/events/${eventId}/map`);
  return { ok: true, version: r.version, status: "draft", validation: r.validation ?? undefined, message: `Version ${version} restored as draft v${r.version}` };
}

/** One saved version's overlay (merge prompt, compare highlight, preview). */
export async function loadEventMapVersion(eventId: string, version?: number): Promise<{ ok: true; version: number; status: string; overlay: MapEl[] } | { ok: false; error: string }> {
  if (!UUID.test(eventId)) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  let q = untyped(ctx.supabase).from("venue_maps").select("version,status,overlay").eq("event_id", eventId);
  q = version ? q.eq("version", version) : q.order("version", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  if (!data) return { ok: false, error: MSG.not_found };
  return { ok: true, version: data.version as number, status: data.status as string, overlay: Array.isArray(data.overlay) ? data.overlay as MapEl[] : [] };
}

/** Legacy entry point kept for older callers (unchecked save through organizer_save_event_plan). */
export async function saveEventPlan(eventId: string, overlay: MapEl[], publish: boolean): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!UUID.test(eventId)) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  let seats;
  try { seats = planSeats(overlay); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const clean = overlay.slice(0, 2000).map(e => ({ ...e, label: String(e.label ?? "").slice(0, 60) }));
  const { data, error } = await (untyped(ctx.supabase) as unknown as Rpc).rpc("organizer_save_event_plan", { p_event: eventId, p_structure: { format: "plan-v2" }, p_overlay: clean, p_seats: seats, p_publish: publish });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath(`/organizer/events/${eventId}`);
  return { ok: true, message: publish ? `Layout v${data} published · ${seats.length.toLocaleString("en-GB")} reserved seats synced` : `Layout saved as draft v${data}` };
}
