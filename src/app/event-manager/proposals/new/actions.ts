"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { generateShareToken } from "../_lib/proposals";

interface WizardLine {
  description: string;
  quantity: number;
  unitPrice: number; // major units (£)
}

export interface NewProposalInput {
  title: string;
  clientName: string;
  clientEmail: string;
  eventType: string;
  eventDate: string; // yyyy-mm-dd or ""
  eventLocation: string;
  guestCount: string; // raw input
  validUntil: string; // yyyy-mm-dd or ""
  leadId: string; // "" if none
  introText: string;
  termsText: string;
  depositPct: number;
  lines: WizardLine[];
  send: boolean; // true => status sent + share token
}

export async function createProposal(input: NewProposalInput) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const cleanLines = input.lines.filter((l) => l.description.trim().length > 0);

  let totalCents = 0;
  const linePayloads = cleanLines.map((l, i) => {
    const unitCents = Math.round((Number(l.unitPrice) || 0) * 100);
    const qty = Number(l.quantity) || 0;
    totalCents += Math.round(unitCents * qty);
    return {
      description: l.description.trim(),
      quantity: qty,
      unit_price_cents: unitCents,
      sort_order: i,
      // total_cents is GENERATED — never inserted.
    };
  });

  const guestCount = input.guestCount.trim() ? Number(input.guestCount) : null;

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      workspace_id: workspaceId,
      lead_id: input.leadId || null,
      title: input.title.trim(),
      client_name: input.clientName.trim(),
      client_email: input.clientEmail.trim() || null,
      event_type: input.eventType.trim() || null,
      event_date: input.eventDate || null,
      event_location: input.eventLocation.trim() || null,
      guest_count: guestCount != null && !Number.isNaN(guestCount) ? guestCount : null,
      intro_text: input.introText.trim() || null,
      terms_text: input.termsText.trim() || null,
      valid_until: input.validUntil || null,
      total_cents: totalCents,
      currency: "GBP",
      deposit_pct: input.depositPct || null,
      status: input.send ? "sent" : "draft",
      share_token: input.send ? generateShareToken() : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !proposal) {
    throw new Error(error?.message ?? "Failed to create proposal");
  }

  if (linePayloads.length > 0) {
    const { error: lineError } = await supabase.from("proposal_line_items").insert(
      linePayloads.map((l) => ({
        ...l,
        workspace_id: workspaceId,
        proposal_id: proposal.id,
      }))
    );
    if (lineError) throw new Error(lineError.message);
  }

  // Link back to the lead's activity trail when a lead was selected.
  if (input.leadId) {
    await supabase.from("lead_activities").insert({
      workspace_id: workspaceId,
      lead_id: input.leadId,
      action: "proposal_created",
      detail: `Proposal '${input.title.trim()}' created and linked`,
      actor_id: user.id,
    });
  }

  revalidatePath("/event-manager/proposals");
  redirect(`/event-manager/proposals/${proposal.id}`);
}
