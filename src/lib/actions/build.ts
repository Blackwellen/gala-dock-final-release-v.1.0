"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "./shell";
import { isTerm } from "@/lib/master-data";

const Id = z.string().uuid();
async function ownEvent(eventId: string) {
  const id = Id.safeParse(eventId); if (!id.success) return null;
  const ctx = await getCustomer();
  const { data: e } = await ctx.supabase.from("events").select("id,name,status,starts_at,guest_count,settings").eq("id", id.data).eq("owner_id", ctx.user.id).maybeSingle();
  return e ? { ctx, e } : null;
}
/** Finished lines: never count as "already in the build" (mirrors build_items_event_listing_open_uidx, migration 202611116011). */
const CLOSED = "(cancelled,cancelled_by_customer,cancelled_by_provider,refunded,partially_refunded,declined,unavailable,expired,expired_no_response,fulfilled,completion_pending,completed,disputed)";
/** Lines a customer may hide from the canvas (record kept; set_build_item_hidden refuses anything else). */
const FINISHED = ["cancelled", "cancelled_by_customer", "cancelled_by_provider", "refunded", "declined", "unavailable", "expired", "expired_no_response"];
const bump = (id: string) => { for (const p of ["", "/build", "/money", "/plan"]) revalidatePath(`/account/events/${id}${p}`); revalidatePath("/account/events"); };

/** Add a marketplace listing to the build as a suggestion (no commitment, no request sent yet). */
export async function addToBuild(eventId: string, listingId: string, category: string, role: "primary" | "backup" = "primary"): Promise<ActionResult> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!isTerm("build_category", category)) return { ok: false, error: "Unknown category." };
  const lid = Id.safeParse(listingId); if (!lid.success) return { ok: false, error: "Invalid listing." };
  if (role !== "primary" && role !== "backup") return { ok: false, error: "Invalid option role." };
  if (["completed", "cancelled", "archived"].includes(o.e.status)) return { ok: false, error: "This event can no longer be changed." };
  const { data: l } = await o.ctx.supabase.from("listings").select("id,name,image,price_from,price_unit,category,kind,capacity_max,tags,paused_at").eq("id", lid.data).eq("published", true).maybeSingle();
  if (!l) return { ok: false, error: "That listing isn't available." };
  if (l.paused_at) return { ok: false, error: `${l.name} isn't taking new bookings right now. Choose another provider or save it for later.` };
  if (l.kind === "venue" && l.capacity_max && o.e.guest_count > l.capacity_max) return { ok: false, error: `${l.name} holds up to ${l.capacity_max} guests — your event has ${o.e.guest_count}.` };
  const { data: dup } = await o.ctx.supabase.from("build_items").select("id").eq("event_id", o.e.id).eq("listing_id", l.id).not("status", "in", CLOSED).limit(1).maybeSingle();
  if (dup) return { ok: false, error: `${l.name} is already in your build.` };
  const perGuest = /guest|person/.test(l.price_unit);
  const amount = l.price_from == null ? null : perGuest ? Number(l.price_from) * Math.max(1, o.e.guest_count) : Number(l.price_from);
  const { count } = await o.ctx.supabase.from("build_items").select("id", { count: "exact", head: true }).eq("event_id", o.e.id);
  const { error } = await o.ctx.supabase.from("build_items").insert({ event_id: o.e.id, listing_id: l.id, category, title: l.name, package: l.category, scope: (l.tags ?? []).slice(0, 4).join(" • "), image: l.image, amount, price_basis: perGuest ? "per_person" : "estimate", quote: perGuest ? { per_guest: Number(l.price_from) } : {}, status: "suggested", role, sort: (count ?? 0) + 1 });
  // 23505: build_items_event_listing_open_uidx — a second tab added the same provider a moment ago.
  if (error) return { ok: false, error: error.code === "23505" ? `${l.name} is already in your build.` : "Could not add to your build." };
  bump(o.e.id); return { ok: true, message: `${l.name} added. Request a quote when you're ready — nothing is booked yet.` };
}

async function item(eventId: string, itemId: string) {
  const o = await ownEvent(eventId); if (!o) return null;
  const iid = Id.safeParse(itemId); if (!iid.success) return null;
  const { data: it } = await o.ctx.supabase.from("build_items").select("*").eq("id", iid.data).eq("event_id", o.e.id).maybeSingle();
  return it ? { ...o, it } : null;
}
/** Lines the canvas may remove: unsent options are deleted; open enquiries, quotes and lapsed requests are withdrawn (cancelled).
 *  Holds, standby, bookings and anything in a cancellation, replacement or dispute flow go through Manage booking so the policy,
 *  refunds and the provider's side apply. Keep in step with REMOVABLE in components/customer/build-client.tsx. */
const DELETABLE = ["suggested", "draft"];
const WITHDRAWABLE = ["sent", "awaiting", "awaiting_provider", "enquiry_created", "requested", "available", "quoted", "quote_received", "quote_revised",
  "customer_reviewing", "clarification", "clarification_requested", "expired", "expired_no_response", "declined", "unavailable"];
export async function removeFromBuild(eventId: string, itemId: string): Promise<ActionResult> {
  const o = await item(eventId, itemId); if (!o) return { ok: false, error: "Item not found." };
  if (![...DELETABLE, ...WITHDRAWABLE].includes(o.it.status)) return { ok: false, error: `${o.it.title} has a hold, booking or open case. Use Manage booking to cancel it so the cancellation policy applies.` };
  const { error } = DELETABLE.includes(o.it.status) ? await o.ctx.supabase.from("build_items").delete().eq("id", o.it.id) : await o.ctx.supabase.rpc("transition_build_item", { p_item: o.it.id, p_to: "cancelled" });
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
  if (threadId) await o.ctx.supabase.from("messages").insert({ thread_id: threadId, sender_id: o.ctx.user.id, sender_name: o.ctx.name, body: `Hi! I'd love a quote for ${o.e.name} on ${new Date(o.e.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })} for ${o.e.guest_count} guests.${note ? `\n\n${note.slice(0, 1500)}` : ""}` });
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
  if (!["primary", "backup", "standby"].includes(role)) return { ok: false, error: "Invalid option role." };
  if (role === "standby") { const { error } = await o.ctx.supabase.rpc("transition_build_item", { p_item: o.it.id, p_to: "standby" }); if (error) return { ok: false, error: "This option can't be made standby from its current state." }; }
  else {
    const now = new Date().toISOString();
    const { error } = await o.ctx.supabase.from("build_items").update({ role, updated_at: now }).eq("id", o.it.id); if (error) return { ok: false, error: "Could not update this option." };
    // One main choice per kind of provider: the previous main for the same category and listing type (package, e.g. "photographer")
    // becomes a backup. Different kinds in one category (Photographer and Photo Booth are both "media") keep their own mains.
    if (role === "primary") {
      let q = o.ctx.supabase.from("build_items").update({ role: "backup", updated_at: now }).eq("event_id", o.e.id).eq("category", o.it.category).eq("role", "primary").neq("id", o.it.id).not("status", "in", CLOSED);
      q = o.it.package ? q.eq("package", o.it.package) : q.is("package", null);
      const { error: demoteError } = await q; if (demoteError) return { ok: false, error: "Main choice set, but the previous main choice couldn't be changed to a backup. Refresh and try again." };
    }
  }
  bump(o.e.id); return { ok: true, message: role === "primary" ? `${o.it.title} is now your main choice.` : `${o.it.title} kept as a ${role}.` };
}
/** Hide or show a finished line (cancelled, refunded, declined, lapsed) on the build canvas. The record and its history are kept. */
export async function setItemHidden(eventId: string, itemId: string, hidden: boolean): Promise<ActionResult> {
  const o = await item(eventId, itemId); if (!o) return { ok: false, error: "Item not found." };
  if (hidden && !FINISHED.includes(o.it.status)) return { ok: false, error: "Only finished lines can be hidden." };
  const { error } = await o.ctx.supabase.rpc("set_build_item_hidden", { p_item: o.it.id, p_hidden: !!hidden });
  if (error) return { ok: false, error: "Could not update this line." };
  bump(o.e.id); return { ok: true, message: hidden ? `${o.it.title} hidden. Use Show hidden to see it again.` : `${o.it.title} is visible again.` };
}
export type DateImpact = { items: { title: string; status: string; note: string }[]; blockers: string[] };
/** Date change impact (read-only): confirmed/held providers must re-confirm; deposits may be at risk. */
export async function dateChangeImpact(eventId: string, newDate: string): Promise<ActionResult<DateImpact>> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || Number.isNaN(Date.parse(newDate)) || new Date(newDate).toISOString().slice(0,10)!==newDate || Date.parse(newDate)<=Date.now()) return { ok: false, error: "Choose a valid future date." };
  const { data: items, error: itemError } = await o.ctx.supabase.from("build_items").select("title,status,listing_id").eq("event_id", o.e.id).not("status", "in", "(suggested,draft,declined,unavailable,expired,cancelled,cancelled_by_customer,cancelled_by_provider,refunded,expired_no_response)");
  if (itemError) return { ok:false,error:"Could not check provider commitments. Try again." };
  const day = newDate.slice(0, 10);
  const [{ count: tickets, error: ticketError }, { data: tiers, error: tierError }] = await Promise.all([
    o.ctx.supabase.from("tickets").select("id", { count:"exact",head:true }).eq("event_id",o.e.id).in("status",["valid","resale_listed","used"]),
    o.ctx.supabase.from("ticket_tiers").select("held").eq("event_id",o.e.id).gt("held",0),
  ]);
  if (ticketError || tierError) return { ok:false,error:"Could not check ticket commitments. Try again." };
  const blockers = [tickets || tiers?.length ? "Tickets or active ticket reservations are tied to this date. Contact support to arrange postponement and ticket-holder notice." : "", items?.length ? "Reconfirm provider requests, quotes and bookings before changing the event date. Open each provider from your Build to agree the change." : "", ["live","completed","closed","cancelled","archived"].includes(o.e.status) ? "This event's lifecycle locks its date." : ""].filter(Boolean);
  return { ok:true,data:{ blockers,items:(items ?? []).map(i => ({ title:i.title,status:i.status,note:`${day}: ${i.status === "confirmed" ? "Booking must be agreed with the provider; cancellation terms may apply." : i.status === "held" ? "Existing hold is date-specific; reconfirm it with the provider." : "Provider response must be refreshed for the new date."}` })) } };
}
export async function changeEventDate(eventId: string, newDate: string): Promise<ActionResult> {
  const o = await ownEvent(eventId); if (!o) return { ok: false, error: "Event not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || Number.isNaN(Date.parse(newDate)) || new Date(newDate).toISOString().slice(0,10)!==newDate) return { ok:false,error:"Choose a valid future date." };
  const { error } = await untyped(o.ctx.supabase).rpc("change_my_event_date",{ p_event:o.e.id,p_date:newDate });
  if (error) return { ok:false,error:error.message.includes("ticket_date_commitments") ? "Tickets or reservations are tied to this date. Arrange a postponement through support." : error.message.includes("provider_date_commitments") ? "Reconfirm existing provider requests, quotes, holds and bookings before changing the date." : error.message.includes("future_date_required") ? "Choose a future date." : error.message.includes("event_date_locked") ? "This event's lifecycle locks its date." : "Could not change the event date. Try again." };
  bump(o.e.id); return { ok:true,message:"Event date updated. The event's local start time and duration were preserved." };
}

