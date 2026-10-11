"use server";

import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { CHECKOUT_COOKIE, summarise, type Summary } from "@/lib/checkout";

const MSG: Record<string, string> = {
  seat_unavailable: "Someone just took one of those seats — please pick again.", sold_out: "There aren’t enough tickets left in that tier.", order_limit: "That’s more than the per-order limit for this tier.",
  not_on_sale: "Tickets for this event aren’t on sale right now.", queue: "Please wait for your turn in the waiting room before reserving tickets.", seated_tier: "Pick seats on the map for that tier.", invalid_quantity: "Choose between 1 and 20 seats.", seat_not_ticketed: "One of those seats isn’t on sale.",
};
const msg = (m: string) => MSG[Object.keys(MSG).find(k => m.includes(k)) ?? ""] ?? "We couldn’t reserve those tickets. Please try again.";

/** Waiting room (§52): the queue cookie set by /api/events/{id}/queue; only its hash is sent to the database. */
const queueCookie = (eventId: string) => `gd_q_${eventId.replace(/-/g, "").slice(0, 12)}`;
async function admitted(eventId: string, sb: Awaited<ReturnType<typeof createClient>>) {
  const q = (await cookies()).get(queueCookie(eventId))?.value ?? "";
  const { data } = await sb.rpc("queue_status" as never, { p_event: eventId, p_token_hash: q ? createHash("sha256").update(q).digest("hex") : "" } as never);
  const s = (data ?? { required: false }) as { required?: boolean; admitted?: boolean };
  return !s.required || !!s.admitted;
}

/** Reserves seats and/or GA tickets for 10 minutes under this browser's checkout token (httpOnly cookie). Replaces any previous selection. */
export async function reserve(eventId: string, items: { tier: string; qty: number }[], seats: string[]): Promise<{ ok: true; summary: Summary } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, error: "Event not found." };
  const jar = await cookies(), name = CHECKOUT_COOKIE(eventId);
  let token = jar.get(name)?.value;
  if (!token || !/^[A-Za-z0-9_-]{24,64}$/.test(token)) token = randomBytes(24).toString("base64url");
  jar.set(name, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 30 });
  const sb = await createClient();
  if (!(await admitted(eventId, sb))) return { ok: false, error: MSG.queue };
  const cleanItems = items.filter(i => /^[0-9a-f-]{36}$/i.test(i.tier) && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 20).slice(0, 10);
  const cleanSeats = [...new Set(seats.filter(s => typeof s === "string" && s.length <= 60))].slice(0, 20);
  if (!cleanItems.length && !cleanSeats.length) { await sb.rpc("release_checkout" as never, { p_token: token } as never); return { ok: false, error: "Choose at least one ticket." }; }
  await sb.rpc("release_resale_holds" as never, { p_token: token } as never); // a primary selection replaces any resale hold
  if (cleanSeats.length) { const { error } = await sb.rpc("hold_seats" as never, { p_event: eventId, p_keys: cleanSeats, p_token: token } as never); if (error) return { ok: false, error: msg(error.message) }; }
  else await sb.rpc("release_seat_holds" as never, { p_token: token } as never);
  const { error } = await sb.rpc("hold_tickets" as never, { p_event: eventId, p_items: cleanItems.map(i => ({ tier: i.tier, qty: i.qty })), p_token: token } as never);
  if (error) { await sb.rpc("release_checkout" as never, { p_token: token } as never); return { ok: false, error: msg(error.message) }; }
  return { ok: true, summary: await summarise(eventId, token, sb as never) };
}

export async function releaseHold(eventId: string): Promise<void> {
  const jar = await cookies(), token = jar.get(CHECKOUT_COOKIE(eventId))?.value;
  if (!token) return;
  const sb = await createClient();
  await sb.rpc("release_checkout" as never, { p_token: token } as never);
  jar.delete(CHECKOUT_COOKIE(eventId));
}

/** Holds resale listings (replacing any primary selection). Buyers must be signed in. */
export async function reserveResale(eventId: string, ticketIds: string[]): Promise<{ ok: true; summary: Summary } | { ok: false; error: string; login?: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, error: "Event not found." };
  const ids = [...new Set(ticketIds.filter(t => /^[0-9a-f-]{36}$/i.test(t)))].slice(0, 10);
  if (!ids.length) return { ok: false, error: "Choose at least one resale ticket." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to buy resale tickets.", login: true };
  const jar = await cookies(), name = CHECKOUT_COOKIE(eventId);
  let token = jar.get(name)?.value;
  if (!token || !/^[A-Za-z0-9_-]{24,64}$/.test(token)) token = randomBytes(24).toString("base64url");
  jar.set(name, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 30 });
  await sb.rpc("release_checkout" as never, { p_token: token } as never);
  const { error } = await sb.rpc("hold_resale" as never, { p_event: eventId, p_tickets: ids, p_token: token } as never);
  if (error) return { ok: false, error: msg(error.message) };
  return { ok: true, summary: await summarise(eventId, token, sb as never) };
}

/** Claims a sold-out waitlist offer (§52): the reserved tickets become this browser's checkout hold until the offer expires. Buyer must be signed in. */
export async function claimOffer(eventId: string, offerId: string): Promise<{ ok: true; summary: Summary } | { ok: false; error: string; login?: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || !/^[0-9a-f-]{36}$/i.test(offerId)) return { ok: false, error: "Offer not found." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to use your reserved tickets.", login: true };
  const jar = await cookies(), name = CHECKOUT_COOKIE(eventId);
  let token = jar.get(name)?.value;
  if (!token || !/^[A-Za-z0-9_-]{24,64}$/.test(token)) token = randomBytes(24).toString("base64url");
  jar.set(name, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 30 });
  const { error } = await sb.rpc("claim_waitlist_offer" as never, { p_offer: offerId, p_token: token } as never);
  if (error) return { ok: false, error: error.message.includes("offer_expired") ? "This offer has expired — the tickets have gone to the next person in line." : "We couldn’t find that offer." };
  return { ok: true, summary: await summarise(eventId, token, sb as never) };
}
