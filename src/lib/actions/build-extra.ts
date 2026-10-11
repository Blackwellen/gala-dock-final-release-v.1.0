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
  const p = z.array(Id).max(200).safeParse(ids); if (!p.success) return { ok: false, error: "Invalid order." };
  const results = await Promise.all(p.data.map((id, i) => o.ctx.supabase.from("build_items").update({ sort: i + 1 }).eq("id", id).eq("event_id", o.e.id)));
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
