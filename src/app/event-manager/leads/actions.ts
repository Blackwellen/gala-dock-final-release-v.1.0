"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const LEAD_STAGES = [
  "new-enquiry",
  "contacted",
  "proposal-sent",
  "negotiating",
  "won",
  "lost",
] as const;
type LeadStage = (typeof LEAD_STAGES)[number];

const LEAD_SOURCES = [
  "website",
  "referral",
  "instagram",
  "facebook",
  "email",
  "phone",
  "walk-in",
  "other",
] as const;

const STAGE_LABELS: Record<LeadStage, string> = {
  "new-enquiry": "New Enquiry",
  contacted: "Contacted",
  "proposal-sent": "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Parse a "£" major-unit amount into integer cents (pence). */
function poundsToCents(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/[£,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function coerceStage(raw: FormDataEntryValue | null): LeadStage {
  const value = String(raw ?? "new-enquiry");
  return (LEAD_STAGES as readonly string[]).includes(value)
    ? (value as LeadStage)
    : "new-enquiry";
}

function coerceSource(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return (LEAD_SOURCES as readonly string[]).includes(value) ? value : null;
}

async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    workspaceId: string;
    leadId: string;
    action: string;
    detail?: string | null;
    actorId: string | null;
  }
) {
  await supabase.from("lead_activities").insert({
    workspace_id: args.workspaceId,
    lead_id: args.leadId,
    action: args.action,
    detail: args.detail ?? null,
    actor_id: args.actorId,
  });
}

/** Create a new lead, log the creation activity, and redirect to its detail page. */
export async function createLead(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  const clientName = str(formData.get("client_name"));
  if (!title) throw new Error("Lead title is required");
  if (!clientName) throw new Error("Client name is required");

  const source = coerceSource(formData.get("source"));
  const stage = coerceStage(formData.get("stage"));

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title,
      client_name: clientName,
      client_email: str(formData.get("client_email")),
      client_phone: str(formData.get("client_phone")),
      company_name: str(formData.get("company_name")),
      event_type: str(formData.get("event_type")),
      event_date: str(formData.get("event_date")),
      event_location: str(formData.get("event_location")),
      guest_count_estimate: intOrNull(formData.get("guest_count_estimate")),
      budget_estimate_cents: poundsToCents(formData.get("budget_estimate")),
      stage,
      source,
      assigned_to: str(formData.get("assigned_to")),
      notes: str(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Failed to create lead");
  }

  await logActivity(supabase, {
    workspaceId,
    leadId: lead.id,
    action: "Lead created",
    detail: source ? `Lead created from ${source}` : "Lead created",
    actorId: user.id,
  });

  revalidatePath("/event-manager/leads");
  redirect(`/event-manager/leads/${lead.id}`);
}

/** Move a lead to a new stage and log the change. Used by kanban + detail page. */
export async function updateLeadStage(leadId: string, newStage: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const stage = coerceStage(newStage);

  const { data: existing } = await supabase
    .from("leads")
    .select("stage")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) throw new Error("Lead not found");
  if (existing.stage === stage) return;

  const { error } = await supabase
    .from("leads")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  const oldLabel = STAGE_LABELS[existing.stage as LeadStage] ?? existing.stage;
  const newLabel = STAGE_LABELS[stage];
  await logActivity(supabase, {
    workspaceId,
    leadId,
    action: "Stage changed",
    detail: `Stage changed from ${oldLabel} to ${newLabel}`,
    actorId: user.id,
  });

  revalidatePath("/event-manager/leads");
  revalidatePath(`/event-manager/leads/${leadId}`);
}

/** Add a free-text note to a lead's activity timeline. */
export async function addLeadNote(leadId: string, note: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note cannot be empty");

  // Confirm the lead belongs to this workspace.
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) throw new Error("Lead not found");

  await logActivity(supabase, {
    workspaceId,
    leadId,
    action: "Note added",
    detail: `Note added: ${trimmed.slice(0, 100)}`,
    actorId: user.id,
  });

  revalidatePath(`/event-manager/leads/${leadId}`);
}

/** Log a call or email interaction against the lead. */
export async function logLeadInteraction(
  leadId: string,
  type: "call" | "email" | "note",
  detail: string
) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const trimmed = detail.trim();

  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) throw new Error("Lead not found");

  const action =
    type === "call" ? "Call logged" : type === "email" ? "Email logged" : "Note added";
  await logActivity(supabase, {
    workspaceId,
    leadId,
    action,
    detail: trimmed || action,
    actorId: user.id,
  });

  revalidatePath(`/event-manager/leads/${leadId}`);
}

/** Mark a lead as won or lost, with an optional reason, and log it. */
export async function markLeadOutcome(
  leadId: string,
  outcome: "won" | "lost",
  reason?: string
) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) throw new Error("Lead not found");

  const { error } = await supabase
    .from("leads")
    .update({
      stage: outcome,
      lost_reason: outcome === "lost" ? reason?.trim() || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, {
    workspaceId,
    leadId,
    action: outcome === "won" ? "Marked as Won" : "Marked as Lost",
    detail:
      outcome === "lost" && reason?.trim()
        ? `Marked as Lost. Reason: ${reason.trim()}`
        : `Marked as ${STAGE_LABELS[outcome]}`,
    actorId: user.id,
  });

  revalidatePath("/event-manager/leads");
  revalidatePath(`/event-manager/leads/${leadId}`);
}

/** Update core lead fields from the detail-page inline edit form. */
export async function updateLead(leadId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  const clientName = str(formData.get("client_name"));
  if (!title) throw new Error("Lead title is required");
  if (!clientName) throw new Error("Client name is required");

  const { error } = await supabase
    .from("leads")
    .update({
      title,
      client_name: clientName,
      client_email: str(formData.get("client_email")),
      client_phone: str(formData.get("client_phone")),
      company_name: str(formData.get("company_name")),
      event_type: str(formData.get("event_type")),
      event_date: str(formData.get("event_date")),
      event_location: str(formData.get("event_location")),
      guest_count_estimate: intOrNull(formData.get("guest_count_estimate")),
      budget_estimate_cents: poundsToCents(formData.get("budget_estimate")),
      source: coerceSource(formData.get("source")),
      assigned_to: str(formData.get("assigned_to")),
      notes: str(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/leads");
  revalidatePath(`/event-manager/leads/${leadId}`);
}

/** Soft-delete a lead and return to the register. */
export async function deleteLead(leadId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/leads");
  redirect("/event-manager/leads");
}

/**
 * Convert a lead into a delivery event. Creates the event, marks the lead won,
 * links it, logs the activity and redirects to the new event detail page.
 */
export async function convertLeadToEvent(leadId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead) throw new Error("Lead not found");
  if (lead.converted_event_id) {
    redirect(`/event-manager/events/${lead.converted_event_id}`);
  }

  const eventName = str(formData.get("event_name")) ?? lead.title;
  const eventDate = str(formData.get("event_date")) ?? lead.event_date;
  const clientName = str(formData.get("client_name")) ?? lead.client_name;
  const eventType = str(formData.get("event_type")) ?? lead.event_type;
  const location = str(formData.get("event_location")) ?? lead.event_location;

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name: eventName,
      client_name: clientName,
      client_email: lead.client_email,
      client_phone: lead.client_phone,
      client_company: lead.company_name,
      event_type: eventType,
      location,
      start_at: eventDate ? new Date(eventDate).toISOString() : null,
      status: "confirmed",
      budget_cents: lead.budget_estimate_cents ?? 0,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    throw new Error(eventError?.message ?? "Failed to create event");
  }

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      stage: "won",
      converted_event_id: event.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);

  if (leadError) throw new Error(leadError.message);

  await logActivity(supabase, {
    workspaceId,
    leadId,
    action: "Lead converted",
    detail: `Converted to event: ${eventName}`,
    actorId: user.id,
  });

  revalidatePath("/event-manager/leads");
  revalidatePath(`/event-manager/leads/${leadId}`);
  revalidatePath("/event-manager/events");
  redirect(`/event-manager/events/${event.id}`);
}
