"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "./shell";

/** Plan › Partners: set or clear a sponsor / exhibitor logo (party_set_logo, 202610294063). The URL comes from the Q04 public-media
 *  upload (validated, metadata-stripped, scanned); the command re-checks it sits in this event workspace's event-media folder. */
export async function setPartyLogo(partyId: string, url: string | null): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(partyId).success || (url !== null && !z.string().url().max(500).safeParse(url).success)) return { ok: false, error: "Choose an image to upload." };
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("party_set_logo", { p_party: partyId, p_url: url });
  if (error) return { ok: false, error: /not_authorized|42501/.test(error.message) ? "You don't have permission to do that." : /invalid_logo_url/.test(error.message) ? "Upload the logo as a PNG, JPG or WebP image." : /sponsors_exhibitors_only/.test(error.message) ? "Logos are for sponsors and exhibitors." : "Could not save the logo." };
  const { data: p } = await sb.from("event_parties").select("event_id").eq("id", partyId).maybeSingle();
  if (p?.event_id) { revalidatePath(`/organizer/events/${p.event_id}`); const { data: e } = await sb.from("events").select("slug").eq("id", p.event_id).maybeSingle(); if (e?.slug) revalidatePath(`/events/${e.slug}`); }
  return { ok: true, message: url ? "Logo saved." : "Logo removed." };
}
