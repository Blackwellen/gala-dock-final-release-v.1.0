"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import type { ActionResult } from "./shell";

const Id = z.string().uuid();
const bump = (id?: string) => { revalidatePath("/account/tickets"); if (id) revalidatePath(`/account/tickets/${id}`); };

/** Transfer to a friend: the old QR is voided and a new ticket is issued to the recipient (server RPC). */
export async function transferTicket(ticketId: string, name: string, email: string): Promise<ActionResult> {
  const id = Id.safeParse(ticketId); if (!id.success) return { ok: false, error: "Ticket not found." };
  const p = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200) }).safeParse({ name, email });
  if (!p.success) return { ok: false, error: "Enter the recipient's name and a valid email." };
  const ctx = await getCustomer();
  if (p.data.email.toLowerCase() === (ctx.user.email ?? "").toLowerCase()) return { ok: false, error: "You already hold this ticket." };
  const { error } = await ctx.supabase.rpc("transfer_ticket", { p_ticket: id.data, p_email: p.data.email, p_name: p.data.name });
  if (error) return { ok: false, error: error.message.includes("transfers_disabled") ? "The organiser has turned off transfers for this event." : error.message.includes("not_transferable") ? "This ticket can't be transferred in its current state." : "Could not transfer the ticket." };
  bump(id.data); return { ok: true, message: `Ticket sent to ${p.data.name}. Your QR code is no longer valid.`, redirect: "/account/tickets?tab=resale" };
}

/** List on (or withdraw from) official resale — face value only; listing voids the current QR. */
export async function resaleTicket(ticketId: string, cancel: boolean): Promise<ActionResult> {
  const id = Id.safeParse(ticketId); if (!id.success) return { ok: false, error: "Ticket not found." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("list_ticket_for_resale", { p_ticket: id.data, p_cancel: cancel });
  if(error?.message.includes("original_payment_required"))return {ok:false,error:"Only the original paying buyer can resell this ticket, with proceeds refunded to their original payment method. Refunded purchases cannot be listed."};
  if (error) return { ok: false, error: error.message.includes("price_cap_exceeded") ? "The original price exceeds the current resale cap. Contact ticket support." : error.message.includes("resale_disabled") ? "Official resale is turned off for this event." : error.message.includes("resale_window_closed") ? "The resale window is closed." : error.message.includes("resale_reserved") ? "A buyer has reserved this ticket. Try again after their reservation expires." : error.message.includes("not_resellable") ? "Only valid, unused paid tickets can be resold." : error.message.includes("not_listed") ? "This ticket isn't listed for resale." : "Could not update resale." };
  bump(id.data); return { ok: true, message: cancel ? "Resale cancelled — a fresh QR code has been issued." : "Listed at face value. After sale, the ticket price is refunded to your original payment method." };
}

export async function updateAttendee(ticketId: string, name: string, email: string): Promise<ActionResult> {
  const id = Id.safeParse(ticketId); if (!id.success) return { ok: false, error: "Ticket not found." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("update_ticket_attendee", { p_ticket: id.data, p_name: name, p_email: email });
  if (error) return { ok: false, error: error.message.includes("invalid_email") ? "Enter a valid email." : error.message.includes("invalid_name") ? "Enter the attendee's full name." : error.message.includes("not_editable") ? "Attendee details can't be changed after entry or transfer." : "Could not update attendee details." };
  bump(id.data); return { ok: true, message: "Attendee details updated. A new QR code has been issued." };
}

/**
 * Credential reissue (Q21, domain 98.4): scope "print" kills only printed / barcode copies (lost printout); "all" also rotates the
 * wallet QR (lost or shared phone). Holder or the event's ticket managers; audited; the holder is notified when someone else reissues.
 */
export async function reissueTicketCredentials(ticketId: string, scope: "all" | "print" = "all", reason = ""): Promise<ActionResult> {
  const id = Id.safeParse(ticketId); if (!id.success) return { ok: false, error: "Ticket not found." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("reissue_ticket_credentials" as never, { p_ticket: id.data, p_scope: scope, p_reason: reason.slice(0, 300) } as never);
  if (error) return { ok: false, error: error.message.includes("not_reissuable") ? "Only valid tickets can get a new code." : "Could not issue a new code." };
  bump(id.data);
  return { ok: true, message: scope === "print" ? "Old printouts no longer work — print your ticket again." : "New entry code issued. Old QR codes and printouts no longer work." };
}
