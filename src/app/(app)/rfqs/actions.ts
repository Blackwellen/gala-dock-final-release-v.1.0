"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { RFQ_STATUSES, RECIPIENT_STATUSES } from "./lib";

// ── helpers ──────────────────────────────────────────────────────────────────

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

function coerceRfqStatus(raw: string): string {
  return (RFQ_STATUSES as readonly string[]).includes(raw) ? raw : "draft";
}

function coerceRecipientStatus(raw: string): string {
  return (RECIPIENT_STATUSES as readonly string[]).includes(raw) ? raw : "pending";
}

// ── Create RFQ + recipients ────────────────────────────────────────────────────

/**
 * Create an RFQ and its recipient rows (one per selected supplier), then
 * redirect to the RFQ detail page. Uses the live schema: rfqs(title, scope,
 * status, due_date, event_id, created_by) + rfq_recipients(rfq_id, supplier_id,
 * status). The plan's service_category / brief / guest_count / budget columns
 * do not exist on these tables — the brief is captured in `scope`.
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

  const { data: rfq, error } = await supabase
    .from("rfqs")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title,
      scope: str(formData.get("scope")),
      due_date: str(formData.get("due_date")),
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
    }))
  );
  if (recipientsError) {
    throw new Error(recipientsError.message);
  }

  revalidatePath("/rfqs");
  redirect(`/rfqs/${rfq.id}`);
}

/** Update the RFQ-level status (e.g. close it). */
export async function updateRfqStatus(rfqId: string, newStatus: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("rfqs")
    .update({ status: coerceRfqStatus(newStatus), updated_at: new Date().toISOString() })
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  revalidatePath("/rfqs");
  revalidatePath(`/rfqs/${rfqId}`);
}

/**
 * Record (or update) a supplier's response on a recipient row. Used to log a
 * quote that arrived by phone/email into the comparison matrix.
 */
export async function updateRecipientResponse(
  rfqId: string,
  recipientId: string,
  formData: FormData
) {
  const { workspaceId } = await requireWorkspace();
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

  // Once any response is logged, advance the RFQ to "responses-received"
  // unless it has already been awarded or closed.
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("status")
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (rfq && rfq.status !== "awarded" && rfq.status !== "closed") {
    await supabase
      .from("rfqs")
      .update({ status: "responses-received", updated_at: new Date().toISOString() })
      .eq("id", rfqId)
      .eq("workspace_id", workspaceId);
  }

  revalidatePath(`/rfqs/${rfqId}`);
}

/**
 * Award the RFQ to one recipient: that recipient becomes `accepted`, every
 * other recipient becomes `rejected`, and the RFQ status becomes `awarded`.
 */
export async function awardRfq(rfqId: string, recipientId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: winner } = await supabase
    .from("rfq_recipients")
    .select("id")
    .eq("id", recipientId)
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!winner) throw new Error("Recipient not found");

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
    .eq("id", recipientId)
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId);
  if (acceptError) throw new Error(acceptError.message);

  const { error: rfqError } = await supabase
    .from("rfqs")
    .update({ status: "awarded", updated_at: new Date().toISOString() })
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId);
  if (rfqError) throw new Error(rfqError.message);

  revalidatePath("/rfqs");
  revalidatePath(`/rfqs/${rfqId}`);
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

  revalidatePath("/rfqs");
  redirect("/rfqs");
}
