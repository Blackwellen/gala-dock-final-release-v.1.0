"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { ProposalStatus } from "@/lib/supabase/types";
import { canTransition, generateShareToken } from "../_lib/proposals";
import { layoutModeFor, typeMeta, budgetCategoriesFor } from "@/lib/events/event-types";

async function loadProposal(proposalId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const { data: proposal } = await supabase
    .from("proposals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId)
    .is("deleted_at", null)
    .maybeSingle();
  return { workspaceId, user, supabase, proposal };
}

/** Send a draft proposal: generate a share token (if missing) and set status=sent. */
export async function sendProposal(proposalId: string) {
  const { workspaceId, supabase, proposal } = await loadProposal(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (!canTransition(proposal.status as ProposalStatus, "sent")) {
    throw new Error(`Cannot send a proposal with status '${proposal.status}'`);
  }

  const { error } = await supabase
    .from("proposals")
    .update({
      status: "sent",
      share_token: proposal.share_token ?? generateShareToken(),
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId);
  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/proposals/${proposalId}`);
  revalidatePath("/event-manager/proposals");
}

/** Generic guarded status transition (used for declined→draft revise, etc.). */
export async function setProposalStatus(proposalId: string, next: ProposalStatus) {
  const { workspaceId, supabase, proposal } = await loadProposal(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (!canTransition(proposal.status as ProposalStatus, next)) {
    throw new Error(`Invalid transition: ${proposal.status} → ${next}`);
  }
  const { error } = await supabase
    .from("proposals")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId);
  if (error) throw new Error(error.message);
  revalidatePath(`/event-manager/proposals/${proposalId}`);
  revalidatePath("/event-manager/proposals");
}

/** Soft-delete a draft proposal. */
export async function deleteProposal(proposalId: string) {
  const { workspaceId, supabase, proposal } = await loadProposal(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  const { error } = await supabase
    .from("proposals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId);
  if (error) throw new Error(error.message);
  revalidatePath("/event-manager/proposals");
  redirect("/event-manager/proposals");
}

/** Duplicate a proposal (and its line items) as a fresh draft. */
export async function duplicateProposal(proposalId: string) {
  const { workspaceId, user, supabase, proposal } = await loadProposal(proposalId);
  if (!proposal) throw new Error("Proposal not found");

  const { data: newProposal, error } = await supabase
    .from("proposals")
    .insert({
      workspace_id: workspaceId,
      lead_id: proposal.lead_id,
      title: `${proposal.title} (copy)`,
      client_name: proposal.client_name,
      client_email: proposal.client_email,
      event_type: proposal.event_type,
      event_date: proposal.event_date,
      event_location: proposal.event_location,
      guest_count: proposal.guest_count,
      intro_text: proposal.intro_text,
      terms_text: proposal.terms_text,
      valid_until: proposal.valid_until,
      total_cents: proposal.total_cents,
      currency: proposal.currency,
      deposit_pct: proposal.deposit_pct,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !newProposal) throw new Error(error?.message ?? "Failed to duplicate");

  const { data: lines } = await supabase
    .from("proposal_line_items")
    .select("description, quantity, unit_price_cents, sort_order")
    .eq("workspace_id", workspaceId)
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: true });

  if (lines && lines.length > 0) {
    await supabase.from("proposal_line_items").insert(
      lines.map((l) => ({
        workspace_id: workspaceId,
        proposal_id: newProposal.id,
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: l.unit_price_cents,
        sort_order: l.sort_order,
        // total_cents is GENERATED — never inserted.
      }))
    );
  }

  revalidatePath("/event-manager/proposals");
  redirect(`/event-manager/proposals/${newProposal.id}`);
}

/**
 * Convert a signed proposal into a draft invoice + mirrored line items.
 * Guarded to status === 'signed'. Sets proposal status=converted and links the invoice.
 */
/**
 * EB-D: convert a proposal into a REAL event. Creates the event (type + layout from the proposal),
 * seeds default budget categories from the event-type config, and links the proposal. No mock data.
 */
export async function convertToEvent(proposalId: string) {
  const { workspaceId, user, supabase, proposal } = await loadProposal(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.event_id) redirect(`/event-manager/events/${proposal.event_id}`);

  const typeKey = proposal.event_type ?? null;
  const layout = typeKey ? layoutModeFor(typeKey) : null;

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      workspace_id: workspaceId,
      name: proposal.title,
      client_name: proposal.client_name,
      status: "briefing",
      event_type: typeKey,
      layout_mode: layout,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !event) throw new Error(error?.message ?? "Failed to create event");

  // Seed default budget categories from the event-type config (best-effort).
  try {
    const category = typeKey ? typeMeta(typeKey)?.category ?? "other" : "other";
    const cats = budgetCategoriesFor(category).slice(0, 12);
    if (cats.length) {
      await supabase.from("event_budget_lines").insert(
        cats.map((c) => ({ workspace_id: workspaceId, event_id: event.id, category: c, currency: "GBP", unit_cost_cents: 0 }))
      );
    }
  } catch {
    /* budget seeding is non-fatal */
  }

  const { error: updateError } = await supabase
    .from("proposals")
    .update({ status: "converted", event_id: event.id, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/event-manager/proposals/${proposalId}`);
  revalidatePath("/event-manager/events");
  redirect(`/event-manager/events/${event.id}`);
}

export async function convertToInvoice(proposalId: string) {
  const { workspaceId, user, supabase, proposal } = await loadProposal(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "signed") {
    throw new Error("Only signed proposals can be converted to an invoice");
  }

  const { data: lines } = await supabase
    .from("proposal_line_items")
    .select("description, quantity, unit_price_cents, sort_order")
    .eq("workspace_id", workspaceId)
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: true });

  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      workspace_id: workspaceId,
      invoice_number: invoiceNumber,
      client_name: proposal.client_name,
      client_email: proposal.client_email,
      event_id: proposal.event_id,
      currency: proposal.currency || "GBP",
      status: "draft",
      subtotal_cents: proposal.total_cents,
      tax_cents: 0,
      total_cents: proposal.total_cents,
      paid_cents: 0,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !invoice) throw new Error(error?.message ?? "Failed to create invoice");

  if (lines && lines.length > 0) {
    await supabase.from("invoice_line_items").insert(
      lines.map((l, i) => ({
        workspace_id: workspaceId,
        invoice_id: invoice.id,
        description: l.description,
        quantity: l.quantity,
        unit_cost_cents: l.unit_price_cents,
        tax_rate_bps: 0,
        position: l.sort_order ?? i,
      }))
    );
  }

  const { error: updateError } = await supabase
    .from("proposals")
    .update({
      status: "converted",
      converted_invoice_id: invoice.id,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/event-manager/proposals/${proposalId}`);
  redirect(`/event-manager/finance/invoices/${invoice.id}`);
}
