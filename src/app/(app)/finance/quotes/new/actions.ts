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

export interface NewQuoteInput {
  supplierId: string;
  title: string;
  currency: string;
  deadline: string; // yyyy-mm-dd or ""
  scope: string;
  notes: string;
  lines: LineInput[];
}

export async function createQuote(input: NewQuoteInput) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const cleanLines = input.lines.filter((l) => l.description.trim().length > 0);

  let subtotal = 0;
  let tax = 0;
  const linePayloads = cleanLines.map((l, i) => {
    const unitCents = Math.round(l.unitPrice * 100);
    const qtyX100 = Math.round(l.qty * 100);
    const lineTotal = Math.round((unitCents * qtyX100) / 100);
    subtotal += lineTotal;
    tax += Math.round((lineTotal * l.taxPct) / 100);
    return {
      description: l.description.trim(),
      qty_x100: qtyX100,
      unit_price_cents: unitCents,
      tax_pct_x100: Math.round(l.taxPct * 100),
      line_total_cents: lineTotal,
      sort_order: i,
    };
  });
  const total = subtotal + tax;

  const code = `QT-${Date.now().toString(36).toUpperCase()}`;

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      workspace_id: workspaceId,
      supplier_id: input.supplierId,
      code,
      title: input.title.trim() || null,
      currency: input.currency || "GBP",
      deadline: input.deadline || null,
      scope: input.scope.trim() || null,
      notes: input.notes.trim() || null,
      status: "draft",
      subtotal_cents: subtotal,
      tax_cents: tax,
      total_cents: total,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !quote) {
    throw new Error(error?.message ?? "Failed to create quote");
  }

  if (linePayloads.length > 0) {
    await supabase.from("quote_lines").insert(
      linePayloads.map((l) => ({
        ...l,
        workspace_id: workspaceId,
        quote_id: quote.id,
      }))
    );
  }

  redirect(`/finance/quotes/${quote.id}`);
}
