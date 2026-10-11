"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";

const Id = z.string().uuid();
const bump = (id?: string) => { revalidatePath("/organizer/money"); if (id) revalidatePath(`/organizer/money/invoices/${id}`); };
const msg = (m: string) => m.includes("not_authorized") ? "You need Finance, Manager or Owner access." : m.includes("too_soon") ? "A reminder was already sent in the last 24 hours." : m.includes("invalid_amount") ? "That's more than the amount due." : m.includes("not_payable") ? "This invoice can't take payments in its current state." : m.includes("no_items") ? "Add at least one line item first." : m.includes("already_issued") ? "This invoice has already been sent." : m.includes("invalid_state") ? "Only sent invoices can be credited." : "Something went wrong.";

export async function issueInvoice(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Invoice not found." };
  const ctx = await getOrganizer(); const { error } = await ctx.supabase.rpc("issue_invoice", { p_invoice: id });
  if (error) return { ok: false, error: msg(error.message) };
  await ctx.supabase.rpc("ensure_invoice_token", { p_invoice: id });
  bump(id); return { ok: true, message: "Invoice sent." };
}
export async function remindInvoice(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Invoice not found." };
  const ctx = await getOrganizer(); const { error } = await ctx.supabase.rpc("invoice_reminder", { p_invoice: id });
  if (error) return { ok: false, error: msg(error.message) };
  bump(id); return { ok: true, message: "Reminder sent." };
}
export async function creditInvoice(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Invoice not found." };
  const ctx = await getOrganizer(); const { error } = await ctx.supabase.rpc("credit_invoice", { p_invoice: id });
  if (error) return { ok: false, error: msg(error.message) };
  bump(id); return { ok: true, message: "Credit note issued. The original invoice is kept for your records." };
}
export async function recordPayment(id: string, amount: number, method: string, ref: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success || !(amount > 0)) return { ok: false, error: "Enter an amount." };
  const ctx = await getOrganizer(); const { error } = await ctx.supabase.rpc("record_invoice_payment", { p_invoice: id, p_amount: Math.round(amount * 100) / 100, p_method: method.slice(0, 40), p_ref: ref.slice(0, 120) });
  if (error) return { ok: false, error: msg(error.message) };
  bump(id); return { ok: true, message: "Payment recorded." };
}
export async function paymentLink(id: string): Promise<ActionResult<{ url: string }>> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Invoice not found." };
  const ctx = await getOrganizer(); const { data, error } = await ctx.supabase.rpc("ensure_invoice_token", { p_invoice: id });
  if (error || !data) return { ok: false, error: msg(error?.message ?? "") };
  bump(id); return { ok: true, data: { url: `/pay/${data}` } };
}
const Notes = z.string().max(2000);
export async function saveInvoiceNotes(id: string, notes: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success || !Notes.safeParse(notes).success) return { ok: false, error: "Notes are too long." };
  const ctx = await getOrganizer(); const { error, count } = await ctx.supabase.from("invoices").update({ notes }, { count: "exact" }).eq("id", id).eq("status", "draft");
  if (error || !count) return { ok: false, error: "Notes can only be edited while the invoice is a draft." };
  bump(id); return { ok: true, message: "Notes saved." };
}
