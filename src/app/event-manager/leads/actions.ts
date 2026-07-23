"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

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

// ───────────────────────── New Lead Wizard actions ─────────────────────────
// Everything below is additive for the 3-step /leads/new wizard. Existing
// exports above are untouched so nothing else that depends on them breaks.

function boolFromForm(value: FormDataEntryValue | null): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function floatOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function jsonOrDefault<T>(value: FormDataEntryValue | null, fallback: T): T {
  const raw = String(value ?? "");
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stringArrayFromForm(value: FormDataEntryValue | null): string[] {
  const raw = String(value ?? "");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

/**
 * Create a new draft lead from step-1 (Contact & Source) fields. Returns the
 * new lead id so the client-side wizard can continue autosaving against it.
 * Does NOT redirect — the wizard stays on /leads/new?step=... across steps.
 */
export async function createLeadDraft(formData: FormData): Promise<{ id: string }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const clientName = str(formData.get("client_name")) ?? "New Lead";
  const title = str(formData.get("title")) ?? `${clientName} Enquiry`;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title,
      client_name: clientName,
      is_draft: true,
      wizard_step: "contact",
      lead_title: str(formData.get("lead_title")),
      job_title: str(formData.get("job_title")),
      company_name: str(formData.get("company_name")),
      client_email: str(formData.get("client_email")),
      client_phone: str(formData.get("client_phone")),
      alt_email: str(formData.get("alt_email")),
      alt_phone: str(formData.get("alt_phone")),
      source: str(formData.get("source")),
      preferred_contact_method: str(formData.get("preferred_contact_method")),
      enquiry_channel: str(formData.get("enquiry_channel")),
      assigned_to: str(formData.get("assigned_to")),
    })
    .select("id")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Failed to create draft lead");
  }

  await logActivity(supabase, {
    workspaceId,
    leadId: lead.id,
    action: "Draft created",
    detail: "Lead draft started",
    actorId: user.id,
  });

  return { id: lead.id };
}

/**
 * Autosave a single wizard step's fields against an existing draft lead.
 * Confirms workspace ownership before writing. Intentionally does not call
 * revalidatePath on every keystroke/autosave — the wizard's own React state
 * is the source of truth until completeLeadWizard() runs.
 */
export async function autosaveLeadStep(
  leadId: string,
  step: "contact" | "event-details" | "qualification",
  formData: FormData
): Promise<void> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) throw new Error("Lead not found");

  if (step === "contact") {
    const clientName = str(formData.get("client_name"));
    const update: LeadUpdate = {
      lead_title: str(formData.get("lead_title")),
      job_title: str(formData.get("job_title")),
      company_name: str(formData.get("company_name")),
      client_email: str(formData.get("client_email")),
      client_phone: str(formData.get("client_phone")),
      alt_email: str(formData.get("alt_email")),
      alt_phone: str(formData.get("alt_phone")),
      source: str(formData.get("source")),
      preferred_contact_method: str(formData.get("preferred_contact_method")),
      enquiry_channel: str(formData.get("enquiry_channel")),
      assigned_to: str(formData.get("assigned_to")),
      wizard_step: step,
      updated_at: new Date().toISOString(),
    };
    if (clientName) {
      update.client_name = clientName;
      update.title = str(formData.get("title")) ?? `${clientName} Enquiry`;
    }
    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", leadId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return;
  }

  if (step === "event-details") {
    const { error } = await supabase
      .from("leads")
      .update({
        event_type: str(formData.get("event_type")),
        event_format: str(formData.get("event_format")),
        event_date: str(formData.get("event_date")),
        date_flexibility: str(formData.get("date_flexibility")),
        event_location: str(formData.get("event_location")),
        city: str(formData.get("city")),
        contact_timezone: str(formData.get("contact_timezone")),
        guest_count_estimate: intOrNull(formData.get("guest_count_estimate")),
        currency: str(formData.get("currency")) ?? "GBP",
        budget_min_cents: poundsToCents(formData.get("budget_min")),
        budget_max_cents: poundsToCents(formData.get("budget_max")),
        budget_estimate_cents:
          poundsToCents(formData.get("budget_max")) ?? poundsToCents(formData.get("budget_min")),
        event_purpose: str(formData.get("event_purpose")),
        ticketing_type: str(formData.get("ticketing_type")),
        venue_types: stringArrayFromForm(formData.get("venue_types")),
        additional_requirements: str(formData.get("additional_requirements")),
        tags: stringArrayFromForm(formData.get("tags")),
        accessibility_notes: str(formData.get("accessibility_notes")),
        is_international: boolFromForm(formData.get("is_international")),
        multi_room: boolFromForm(formData.get("multi_room")),
        alcohol_bar: boolFromForm(formData.get("alcohol_bar")),
        minors_present: boolFromForm(formData.get("minors_present")),
        licensing_notes: str(formData.get("licensing_notes")),
        reference_links: jsonOrDefault(formData.get("reference_links"), []),
        wizard_step: step,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return;
  }

  // qualification
  const { error } = await supabase
    .from("leads")
    .update({
      stage: coerceStage(formData.get("stage")),
      priority: str(formData.get("priority")) ?? "medium",
      probability_pct: floatOrNull(formData.get("probability_pct")),
      response_due_date: str(formData.get("response_due_date")),
      assigned_to: str(formData.get("assigned_to")),
      follow_up_cadence: str(formData.get("follow_up_cadence")),
      qualification: jsonOrDefault(formData.get("qualification"), {}),
      notes: str(formData.get("notes")),
      internal_comments: str(formData.get("internal_comments")),
      next_actions: jsonOrDefault(formData.get("next_actions"), []),
      decision_maker: boolFromForm(formData.get("decision_maker")),
      lead_score: intOrNull(formData.get("lead_score")),
      lead_score_breakdown: jsonOrDefault(formData.get("lead_score_breakdown"), {}),
      wizard_step: step,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}

/**
 * Final submit for the New Lead wizard. Writes step-3 fields, flips
 * is_draft to false (so it appears in the main pipeline views) and redirects
 * either to the lead detail page (openAfter) or back to the register.
 */
export async function completeLeadWizard(
  leadId: string,
  formData: FormData,
  openAfter: boolean = false
): Promise<never> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("id, title, client_name, source")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) throw new Error("Lead not found");
  if (!existing.title || !existing.client_name) {
    throw new Error("Lead title and client name are required before completing the wizard");
  }

  const qualification = jsonOrDefault<Record<string, boolean>>(formData.get("qualification"), {});
  const score = computeLeadScoreServer({
    hasCompany: boolFromForm(formData.get("has_company")),
    hasBudget: boolFromForm(formData.get("has_budget")),
    budgetCents: intOrNull(formData.get("budget_cents_for_score")),
    hasEventDate: boolFromForm(formData.get("has_event_date")),
    hasVenue: boolFromForm(formData.get("has_venue")),
    guestCount: intOrNull(formData.get("guest_count_estimate")),
    source: existing.source,
    qualification,
  });

  const stage = coerceStage(formData.get("stage"));

  const { error } = await supabase
    .from("leads")
    .update({
      stage,
      priority: str(formData.get("priority")) ?? "medium",
      probability_pct: floatOrNull(formData.get("probability_pct")),
      response_due_date: str(formData.get("response_due_date")),
      assigned_to: str(formData.get("assigned_to")),
      follow_up_cadence: str(formData.get("follow_up_cadence")),
      qualification,
      notes: str(formData.get("notes")),
      internal_comments: str(formData.get("internal_comments")),
      next_actions: jsonOrDefault(formData.get("next_actions"), []),
      decision_maker: boolFromForm(formData.get("decision_maker")),
      lead_score: score.total,
      lead_score_breakdown: score.breakdown,
      is_draft: false,
      wizard_step: "qualification",
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, {
    workspaceId,
    leadId,
    action: "Lead created",
    detail: `Lead completed via wizard (${STAGE_LABELS[stage]})`,
    actorId: user.id,
  });

  revalidatePath("/event-manager/leads");
  revalidatePath(`/event-manager/leads/${leadId}`);

  if (openAfter) {
    redirect(`/event-manager/leads/${leadId}`);
  }
  redirect("/event-manager/leads");
}

/** Local mirror of leads/lib.ts computeLeadScore so this server file has no client import. */
function computeLeadScoreServer(input: {
  hasCompany: boolean;
  hasBudget: boolean;
  budgetCents: number | null;
  hasEventDate: boolean;
  hasVenue: boolean;
  guestCount: number | null;
  source: string | null;
  qualification: Record<string, boolean>;
}): { total: number; breakdown: Record<string, number> } {
  const QUALIFICATION_ITEM_COUNT = 11;
  const SCORE_MAX = { fit: 25, budget: 25, need: 25, timing: 15, engagement: 10 };
  const qualifiedCount = Object.values(input.qualification).filter(Boolean).length;
  const qualificationRatio = qualifiedCount / Math.max(1, QUALIFICATION_ITEM_COUNT);

  const fit = Math.round((input.hasCompany ? 0.6 : 0.3) * SCORE_MAX.fit + qualificationRatio * 0.4 * SCORE_MAX.fit);
  const budget = Math.round(
    (input.hasBudget ? 0.5 : 0.1) * SCORE_MAX.budget +
      (input.budgetCents && input.budgetCents > 5_000_00 ? 0.5 : 0.2) * SCORE_MAX.budget
  );
  const need = Math.round((input.hasEventDate ? 0.5 : 0.2) * SCORE_MAX.need + (input.hasVenue ? 0.5 : 0.2) * SCORE_MAX.need);
  const timing = Math.round(input.hasEventDate ? SCORE_MAX.timing * 0.8 : SCORE_MAX.timing * 0.3);
  const sourceWeight = input.source === "referral" || input.source === "website" ? 1 : 0.6;
  const engagement = Math.round(sourceWeight * SCORE_MAX.engagement);

  const breakdown = {
    fit: Math.min(fit, SCORE_MAX.fit),
    budget: Math.min(budget, SCORE_MAX.budget),
    need: Math.min(need, SCORE_MAX.need),
    timing: Math.min(timing, SCORE_MAX.timing),
    engagement: Math.min(engagement, SCORE_MAX.engagement),
  };
  const total = breakdown.fit + breakdown.budget + breakdown.need + breakdown.timing + breakdown.engagement;
  return { total, breakdown };
}
