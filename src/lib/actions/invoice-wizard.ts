"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { nextNumber } from "@/lib/numbering";
import type { ActionResult } from "./shell";

const Item = z.object({ description: z.string().trim().min(1).max(120), detail: z.string().max(300), quantity: z.number().positive().max(100000), unit_price: z.number().min(0).max(10_000_000), tax_rate: z.number().min(0).max(100) });
const Details = z.object({ client_name: z.string().trim().min(2).max(120), client_email: z.string().trim().email().max(200).or(z.literal("")), client_address: z.string().max(300), contact_name: z.string().max(120), event_id: z.string().uuid().nullable(), reference: z.string().max(60), currency: z.enum(["GBP", "EUR", "USD"]), issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), po: z.string().max(60), items: z.array(Item).min(1).max(100) });
const Inst = z.object({ due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().max(60), amount: z.number().positive() });
const Schedule = z.object({ mode: z.enum(["single", "instalments"]), instalments: z.array(Inst).max(12), notes: z.string().max(2000), send: z.boolean() });

/** Step 1: create or update the draft invoice and its line items. */
export async function saveInvoiceDraft(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrganizer(); if (!ctx.canMoney) return { ok: false, error: "You need Finance access to create invoices." };
  const p = Details.safeParse(input); if (!p.success) { const f = String(p.error.issues[0]?.path[0]); return { ok: false, error: f === "items" ? "Add at least one item with a description." : f === "client_email" ? "Enter a valid client email." : f === "client_name" ? "Choose a client." : "Check the invoice details." }; }
  const d = p.data; if (d.due_date < d.issue_date) return { ok: false, error: "The due date must be on or after the issue date." };
  const sub = d.items.reduce((s, i) => s + i.quantity * i.unit_price, 0), tax = d.items.reduce((s, i) => s + i.quantity * i.unit_price * i.tax_rate / 100, 0);
  const row = { client_name: d.client_name, client_email: d.client_email, client_address: d.client_address, contact_name: d.contact_name, event_id: d.event_id, reference: d.po ? `${d.reference} · PO ${d.po}`.slice(0, 80) : d.reference, currency: d.currency, issue_date: d.issue_date, due_date: d.due_date, subtotal: Math.round(sub * 100) / 100, tax: Math.round(tax * 100) / 100, total: Math.round((sub + tax) * 100) / 100 };
  let invId = id;
  if (invId) {
    const { error, count } = await ctx.supabase.from("invoices").update(row, { count: "exact" }).eq("id", invId).eq("status", "draft");
    if (error || !count) return { ok: false, error: "Only draft invoices can be edited." };
    await ctx.supabase.from("invoice_items").delete().eq("invoice_id", invId);
  } else {
    const { data: nums } = await ctx.supabase.from("invoices").select("number").eq("workspace_id", ctx.workspace.id);
    const number = nextNumber("INV", (nums ?? []).map(n => n.number));
    const { data, error } = await ctx.supabase.from("invoices").insert({ ...row, number, workspace_id: ctx.workspace.id, status: "draft" }).select("id").single();
    if (error || !data) return { ok: false, error: "Could not create the invoice." };
    invId = data.id;
    await ctx.supabase.from("invoice_events").insert({ invoice_id: invId, event: "Invoice created", detail: `By ${ctx.name}` });
  }
  const { error: ie } = await ctx.supabase.from("invoice_items").insert(d.items.map((it, i) => ({ ...it, invoice_id: invId!, sort: i + 1 })));
  if (ie) return { ok: false, error: "Could not save the line items." };
  revalidatePath("/organizer/money"); return { ok: true, data: { id: invId! } };
}

/** Step 2: payment schedule + notes; optionally issue (send) the invoice and create its pay link. */
export async function scheduleInvoice(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await getOrganizer(); if (!ctx.canMoney) return { ok: false, error: "You need Finance access." };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invoice not found." };
  const p = Schedule.safeParse(input); if (!p.success) return { ok: false, error: "Check the payment schedule." };
  const { data: inv } = await ctx.supabase.from("invoices").select("id,total,due_date,status,issue_date").eq("id", id).maybeSingle();
  if (!inv || inv.status !== "draft") return { ok: false, error: "This invoice has already been sent." };
  await ctx.supabase.from("invoice_installments").delete().eq("invoice_id", id);
  if (p.data.mode === "instalments") {
    const tot = p.data.instalments.reduce((s, x) => s + x.amount, 0);
    if (p.data.instalments.length < 2) return { ok: false, error: "Add at least two instalments, or choose a single payment." };
    if (Math.abs(tot - Number(inv.total)) > 0.01) return { ok: false, error: `Instalments add up to £${tot.toFixed(2)} — they must equal the £${Number(inv.total).toFixed(2)} total.` };
    if (p.data.instalments.some(x => x.due_date < inv.issue_date)) return { ok: false, error: "Instalments can't be due before the issue date." };
    const { error } = await ctx.supabase.from("invoice_installments").insert(p.data.instalments.map(x => ({ ...x, invoice_id: id, status: "due" })));
    if (error) return { ok: false, error: "Could not save the instalments." };
    await ctx.supabase.from("invoices").update({ due_date: p.data.instalments.at(-1)!.due_date }).eq("id", id);
  }
  await ctx.supabase.from("invoices").update({ notes: p.data.notes }).eq("id", id);
  if (p.data.send) {
    const { error } = await ctx.supabase.rpc("issue_invoice", { p_invoice: id });
    if (error) return { ok: false, error: error.message.includes("no_items") ? "Add at least one line item." : "Could not send the invoice." };
    await ctx.supabase.rpc("ensure_invoice_token", { p_invoice: id });
  }
  revalidatePath("/organizer/money"); revalidatePath(`/organizer/money/invoices/${id}`);
  return { ok: true, message: p.data.send ? "Invoice sent with a secure payment link." : "Draft saved.", redirect: `/organizer/money/invoices/${id}` };
}
