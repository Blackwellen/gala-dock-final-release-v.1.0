"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

// Ticket transfer (§49) and waiting lists (§46). The DB enforces ownership, validity and single-validity of entitlements.
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG: [RegExp, string][] = [[/not_authorized|42501/, "That ticket isn’t yours to transfer."], [/not_transferable|no_longer_transferable/, "This ticket can no longer be transferred."],
  [/transfers_disabled/, "The organiser has turned off transfers for this event."], [/self_transfer/, "You already hold this ticket."], [/wrong_recipient/, "This transfer was sent to a different email address. Sign in with that account to accept."],
  [/expired/, "This transfer link has expired. Ask the sender to send it again."], [/not_found|P0002/, "This transfer is no longer available."], [/waitlist_disabled/, "This event doesn’t have a waiting list."]];
const fail = (m: string): R<never> => ({ ok: false, error: MSG.find(([re]) => re.test(m))?.[1] ?? "Something went wrong. Please try again." });

/** Starts a transfer and returns a one-time acceptance link for the recipient (token stored only as a hash). */
export async function offerTransfer(ticketId: string, email: string, name: string): Promise<R<string>> {
  if (!UUID.test(ticketId) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return { ok: false, error: "Enter the recipient’s email address." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !(await rateLimit(`transfer:${user.id}`, 20, 3600))) return { ok: false, error: "Too many transfers — try again later." };
  const token = randomBytes(24).toString("base64url");
  const { error } = await sb.rpc("offer_ticket_transfer" as never, { p_ticket: ticketId, p_email: email.trim().toLowerCase(), p_name: name.trim().slice(0, 120), p_token_hash: createHash("sha256").update(token).digest("hex") } as never);
  if (error) return fail(error.message);
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.galadock.com";
  revalidatePath("/account/tickets", "layout");
  return { ok: true, data: `${host.startsWith("localhost") ? "http" : "https"}://${host}/tickets/accept/${token}` };
}

export async function acceptTransfer(token: string): Promise<R<string>> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return { ok: false, error: "This transfer link isn’t valid." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("accept_ticket_transfer" as never, { p_token_hash: createHash("sha256").update(token).digest("hex") } as never);
  if (error) return fail(error.message);
  revalidatePath("/account/tickets", "layout");
  return { ok: true, data: data as unknown as string };
}

export async function cancelTransfer(transferId: string): Promise<R> {
  if (!UUID.test(transferId)) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_ticket_transfer" as never, { p_transfer: transferId } as never);
  if (error) return fail(error.message);
  revalidatePath("/account/tickets", "layout");
  return { ok: true };
}

export async function joinWaitlist(eventId: string, tierId: string | null, quantity: number): Promise<R> {
  if (!UUID.test(eventId) || (tierId && !UUID.test(tierId))) return { ok: false, error: "Not found." };
  const sb = await createClient();
  const { error } = await sb.rpc("join_waitlist" as never, { p_event: eventId, p_tier: tierId, p_qty: Math.max(1, Math.min(10, Math.round(quantity))) } as never);
  if (error) return /not_authorized|42501/.test(error.message) ? { ok: false, error: "Sign in to join the waiting list." } : fail(error.message);
  return { ok: true };
}
