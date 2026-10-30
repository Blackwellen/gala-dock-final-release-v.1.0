"use server";
import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

/**
 * Provider opt-in for the public free/busy calendar (migration 202610294080). Stored as listings.details.public_availability
 * through provider_save_listing (owner / manager only, shallow details merge). Default off: nothing is published until the provider turns it on.
 */
export async function setPublicAvailability(listingId: string, on: boolean): Promise<ActionResult> {
  if (!isUuid(listingId)) return { ok: false, error: "Listing not found." };
  const { db, workspace, can } = await getProvider();
  if (!can.manage) return { ok: false, error: "Only owners and managers can change what the public page shows." };
  const { data: l } = await db.from("listings").select("id,kind,slug").eq("id", listingId).eq("workspace_id", workspace.id).maybeSingle();
  if (!l) return { ok: false, error: "Listing not found." };
  const { error } = await db.rpc("provider_save_listing", { p_ws: workspace.id, p_listing: listingId, p: { details: { public_availability: on } } });
  if (error) return { ok: false, error: friendly(error) };
  const row = l as { id: string; kind: string; slug: string | null };
  revalidatePath(row.kind === "venue" ? `/provider/venues/${row.id}` : `/provider/services/${row.id}`);
  revalidatePath(`/${row.kind === "venue" ? "venues" : "services"}/${row.slug ?? row.id}`);
  return { ok: true, message: on ? "Availability calendar is now on your public page." : "Availability calendar hidden from your public page." };
}
