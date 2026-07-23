"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export interface NewTicketTierInput {
  eventId: string;
  name: string;
  description: string;
  currency: string;
  price: number; // major units
  quantity: string; // "" = unlimited
  salesStart: string; // yyyy-mm-dd or ""
  salesEnd: string; // yyyy-mm-dd or ""
  status: "draft" | "on_sale";
}

export async function createTicketTier(input: NewTicketTierInput) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  if (!input.eventId) throw new Error("Please select an event.");
  if (!input.name.trim()) throw new Error("Please give this ticket tier a name.");

  const priceCents = Math.round(input.price * 100);
  const quantity = input.quantity.trim() === "" ? null : Math.max(0, Math.round(Number(input.quantity)));

  const { data: tier, error } = await supabase
    .from("ticket_types")
    .insert({
      workspace_id: workspaceId,
      event_id: input.eventId,
      name: input.name.trim(),
      description: input.description.trim() || null,
      currency: input.currency || "GBP",
      price_cents: priceCents,
      quantity,
      sales_start: input.salesStart || null,
      sales_end: input.salesEnd || null,
      status: input.status,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !tier) {
    throw new Error(error?.message ?? "Failed to create ticket tier");
  }

  redirect("/event-manager/finance/ticket-sales");
}
