"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { addToBuild } from "./build";
import type { ActionResult } from "./shell";

const Id = z.string().uuid();
async function ownEvent(eventId: string) {
  const id = Id.safeParse(eventId); if (!id.success) return null;
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  return e ? { ctx, e } : null;
}

/** Persist the presentation order of build rows (never changes bookings). */
export async function reorderBuild(eventId: string, ids: string[]): Promise<ActionResult> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  const p = z.array(Id).max(200).safeParse(ids); if (!p.success || new Set(p.data).size !== p.data.length) return { ok: false, error: "Invalid order." };
  // A filtered canvas (?cat= / ?q=) reorders only the rows it shows: permute those rows' own sort slots so lines in other
  // categories keep their place. Slots that collide (older data) fall back to 1..n, as before.
  const { data: cur, error: readError } = await o.ctx.supabase.from("build_items").select("id,sort").eq("event_id", o.e.id).in("id", p.data);
  if (readError || (cur ?? []).length !== p.data.length) return { ok: false, error: "Could not save the new order." };
  const slots = (cur ?? []).map(r => Number(r.sort)).sort((a, b) => a - b);
  const distinct = new Set(slots).size === slots.length; const sortAt = (i: number) => distinct ? slots[i]! : i + 1;
  const results = await Promise.all(p.data.map((id, i) => o.ctx.supabase.from("build_items").update({ sort: sortAt(i) }).eq("id", id).eq("event_id", o.e.id)));
  if (results.some(r => r.error)) return { ok: false, error: "Could not save the new order." };
  revalidatePath(`/account/events/${o.e.id}/build`); return { ok: true };
}

/** Add a listing as the new main choice and keep the current option as a backup (committed bookings are left untouched). */
export async function replaceWith(eventId: string, oldItemId: string, listingId: string, category: string): Promise<ActionResult> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  const old = Id.safeParse(oldItemId); if (!old.success) return { ok: false, error: "Item not found." };
  const { data: it } = await o.ctx.supabase.from("build_items").select("id,title,status").eq("id", old.data).eq("event_id", o.e.id).maybeSingle();
  if (!it) return { ok: false, error: "Item not found." };
  const added = await addToBuild(eventId, listingId, category, "primary"); if (!added.ok) return added;
  if (!["confirmed", "held", "fulfilled"].includes(it.status)) await o.ctx.supabase.from("build_items").update({ role: "backup", updated_at: new Date().toISOString() }).eq("id", it.id);
  revalidatePath(`/account/events/${o.e.id}/build`);
  return { ok: true, message: ["confirmed", "held", "fulfilled"].includes(it.status) ? `Added. ${it.title} is still ${it.status} — cancel it from Money if you no longer need it.` : `Added as your main choice. ${it.title} is kept as a backup.`, redirect: `/account/events/${o.e.id}/build` };
}

/** From Saved/Discover: add a listing to one of my events and go straight to its booking request. */
export async function addAndRequest(eventId: string, listingId: string, category: string, mode: "add" | "quote" | "hold", date?: string): Promise<ActionResult> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  const lid = Id.safeParse(listingId); if (!lid.success) return { ok: false, error: "Listing not found." };
  const { data: existing } = await o.ctx.supabase.from("build_items").select("id").eq("event_id", o.e.id).eq("listing_id", lid.data).not("status", "in", "(cancelled,cancelled_by_customer,cancelled_by_provider,refunded,partially_refunded,declined,unavailable,expired,expired_no_response,fulfilled,completion_pending,completed,disputed)").limit(1).maybeSingle();
  if (!existing) { const r = await addToBuild(eventId, lid.data, category); if (!r.ok) return r; }
  const { data: it } = await o.ctx.supabase.from("build_items").select("id").eq("event_id", o.e.id).eq("listing_id", lid.data).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!it) return { ok: false, error: "Could not add to your event." };
  return mode !== "add" ? { ok: true, redirect: `/account/events/${o.e.id}/book?step=1&item=${it.id}${mode === "hold" ? "&option=hold" : ""}${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `&date=${date}` : ""}` } : { ok: true, message: existing ? "Already in that event's build." : "Added to your event build.", redirect: `/account/events/${o.e.id}/build` };
}
