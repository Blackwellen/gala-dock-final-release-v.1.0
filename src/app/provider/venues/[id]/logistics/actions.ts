"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";

const UUID = /^[0-9a-f-]{36}$/i;
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Q25 · Venue loading bays (`loading_bay_save`): venue-owned bays per listing, owner/manager only (checked in the RPC).
 * Turnaround minutes are added after every booked window, and windows on one bay can never overlap across tenants
 * (exclusion constraint), so the venue's bay set is the single source for every organiser's delivery and load-in slots.
 */
export async function saveLoadingBay(venueId: string, bayId: string | null, fd: FormData): Promise<ActionResult> {
  if (!UUID.test(venueId) || (bayId && !UUID.test(bayId))) return { ok: false, error: "Venue not found." };
  const { db, workspace } = await getProvider();
  const { data: l } = await db.from("listings").select("id").eq("id", venueId).eq("workspace_id", workspace.id).eq("kind", "venue").maybeSingle();
  if (!l) return { ok: false, error: "Venue not found." };
  const name = text(fd.get("name"), 120);
  if (!name) return { ok: false, error: "Give the bay a name." };
  const len = text(fd.get("max_length_m"), 8), turn = Number(text(fd.get("turnaround_minutes"), 4) || 0);
  if (len && !(Number(len) > 0 && Number(len) < 1000)) return { ok: false, error: "Maximum vehicle length must be in metres (e.g. 12.5)." };
  if (!Number.isInteger(turn) || turn < 0 || turn > 240) return { ok: false, error: "Turnaround must be 0–240 minutes." };
  const p: Record<string, unknown> = { listing_id: venueId, name, max_vehicle: text(fd.get("max_vehicle"), 80), max_length_m: len || "", turnaround_minutes: String(turn),
    access_route: text(fd.get("access_route"), 500), notes: text(fd.get("notes"), 500) };
  const status = text(fd.get("status"), 10);
  if (bayId && (status === "active" || status === "closed")) p.status = status;
  const { error } = await db.rpc("loading_bay_save", { p, p_id: bayId });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath(`/provider/venues/${venueId}/logistics`);
  return { ok: true, message: bayId ? "Loading bay saved" : "Loading bay added" };
}

export async function setLoadingBayStatus(venueId: string, bayId: string, status: "active" | "closed"): Promise<ActionResult> {
  if (!UUID.test(venueId) || !UUID.test(bayId)) return { ok: false, error: "Bay not found." };
  const { db } = await getProvider();
  const { error } = await db.rpc("loading_bay_save", { p: { status }, p_id: bayId });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath(`/provider/venues/${venueId}/logistics`);
  return { ok: true, message: status === "closed" ? "Bay closed — no new windows can be booked on it" : "Bay reopened" };
}
