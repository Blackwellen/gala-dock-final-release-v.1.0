"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

interface LineInput {
  description: string;
  qty: number;
  unitPrice: number; // major units
  taxPct: number; // percent
}

export interface NewInvoiceInput {
  clientName: string;
  currency: string;
  issuedOn: string; // yyyy-mm-dd or ""
  dueOn: string; // yyyy-mm-dd or ""
  notes: string;
  lines: LineInput[];
}

export async function createInvoice(input: NewInvoiceInput) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const cleanLines = input.lines.filter((l) => l.description.trim().length > 0);

  let subtotal = 0;
  let tax = 0;
  const linePayloads = cleanLines.map((l, i) => {
    const unitCents = Math.round(l.unitPrice * 100);
    const lineTotal = Math.round(unitCents * l.qty);
    subtotal += lineTotal;
    tax += Math.round((lineTotal * l.taxPct) / 100);
    return {
      description: l.description.trim(),
      quantity: l.qty,
      unit_cost_cents: unitCents,
      tax_rate_bps: Math.round(l.taxPct * 100),
      position: i,
    };
  });
  const total = subtotal + tax;

  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      workspace_id: workspaceId,
      invoice_number: invoiceNumber,
      client_name: input.clientName.trim() || null,
      currency: input.currency || "GBP",
      issued_on: input.issuedOn || null,
      due_on: input.dueOn || null,
      notes: input.notes.trim() || null,
      status: "draft",
      subtotal_cents: subtotal,
      tax_cents: tax,
      total_cents: total,
      paid_cents: 0,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Failed to create invoice");
  }

  if (linePayloads.length > 0) {
    await supabase.from("invoice_line_items").insert(
      linePayloads.map((l) => ({
        ...l,
        workspace_id: workspaceId,
        invoice_id: invoice.id,
      }))
    );
  }

  redirect(`/event-manager/finance/invoices/${invoice.id}`);
}
