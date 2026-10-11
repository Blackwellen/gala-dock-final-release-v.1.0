"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

// Only these keys may be written into spaces.details from the space editors.
const DETAIL_KEYS = ["dimensions", "gallery", "use_cases", "layout_features", "default_layout", "layout_notes", "min_capacity", "space_type", "access", "toilets", "bar", "catering",
  "accessibility", "av", "parking", "curfew", "setup_minutes", "cleardown_minutes", "hours", "pricing_mode", "short_notice", "booking_type", "response_hours", "cancellation", "quote_custom", "description"] as const;
const COLUMNS = ["name", "indoor", "area_sqm", "capacity_standing", "capacity_seated", "rate_hourly", "min_hours", "layouts", "amenities", "image", "status"] as const;
export type SpacePatch = Partial<Record<typeof COLUMNS[number], unknown>> & { details?: Partial<Record<typeof DETAIL_KEYS[number], unknown>> };

/** Creates or updates a space through provider_save_space (role-checked, audited). Setup + clear-down become the enforced turnaround buffer. */
export async function saveSpaceFields(venueId: string, spaceId: string | null, patch: SpacePatch): Promise<ActionResult & { id?: string }> {
  if (!isUuid(venueId) || (spaceId && !isUuid(spaceId))) return { ok: false, error: "Space not found." };
  const { db, workspace } = await getProvider();
  const p: Record<string, unknown> = {};
  for (const k of COLUMNS) if (patch[k] !== undefined) p[k] = patch[k];
  if (patch.details) {
    const d = Object.fromEntries(Object.entries(patch.details).filter(([k]) => (DETAIL_KEYS as readonly string[]).includes(k)));
    if (JSON.stringify(d).length > 20000) return { ok: false, error: "That’s too much detail to save at once." };
    if (d.booking_type === "operational" && p.status === "published") return { ok: false, error: "Operational-only spaces can’t be published to the marketplace." };
    if (d.setup_minutes !== undefined || d.cleardown_minutes !== undefined) p.turnaround_minutes = Math.max(0, Number(d.setup_minutes ?? 0)) + Math.max(0, Number(d.cleardown_minutes ?? 0));
    p.details = d;
  }
  if (spaceId && p.status === undefined) {
    const { data } = await db.from("spaces").select("status").eq("id", spaceId).maybeSingle();
    p.status = data?.status ?? "draft";
  }
  if (!spaceId && !String(p.name ?? "").trim()) return { ok: false, error: "Give the space a name." };
  const { data, error } = await db.rpc("provider_save_space", { p_ws: workspace.id, p_venue: venueId, p_space: spaceId, p });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath(`/provider/venues/${venueId}`);
  return { ok: true, message: spaceId ? "Space saved" : "Space created as a draft", id: String(data) };
}

export async function setSpaceLinks(venueId: string, spaceId: string, linked: string[], exclusive: string[]): Promise<ActionResult> {
  if (![...linked, ...exclusive].every(isUuid)) return { ok: false, error: "Choose spaces from this venue." };
  if (linked.some(x => exclusive.includes(x))) return { ok: false, error: "A space can’t be both linked and exclusive." };
  const { db, workspace } = await getProvider();
  const { error } = await db.rpc("provider_set_space_links", { p_ws: workspace.id, p_space: spaceId, p_linked: linked, p_exclusive: exclusive });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath(`/provider/venues/${venueId}/spaces/${spaceId}`);
  return { ok: true, message: "Linked spaces saved" };
}

export async function duplicateSpace(venueId: string, spaceId: string): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { data: s } = await db.from("spaces").select("*").eq("id", spaceId).eq("venue_id", venueId).eq("workspace_id", workspace.id).maybeSingle();
  if (!s) return { ok: false, error: "Space not found." };
  const { data, error } = await db.rpc("provider_save_space", { p_ws: workspace.id, p_venue: venueId, p_space: null, p: {
    name: `${s.name} (copy)`.slice(0, 80), status: "draft", indoor: s.indoor, area_sqm: s.area_sqm, capacity_standing: s.capacity_standing, capacity_seated: s.capacity_seated, layouts: s.layouts,
    amenities: s.amenities, turnaround_minutes: s.turnaround_minutes, min_hours: s.min_hours, rate_hourly: s.rate_hourly, image: s.image, details: s.details } });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, message: "Copied as a new draft space", redirect: `/provider/venues/${venueId}/spaces/${data}` };
}
