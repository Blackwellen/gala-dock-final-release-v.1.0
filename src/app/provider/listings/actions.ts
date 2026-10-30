"use server";

import { getProvider } from "@/lib/provider/context";
import { call, friendly, type ActionResult } from "@/lib/workspace/rpc";

const MISSING: Record<string, string> = {
  listing_name: "a name", listing_description: "a description of at least 40 characters", listing_location: "a location", listing_photo: "a photo",
  workspace_setup: "workspace setup", verification: "identity verification", payouts: "payout setup",
  credentials: "the required compliance documents, verified and in date (Settings → Trust & credentials)", trust_hold: "a Trust & Safety review to be resolved",
};

/** Publishes through publish_listing(); ineligible listings stay drafts and the missing items are reported. */
export async function publishListing(id: string): Promise<ActionResult> {
  const { db } = await getProvider();
  const { data, error } = await db.rpc("publish_listing", { p_listing: id });
  if (error) return { ok: false, error: friendly(error) };
  const r = data as { eligible?: boolean; missing?: string[]; published?: boolean };
  if (!r?.published) return { ok: false, error: `Not ready to publish — add ${(r?.missing ?? []).map(m => MISSING[m] ?? m).join(", ")}.` };
  return { ok: true, message: "Listing published" };
}

export async function pauseListing(id: string, pause: boolean): Promise<ActionResult> {
  const { db } = await getProvider();
  return call(db, "provider_pause_listing", { p_listing: id, p_pause: pause }, pause ? "Listing paused — existing bookings are unaffected" : "Listing unpaused (republish to go live)");
}

export async function duplicateListing(id: string): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { data: l } = await db.from("listings").select("*").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (!l) return { ok: false, error: "Listing not found." };
  const { data, error } = await db.rpc("provider_save_listing", { p_ws: workspace.id, p_listing: null, p: {
    kind: l.kind, name: `${l.name} (copy)`.slice(0, 100), description: l.description, location: l.location, category: l.category, city: l.city, image: l.image, gallery: l.gallery,
    price_from: l.price_from, price_unit: l.price_unit, capacity_min: l.capacity_min, capacity_max: l.capacity_max, response_hours: [2, 4, 8, 12, 24].includes(l.response_hours) ? l.response_hours : 8,
    booking_mode: l.booking_mode === "instant" && !l.price_from ? "request" : l.booking_mode, emergency_supply: l.emergency_supply, tags: l.tags, details: l.details } });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, message: "Copied as a new draft", redirect: l.kind === "venue" ? `/provider/venues/${data}` : `/provider/services/${data}` };
}

export async function setSpaceStatus(venueId: string, spaceId: string, status: "published" | "paused" | "draft"): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  return call(db, "provider_save_space", { p_ws: workspace.id, p_venue: venueId, p_space: spaceId, p: { status } }, status === "published" ? "Space published" : status === "paused" ? "Space paused — existing bookings are unaffected" : "Space moved to draft");
}

export async function setPackageStatus(packageId: string, status: "published" | "paused" | "draft"): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  return call(db, "provider_save_package", { p_ws: workspace.id, p_package: packageId, p: { status } }, status === "published" ? "Package published" : status === "paused" ? "Package paused" : "Package moved to draft");
}
