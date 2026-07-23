"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export interface NewDepositInput {
  eventId: string;
  clientId: string;
  kind: string;
  label: string;
  amountMajor: number; // major units, e.g. 500.00
  currency: string;
  dueDate: string; // yyyy-mm-dd or ""
  refundable: boolean;
  notes: string;
}

export async function createDeposit(input: NewDepositInput) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  if (!input.eventId) {
    throw new Error("An event is required to create a deposit.");
  }
  if (!input.label.trim()) {
    throw new Error("A label is required to create a deposit.");
  }
  if (!Number.isFinite(input.amountMajor) || input.amountMajor <= 0) {
    throw new Error("Total required must be a positive amount.");
  }

  const { error } = await supabase.from("event_deposits").insert({
    workspace_id: workspaceId,
    event_id: input.eventId,
    client_id: input.clientId || null,
    kind: input.kind || "other",
    label: input.label.trim(),
    amount_cents: Math.round(input.amountMajor * 100),
    paid_cents: 0,
    currency: input.currency || "GBP",
    due_date: input.dueDate || null,
    refundable: input.refundable,
    status: "pending",
    notes: input.notes.trim() || null,
    created_by: user.id,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to create deposit");
  }

  redirect("/event-manager/finance/deposits");
}
