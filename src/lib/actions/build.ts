"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./shell";

const Id = z.string().uuid();
const BUILD_CATEGORIES = ["venue", "food", "drinks", "entertainment", "media", "styling", "staff", "production", "hire", "transport", "extras"] as const;
async function ownEvent(eventId: string) {
  const id = Id.safeParse(eventId); if (!id.success) return null;
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id,name,status,starts_at,guest_count,settings").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  return e ? { ctx, e } : null;
}
const bump = (id: string) => { for (const p of ["", "/build", "/money", "/plan"]) revalidatePath(`/account/events/${id}${p}`); revalidatePath("/account/events"); };

/** Add a marketplace listing to the build as a suggestion (no commitment, no request sent yet). */
export async function addToBuild(eventId: string, listingId: string, category: string, role: "primary" | "backup" = "primary"): Promise<ActionResult> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!(BUILD_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "Unknown category." };
  const lid = Id.safeParse(listingId); if (!lid.success) return { ok: false, error: "Invalid listing." };
  if (["completed", "cancelled", "archived"].includes(o.e.status)) return { ok: false, error: "This event can no longer be changed." };
  const { data: l } = await o.ctx.supabase.from("listings").select("id,name,image,price_from,price_unit,category,kind,capacity_max,tags").eq("id", lid.data).eq("published", true).maybeSingle();
  if (!l) return { ok: false, error: "That listing isn't available." };
  if (l.kind === "venue" && l.capacity_max && o.e.guest_count > l.capacity_max) return { ok: false, error: `${l.name} holds up to ${l.capacity_max} guests — your event has ${o.e.guest_count}.` };
  const { data: dup } = await o.ctx.supabase.from("build_items").select("id").eq("event_id", o.e.id).eq("listing_id", l.id).not("status", "in", "(cancelled,declined,expired)").maybeSingle();
  if (dup) return { ok: false, error: `${l.name} is already in your build.` };
  const perGuest = /guest|person/.test(l.price_unit);
  const amount = l.price_from == null ? null : perGuest ? Number(l.price_from) * Math.max(1, o.e.guest_count) : Number(l.price_from);
  const { count } = await o.ctx.supabase.from("build_items").select("id", { count: "exact", head: true }).eq("event_id", o.e.id);
  const { error } = await o.ctx.supabase.from("build_items").insert({ event_id: o.e.id, listing_id: l.id, category, title: l.name, package: l.category, scope: (l.tags ?? []).slice(0, 4).join(" • "), image: l.image, amount, price_basis: perGuest ? "per_person" : "estimate", quote: perGuest ? { per_guest: Number(l.price_from) } : {}, status: "suggested", role, sort: (count ?? 0) + 1 });
  if (error) return { ok: false, error: "Could not add to your build." };
  bump(o.e.id); return { ok: true, message: `${l.name} added. Request a quote when you're ready — nothing is booked yet.` };
}

async function item(eventId: string, itemId: string) {
  const o = await ownEvent(eventId); if (!o) return null;
  const iid = Id.safeParse(itemId); if (!iid.success) return null;
  const { data: it } = await o.ctx.supabase.from("build_items").select("*").eq("id", iid.data).eq("event_id", o.e.id).maybeSingle();
  return it ? { ...o, it } : null;
}
export async function removeFromBuild(eventId: string, itemId: string): Promise<ActionResult> {
  const o = await item(eventId, itemId); if (!o) return { ok: false, error: "Item not found." };
  if (["confirmed", "held", "fulfilled"].includes(o.it.status)) return { ok: false, error: `${o.it.title} is ${o.it.status}. Use Manage booking to cancel it so the cancellation policy applies.` };
  const { error } = ["suggested", "draft"].includes(o.it.status) ? await o.ctx.supabase.from("build_items").delete().eq("id", o.it.id) : await o.ctx.supabase.rpc("transition_build_item", { p_item: o.it.id, p_to: "cancelled" });
  if (error) return { ok: false, error: "Could not remove." };
  bump(o.e.id); return { ok: true, message: `${o.it.title} removed.` };
}
/** Enquiry / quote request: moves the item to "sent" with a server response deadline and opens a conversation thread. */
export async function requestQuote(eventId: string, itemId: string, note = ""): Promise<ActionResult> {
  const o = await item(eventId, itemId); if (!o) return { ok: false, error: "Item not found." };
  if (!o.e.starts_at) return { ok: false, error: "Add your event date first — providers need it to check availability." };
  const { error } = await o.ctx.supabase.rpc("transition_build_item", { p_item: o.it.id, p_to: "sent" });
  if (error) return { ok: false, error: error.message.includes("invalid_transition") ? "A request has already been sent." : "Could not send the request." };
  const { data: th } = await o.ctx.supabase.from("threads").select("id").eq("event_id", o.e.id).eq("listing_id", o.it.listing_id ?? "").maybeSingle();
  const threadId = th?.id ?? (await o.ctx.supabase.from("threads").insert({ event_id: o.e.id, listing_id: o.it.listing_id, build_item_id: o.it.id, kind: o.it.category === "venue" ? "venue" : "supplier", title: o.it.title, subtitle: `${o.it.category} • Quote requested`, image: o.it.image, response_due_at: new Date(Date.now() + 48 * 36e5).toISOString() }).select("id").single()).data?.id;
  if (threadId) await o.ctx.supabase.from("messages").insert({ thread_id: threadId, sender_id: o.ctx.user.id, sender_name: o.ctx.name, body: `Hi! I'd love a quote for ${o.e.name} on ${new Date(o.e.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} for ${o.e.guest_count} guests.${note ? `\n\n${note.slice(0, 1500)}` : ""}` });
  try { if (o.it.listing_id) { const admin = createAdminClient(); const { data: l } = await admin.from("listings").select("workspaces(owner_id)").eq("id", o.it.listing_id).single(); const owner = (l?.workspaces as unknown as { owner_id: string } | null)?.owner_id; if (owner) await admin.from("notifications").insert({ user_id: owner, kind: "request_received", title: `Quote request: ${o.e.name}`, body: `${o.e.guest_count} guests · respond within 48h`, link: "/provider" }); } } catch { /* best-effort */ }
  bump(o.e.id); return { ok: true, message: `Quote requested from ${o.it.title}. They have 48 hours to respond.` };
}
export async function holdItem(eventId: string, itemId: string, hours: number): Promise<ActionResult> {
  const o = await item(eventId, itemId); if (!o) return { ok: false, error: "Item not found." };
  if (![12, 24, 48, 72].includes(hours)) return { ok: false, error: "Choose a hold length." };
  const { error } = await o.ctx.supabase.rpc("transition_build_item", { p_item: o.it.id, p_to: "held", p_hold_hours: hours });
  if (error) return { ok: false, error: "Only providers who have confirmed availability or quoted can be held." };
  bump(o.e.id); return { ok: true, message: `${o.it.title} is held for ${hours} hours. Confirm before it expires.` };
}
export async function setItemRole(eventId: string, itemId: string, role: "primary" | "backup" | "standby"): Promise<ActionResult> {
  const o = await item(eventId, itemId); if (!o) return { ok: false, error: "Item not found." };
  if (role === "standby") { const { error } = await o.ctx.supabase.rpc("transition_build_item", { p_item: o.it.id, p_to: "standby" }); if (error) return { ok: false, error: "This option can't be made standby from its current state." }; }
  else await o.ctx.supabase.from("build_items").update({ role, updated_at: new Date().toISOString() }).eq("id", o.it.id);
  bump(o.e.id); return { ok: true, message: role === "primary" ? `${o.it.title} is now your main choice.` : `${o.it.title} kept as a ${role}.` };
}
export type DateImpact = { title: string; status: string; note: string }[];
/** Date change impact (read-only): confirmed/held providers must re-confirm; deposits may be at risk. */
export async function dateChangeImpact(eventId: string, newDate: string): Promise<ActionResult<DateImpact>> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (Number.isNaN(Date.parse(newDate))) return { ok: false, error: "Choose a valid date." };
  const { data: items } = await o.ctx.supabase.from("build_items").select("title,status,listing_id").eq("event_id", o.e.id).in("status", ["confirmed", "held", "quoted", "available", "sent", "awaiting"]);
  const day = newDate.slice(0, 10);
  const { data: clashes } = await o.ctx.supabase.from("build_items").select("listing_id,events!inner(starts_at)").in("listing_id", (items ?? []).map(i => i.listing_id!).filter(Boolean)).in("status", ["confirmed", "held"]).neq("event_id", o.e.id);
  const busy = new Set((clashes ?? []).filter(c => (c.events as unknown as { starts_at: string | null }).starts_at?.slice(0, 10) === day).map(c => c.listing_id));
  return { ok: true, data: (items ?? []).map(i => ({ title: i.title, status: i.status, note: busy.has(i.listing_id) ? "Already booked on that date — you'd need a replacement" : i.status === "confirmed" ? "Must re-confirm the new date; deposit terms may apply" : i.status === "held" ? "Hold is date-specific and would be released" : "Quote would need updating for the new date" })) };
}
export async function changeEventDate(eventId: string, newDate: string): Promise<ActionResult> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  const t = Date.parse(newDate); if (Number.isNaN(t) || t < Date.now()) return { ok: false, error: "Choose a future date." };
  const { count } = await o.ctx.supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", o.e.id).eq("status", "valid");
  if (count) return { ok: false, error: "Tickets have been sold for this date. Contact support to reschedule with ticket-holder notice." };
  const prev = o.e.starts_at ? new Date(o.e.starts_at) : null; const dur = 7 * 36e5;
  const start = new Date(t); if (prev) start.setUTCHours(prev.getUTCHours(), prev.getUTCMinutes());
  await o.ctx.supabase.from("events").update({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + dur).toISOString() }).eq("id", o.e.id);
  await o.ctx.supabase.from("build_items").update({ status: "available", hold_expires_at: null }).eq("event_id", o.e.id).eq("status", "held");
  await o.ctx.supabase.from("build_items").update({ status: "suggested" }).eq("event_id", o.e.id).in("status", ["quoted", "available", "sent", "awaiting"]);
  bump(o.e.id); return { ok: true, message: "Date updated. Providers have been asked to re-confirm; quotes will be refreshed." };
}
