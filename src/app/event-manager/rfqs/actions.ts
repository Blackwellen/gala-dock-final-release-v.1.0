"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace, getWorkspaceRole } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { RFQ_STATUSES, RECIPIENT_STATUSES } from "./lib";

// ── helpers ──────────────────────────────────────────────────────────────────

export type ActionResult = { error?: string; message?: string };

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

/**
 * Award / booking-conversion are commercially sensitive (matches the
 * `rfq_awards_insert` RLS policy comment in the migration) — require
 * owner/admin/manager. Throws a friendly error instead of a raw RLS 403.
 */
async function requireRfqManager() {
  const ctx = await requireWorkspace();
  const role = await getWorkspaceRole();
  if (!role || !MANAGER_ROLES.has(role)) {
    throw new Error("You need owner, admin or manager access to award RFQs.");
  }
  return ctx;
}

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/** Parse a "£" major-unit amount into integer cents (pence). */
function poundsToCents(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/[£,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function coerceRfqStatus(raw: string): string {
  return (RFQ_STATUSES as readonly string[]).includes(raw) ? raw : "draft";
}

function coerceRecipientStatus(raw: string): string {
  return (RECIPIENT_STATUSES as readonly string[]).includes(raw) ? raw : "pending";
}

async function logRfqActivity(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  rfqId: string,
  actorId: string | null,
  action: string,
  subject: Record<string, unknown>
) {
  // Best-effort — a failed audit write should not roll back a mutation that
  // already succeeded, but it is surfaced in server logs for diagnosis.
  const { error } = await supabase.from("rfq_activity").insert({
    workspace_id: workspaceId,
    rfq_id: rfqId,
    actor_id: actorId,
    action,
    subject: subject as Json,
  });
  if (error) console.error("[rfq_activity] failed to log", action, error.message);
}

async function logRfqStatusChange(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  rfqId: string,
  actorId: string | null,
  fromStatus: string | null,
  toStatus: string
) {
  const { error } = await supabase.from("rfq_status_history").insert({
    workspace_id: workspaceId,
    rfq_id: rfqId,
    changed_by: actorId,
    from_status: fromStatus,
    to_status: toStatus,
  });
  if (error) console.error("[rfq_status_history] failed to log", toStatus, error.message);
}

/**
 * Sync the lightweight `rfq_recipients` tracker row from a formal
 * `rfq_responses` submission, so the "Responses" tab (which reads the
 * lightweight tracker) stays in sync with the versioned quote workflow. Both
 * paths coexist — this is the single place that keeps them aligned.
 */
async function syncRecipientFromResponse(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  rfqId: string,
  supplierId: string,
  totalAmountCents: number | null
) {
  const { error } = await supabase
    .from("rfq_recipients")
    .update({
      status: "responded",
      quote_amount_cents: totalAmountCents,
      responded_at: new Date().toISOString(),
    })
    .eq("rfq_id", rfqId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId);
  if (error) console.error("[rfq_recipients] failed to sync from response", error.message);
}

/** Advance the RFQ status to `responses_received` unless it's already past that point. */
async function maybeAdvanceRfqStatus(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  rfqId: string,
  actorId: string | null
) {
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("status")
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!rfq) return;
  const settled = new Set(["awarded", "closed", "cancelled"]);
  if (settled.has(rfq.status)) return;

  await supabase
    .from("rfqs")
    .update({ status: "responses_received", updated_at: new Date().toISOString() })
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId);

  if (rfq.status !== "responses_received") {
    await logRfqStatusChange(supabase, workspaceId, rfqId, actorId, rfq.status, "responses_received");
  }
}

// ── Create RFQ + recipients ────────────────────────────────────────────────────

/**
 * Build `evaluation_criteria` jsonb from repeatable `criterion` / `weight`
 * form fields (same-name arrays, paired by index). Returns null when no
 * criterion was filled in — this stays optional, it does not block create.
 */
function buildEvaluationCriteria(formData: FormData): Json | null {
  const criteria = formData.getAll("criterion").map((v) => String(v).trim());
  const weights = formData.getAll("weight").map((v) => String(v).trim());
  const rows = criteria
    .map((criterion, i) => ({
      criterion,
      weight: weights[i] && Number.isFinite(Number(weights[i])) ? Number(weights[i]) : null,
    }))
    .filter((r) => r.criterion !== "");
  return rows.length > 0 ? (rows as unknown as Json) : null;
}

/**
 * Create an RFQ and its recipient rows (one per selected supplier), then
 * redirect to the RFQ detail page.
 */
export async function createRfq(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  if (!title) throw new Error("RFQ title is required");

  const supplierIds = formData
    .getAll("supplier_ids")
    .map((v) => String(v))
    .filter(Boolean);
  if (supplierIds.length === 0) {
    throw new Error("Select at least one supplier to request quotes from");
  }

  // Validate the selected suppliers belong to this workspace.
  const { data: validSuppliers } = await supabase
    .from("suppliers")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("id", supplierIds);
  const validIds = (validSuppliers ?? []).map((s) => s.id);
  if (validIds.length === 0) {
    throw new Error("None of the selected suppliers are valid");
  }

  const eventId = str(formData.get("event_id"));
  if (eventId) {
    const { data: ev } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!ev) throw new Error("Linked event not found");
  }

  const dueDate = str(formData.get("due_date"));
  const budgetLowCents = poundsToCents(formData.get("budget_low"));
  const budgetHighCents = poundsToCents(formData.get("budget_high"));

  const { data: rfq, error } = await supabase
    .from("rfqs")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title,
      scope: str(formData.get("scope")),
      category: str(formData.get("category")),
      due_date: dueDate,
      // Same value as due_date — a single "Response Deadline" input drives both
      // the date-only column (used by list/overdue math) and the timestamptz
      // column (used by the formal RFQ workflow).
      response_deadline: dueDate,
      budget_low_cents: budgetLowCents,
      budget_high_cents: budgetHighCents,
      evaluation_criteria: buildEvaluationCriteria(formData),
      event_id: eventId,
      status: "sent",
    })
    .select("id")
    .single();

  if (error || !rfq) {
    throw new Error(error?.message ?? "Failed to create RFQ");
  }

  const { error: recipientsError } = await supabase.from("rfq_recipients").insert(
    validIds.map((supplierId) => ({
      workspace_id: workspaceId,
      rfq_id: rfq.id,
      supplier_id: supplierId,
      status: "pending",
      invited_at: new Date().toISOString(),
    }))
  );
  if (recipientsError) {
    throw new Error(recipientsError.message);
  }

  await logRfqStatusChange(supabase, workspaceId, rfq.id, user.id, null, "sent");
  await logRfqActivity(supabase, workspaceId, rfq.id, user.id, "created", {
    title,
    supplierCount: validIds.length,
  });

  revalidatePath("/event-manager/rfqs");
  redirect(`/event-manager/rfqs/${rfq.id}`);
}

/** Update the RFQ-level status (e.g. close it). */
export async function updateRfqStatus(rfqId: string, newStatus: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("rfqs")
    .select("status")
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const status = coerceRfqStatus(newStatus);
  const { error } = await supabase
    .from("rfqs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  if (existing && existing.status !== status) {
    await logRfqStatusChange(supabase, workspaceId, rfqId, user.id, existing.status, status);
    await logRfqActivity(supabase, workspaceId, rfqId, user.id, "status_changed", {
      from: existing.status,
      to: status,
    });
  }

  revalidatePath("/event-manager/rfqs");
  revalidatePath(`/event-manager/rfqs/${rfqId}`);
}

/**
 * Record (or update) a supplier's response on a recipient row. This is the
 * lightweight "log a phone/email quote" path used for quick recipient-status
 * updates — it coexists with the formal `submitRfqResponse` versioned-quote
 * workflow below.
 */
export async function updateRecipientResponse(
  rfqId: string,
  recipientId: string,
  formData: FormData
) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  // Confirm the recipient belongs to this RFQ + workspace.
  const { data: recipient } = await supabase
    .from("rfq_recipients")
    .select("id")
    .eq("id", recipientId)
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!recipient) throw new Error("Recipient not found");

  const rawStatus = String(formData.get("status") ?? "responded");
  const status = coerceRecipientStatus(rawStatus);
  const quoteCents = poundsToCents(formData.get("quote_amount"));
  const notes = str(formData.get("notes"));

  const respondedStates = ["responded", "declined", "accepted", "rejected"];
  const { error } = await supabase
    .from("rfq_recipients")
    .update({
      status,
      quote_amount_cents: quoteCents,
      notes,
      responded_at: respondedStates.includes(status)
        ? new Date().toISOString()
        : null,
    })
    .eq("id", recipientId)
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  await logRfqActivity(supabase, workspaceId, rfqId, user.id, "recipient_response_logged", {
    recipientId,
    status,
    quoteCents,
  });

  // Once any response is logged, advance the RFQ status unless it's already
  // past that point (awarded/closed/cancelled).
  await maybeAdvanceRfqStatus(supabase, workspaceId, rfqId, user.id);

  revalidatePath(`/event-manager/rfqs/${rfqId}`);
}

// ── Formal response + line items ───────────────────────────────────────────

/**
 * Create a formal, versioned `rfq_responses` row (+ line items) for a
 * supplier. If line items are present their server-computed sum is always
 * the source of truth for `total_amount_cents`; otherwise the manually
 * entered total is used. Also syncs the lightweight `rfq_recipients` tracker
 * so the Responses tab stays consistent.
 */
export async function submitRfqResponse(rfqId: string, supplierId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: rfq } = await supabase
    .from("rfqs")
    .select("id, status")
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rfq) throw new Error("RFQ not found");

  const { data: recipient } = await supabase
    .from("rfq_recipients")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!recipient) throw new Error("This supplier is not an invited recipient of this RFQ");

  const lineDescriptions = formData.getAll("line_description").map((v) => String(v).trim());
  const lineQuantities = formData.getAll("line_quantity").map((v) => String(v));
  const lineUnitPrices = formData.getAll("line_unit_price").map((v) => String(v));

  const lineItems = lineDescriptions
    .map((description, i) => {
      const quantity = Number(lineQuantities[i] ?? "1") || 1;
      const unitPriceCents = poundsToCents(lineUnitPrices[i] ?? "") ?? 0;
      return { description, quantity, unitPriceCents };
    })
    .filter((li) => li.description !== "");

  const lineItemsTotalCents = lineItems.reduce(
    (sum, li) => sum + Math.round(li.quantity * li.unitPriceCents),
    0
  );
  const manualTotalCents = poundsToCents(formData.get("total_amount"));
  const totalAmountCents = lineItems.length > 0 ? lineItemsTotalCents : manualTotalCents;

  if (totalAmountCents === null) {
    throw new Error("Enter a total amount or at least one priced line item");
  }

  // Next version for this supplier on this RFQ.
  const { data: priorVersions } = await supabase
    .from("rfq_responses")
    .select("version")
    .eq("rfq_id", rfqId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = (priorVersions?.[0]?.version ?? 0) + 1;

  const { data: response, error } = await supabase
    .from("rfq_responses")
    .insert({
      workspace_id: workspaceId,
      rfq_id: rfqId,
      supplier_id: supplierId,
      version: nextVersion,
      status: "submitted",
      total_amount_cents: totalAmountCents,
      lead_time_days: intOrNull(formData.get("lead_time_days")),
      valid_until: str(formData.get("valid_until")),
      exclusions: str(formData.get("exclusions")),
      assumptions: str(formData.get("assumptions")),
      notes: str(formData.get("notes")),
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !response) {
    throw new Error(error?.message ?? "Failed to save response");
  }

  if (lineItems.length > 0) {
    const { error: lineError } = await supabase.from("rfq_response_line_items").insert(
      lineItems.map((li, i) => ({
        workspace_id: workspaceId,
        rfq_response_id: response.id,
        description: li.description,
        quantity: li.quantity,
        unit_price_cents: li.unitPriceCents,
        sort_order: i,
      }))
    );
    if (lineError) throw new Error(lineError.message);
  }

  await syncRecipientFromResponse(supabase, workspaceId, rfqId, supplierId, totalAmountCents);
  await maybeAdvanceRfqStatus(supabase, workspaceId, rfqId, user.id);
  await logRfqActivity(supabase, workspaceId, rfqId, user.id, "response_submitted", {
    supplierId,
    responseId: response.id,
    version: nextVersion,
    totalAmountCents,
  });

  revalidatePath(`/event-manager/rfqs/${rfqId}`);
  revalidatePath(`/event-manager/rfqs/${rfqId}/compare`);
}

// ── Award + convert to booking ──────────────────────────────────────────────

/**
 * Award the RFQ to one supplier: that supplier's recipient row becomes
 * `accepted`, every other recipient becomes `rejected`, and the RFQ status
 * becomes `awarded`. `rfqResponseId` links the award to a specific formal
 * quote when awarding from the comparison view.
 */
export async function awardRfq(
  rfqId: string,
  supplierId: string,
  rfqResponseId?: string | null,
  reason?: string | null,
  savingsCents?: number | null
) {
  const { workspaceId, user } = await requireRfqManager();
  const supabase = await createClient();

  const { data: rfq } = await supabase
    .from("rfqs")
    .select("id, status")
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rfq) throw new Error("RFQ not found");

  const { data: recipient } = await supabase
    .from("rfq_recipients")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!recipient) throw new Error("Recipient not found");

  // Reject all recipients on this RFQ first…
  const { error: rejectError } = await supabase
    .from("rfq_recipients")
    .update({ status: "rejected" })
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId);
  if (rejectError) throw new Error(rejectError.message);

  // …then mark the winner accepted.
  const { error: acceptError } = await supabase
    .from("rfq_recipients")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", recipient.id)
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId);
  if (acceptError) throw new Error(acceptError.message);

  const { error: rfqError } = await supabase
    .from("rfqs")
    .update({
      status: "awarded",
      awarded_supplier_id: supplierId,
      awarded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId);
  if (rfqError) throw new Error(rfqError.message);

  const { data: existingAward } = await supabase
    .from("rfq_awards")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const awardRow = {
    workspace_id: workspaceId,
    rfq_id: rfqId,
    supplier_id: supplierId,
    rfq_response_id: rfqResponseId ?? null,
    awarded_by: user.id,
    awarded_at: new Date().toISOString(),
    award_reason: reason ?? null,
    savings_cents: savingsCents ?? null,
  };

  const { error: awardError } = existingAward
    ? await supabase.from("rfq_awards").update(awardRow).eq("id", existingAward.id)
    : await supabase.from("rfq_awards").insert(awardRow);
  if (awardError) throw new Error(awardError.message);

  await logRfqStatusChange(supabase, workspaceId, rfqId, user.id, rfq.status, "awarded");
  await logRfqActivity(supabase, workspaceId, rfqId, user.id, "awarded", {
    supplierId,
    rfqResponseId: rfqResponseId ?? null,
    reason: reason ?? null,
  });

  revalidatePath("/event-manager/rfqs");
  revalidatePath(`/event-manager/rfqs/${rfqId}`);
  revalidatePath(`/event-manager/rfqs/${rfqId}/compare`);
}

/**
 * Convert an award into a real booking: creates an `event_suppliers` row on
 * the RFQ's linked event using the awarded supplier + response total. Guards
 * against double-conversion.
 */
export async function convertAwardToBooking(rfqId: string): Promise<ActionResult> {
  const { workspaceId, user } = await requireRfqManager();
  const supabase = await createClient();

  const { data: rfq } = await supabase
    .from("rfqs")
    .select("id, category, event_id, status")
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rfq) return { error: "RFQ not found." };
  if (!rfq.event_id) {
    return { error: "This RFQ is not linked to an event — link an event before converting to a booking." };
  }

  const { data: award } = await supabase
    .from("rfq_awards")
    .select("id, supplier_id, rfq_response_id, event_supplier_id, booking_committed_at")
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!award) return { error: "Award this RFQ to a supplier before converting it to a booking." };
  if (award.booking_committed_at) {
    return { message: "This RFQ award has already been converted to a booking." };
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name, primary_email, primary_phone")
    .eq("id", award.supplier_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!supplier) return { error: "Awarded supplier not found." };

  let contractValueCents: number | null = null;
  if (award.rfq_response_id) {
    const { data: response } = await supabase
      .from("rfq_responses")
      .select("total_amount_cents")
      .eq("id", award.rfq_response_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    contractValueCents = response?.total_amount_cents ?? null;
  }
  if (contractValueCents === null) {
    const { data: recipient } = await supabase
      .from("rfq_recipients")
      .select("quote_amount_cents")
      .eq("rfq_id", rfqId)
      .eq("supplier_id", award.supplier_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    contractValueCents = recipient?.quote_amount_cents ?? null;
  }

  const { data: eventSupplier, error: insertError } = await supabase
    .from("event_suppliers")
    .insert({
      workspace_id: workspaceId,
      event_id: rfq.event_id,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      role: rfq.category,
      role_on_event: rfq.category,
      status: "confirmed",
      contract_value_cents: contractValueCents,
      contact_email: supplier.primary_email,
      contact_phone: supplier.primary_phone,
      notes: "Created from RFQ award.",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !eventSupplier) {
    return { error: insertError?.message ?? "Failed to create the booking record." };
  }

  const { error: updateAwardError } = await supabase
    .from("rfq_awards")
    .update({
      event_supplier_id: eventSupplier.id,
      booking_committed_at: new Date().toISOString(),
    })
    .eq("id", award.id);
  if (updateAwardError) return { error: updateAwardError.message };

  await logRfqActivity(supabase, workspaceId, rfqId, user.id, "converted_to_booking", {
    supplierId: supplier.id,
    eventSupplierId: eventSupplier.id,
    contractValueCents,
  });

  revalidatePath(`/event-manager/rfqs/${rfqId}`);
  revalidatePath(`/event-manager/events/${rfq.event_id}`);

  return { message: "Converted to a booking." };
}

/** Soft-delete an RFQ and return to the register. */
export async function deleteRfq(rfqId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("rfqs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/rfqs");
  redirect("/event-manager/rfqs");
}
