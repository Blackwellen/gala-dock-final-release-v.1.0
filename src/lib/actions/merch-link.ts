"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { can } from "@/lib/domain/permissions";
import { assertPublicUrl } from "@/lib/developer/ssrf";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";

/**
 * Owner decision 2026-10-29: merchandise is sold on the organiser's own store, not a Gala Dock checkout. The organiser saves an
 * external store link (events.settings.merch_url); the public event page shows "Shop merch" opening it in a new tab
 * (rel noopener noreferrer nofollow). https only, no credentials, must resolve to a public internet address (the SSRF validator).
 */
const Url = z.string().trim().max(500).regex(/^https:\/\/[^\s"'<>\\]+$/i);

export async function saveMerchUrl(eventId: string, raw: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: "Event not found." };
  const ctx = await getOrganizer();
  if (!can("organizer", ctx.role, "tickets.manage")) return { ok: false, error: "You don't have permission to do that." };
  const { data: e } = await ctx.supabase.from("events").select("id,slug,settings").eq("id", eventId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  let url: string | null = null;
  if (raw.trim()) {
    const p = Url.safeParse(raw); if (!p.success) return { ok: false, error: "Use a full https:// link to your merch store." };
    try { url = await assertPublicUrl(p.data); } catch { return { ok: false, error: "That link must be a public https:// web address." }; }
    if (!/^https:\/\//i.test(url)) return { ok: false, error: "Use a full https:// link to your merch store." };
  }
  const s = { ...((e.settings ?? {}) as Record<string, unknown>) };
  if (url) s.merch_url = url; else delete s.merch_url;
  const { error } = await ctx.supabase.from("events").update({ settings: s as Json, updated_at: new Date().toISOString() }).eq("id", e.id);
  if (error) return { ok: false, error: "Could not save the link." };
  revalidatePath(`/organizer/events/${e.id}`); if (e.slug) revalidatePath(`/events/${e.slug}`);
  return { ok: true, message: url ? "Merch store link saved." : "Merch store link removed." };
}

