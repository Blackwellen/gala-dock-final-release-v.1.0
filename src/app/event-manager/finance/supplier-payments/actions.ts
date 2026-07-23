"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace, canManageWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { safeGenerateAndUpload, generateRemittanceHtml } from "../_lib/documents";
import { r2PresignedGet } from "@/lib/storage/r2";

/**
 * Server actions for Supplier Payments (accounts payable).
 *
 * `event_expenses` doubles as the AP/bill ledger whenever `supplier_id IS NOT
 * NULL`. Money is stored in *_cents. Every query is additionally constrained
 * by `workspace_id` for defence-in-depth on top of RLS, and never trusts a
 * client-submitted workspace id — it is always resolved server-side via
 * `requireWorkspace()`.
 */

const LIST_PATH = "/event-manager/finance/supplier-payments";

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/** Parse a "£" amount string into integer pence/cents. */
function poundsToCents(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").replace(/[£,\s]/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * Create a supplier bill. Any workspace member may submit a bill — it always
 * starts as `pending_review` / `unpaid` and must be approved before it can be
 * included in a payment run.
 */
export async function createSupplierBill(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const supplierId = str(formData.get("supplier_id"));
  const eventId = str(formData.get("event_id"));
  const description = str(formData.get("description"));
  if (!supplierId) throw new Error("Select a supplier");
  if (!eventId) throw new Error("Select an event");
  if (!description) throw new Error("A description is required");

  const amountCents = poundsToCents(formData.get("amount"));
  if (amountCents <= 0) throw new Error("Enter a bill amount greater than zero");

  // Verify supplier + event belong to this workspace before writing the bill.
  const [{ data: supplier }, { data: event }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!supplier) throw new Error("Supplier not found in this workspace");
  if (!event) throw new Error("Event not found in this workspace");

  const { error } = await supabase.from("event_expenses").insert({
    workspace_id: workspaceId,
    event_id: eventId,
    supplier_id: supplierId,
    description: description.slice(0, 500),
    category: str(formData.get("category")) ?? "miscellaneous",
    amount_cents: amountCents,
    currency: str(formData.get("currency")) ?? "GBP",
    expense_date: str(formData.get("expense_date")),
    due_date: str(formData.get("due_date")),
    bill_number: str(formData.get("bill_number")),
    status: "pending",
    approval_status: "pending_review",
    payment_status: "unpaid",
    owner_id: user.id,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(LIST_PATH);
}

async function loadBill(
  billId: string,
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data } = await supabase
    .from("event_expenses")
    .select("id, approval_status, payment_status, amount_cents, paid_cents, currency")
    .eq("id", billId)
    .eq("workspace_id", workspaceId)
    .not("supplier_id", "is", null)
    .maybeSingle();
  return data;
}

/** Approve a supplier bill for payment. Manager roles only (owner/admin/manager). */
export async function approveSupplierBill(billId: string) {
  const { workspaceId } = await requireWorkspace();
  if (!(await canManageWorkspace())) {
    throw new Error("You do not have permission to approve supplier bills");
  }
  const supabase = await createClient();

  const bill = await loadBill(billId, workspaceId, supabase);
  if (!bill) throw new Error("Bill not found");
  if (bill.approval_status === "approved") return;

  const { error } = await supabase
    .from("event_expenses")
    .update({ approval_status: "approved", updated_at: new Date().toISOString() })
    .eq("id", billId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(LIST_PATH);
}

/** Reject a supplier bill. Manager roles only (owner/admin/manager). */
export async function rejectSupplierBill(billId: string) {
  const { workspaceId } = await requireWorkspace();
  if (!(await canManageWorkspace())) {
    throw new Error("You do not have permission to reject supplier bills");
  }
  const supabase = await createClient();

  const bill = await loadBill(billId, workspaceId, supabase);
  if (!bill) throw new Error("Bill not found");
  if (bill.approval_status === "rejected") return;

  const { error } = await supabase
    .from("event_expenses")
    .update({ approval_status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", billId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(LIST_PATH);
}

/**
 * Batch Pay — a real action, not a stub. It creates one `supplier_payment_batches`
 * header row for the selected bills, inserts a matching `event_expense_payments`
 * ledger row per bill (so "Paid This Month" / "Average Payment Time" reporting
 * picks the run up immediately), and moves each bill's `payment_status` to
 * `"processing"`.
 *
 * Deliberately NOT marked `"paid"` here: this codebase has no connected bank/
 * payment-rail integration to confirm real-world settlement of a bank transfer,
 * so a batch is recorded as an initiated payment run. Reconciling a batch to
 * `"paid"` once funds have actually left the account is a manual follow-up —
 * see /release-gated/user-fixes/finance/supplier-payments.md.
 *
 * Only bills that are `approval_status = "approved"` AND `payment_status =
 * "unpaid"` are eligible; anything else passed in is silently skipped, and the
 * whole call fails if nothing was eligible.
 */
export async function batchPaySupplierBills(billIds: string[]) {
  const { workspaceId, user } = await requireWorkspace();
  if (!(await canManageWorkspace())) {
    throw new Error("You do not have permission to run supplier payments");
  }
  const supabase = await createClient();

  const ids = [...new Set(billIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) throw new Error("Select at least one bill to pay");

  const { data: bills, error: fetchError } = await supabase
    .from("event_expenses")
    .select("id, amount_cents, paid_cents, currency, approval_status, payment_status, bill_number, description, supplier_id")
    .eq("workspace_id", workspaceId)
    .not("supplier_id", "is", null)
    .in("id", ids);
  if (fetchError) throw new Error(fetchError.message);

  const eligible = (bills ?? []).filter(
    (b) => b.approval_status === "approved" && b.payment_status === "unpaid"
  );
  if (eligible.length === 0) {
    throw new Error("None of the selected bills are approved and unpaid");
  }

  const currency = eligible[0].currency || "GBP";
  const totalCents = eligible.reduce((sum, b) => sum + (b.amount_cents - b.paid_cents), 0);
  const reference = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  const { data: batch, error: batchError } = await supabase
    .from("supplier_payment_batches")
    .insert({
      workspace_id: workspaceId,
      reference,
      total_cents: totalCents,
      currency,
      status: "processing",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (batchError || !batch) throw new Error(batchError?.message ?? "Failed to create payment batch");

  const paidAt = new Date().toISOString();
  const paymentRows = eligible.map((b) => ({
    workspace_id: workspaceId,
    expense_id: b.id,
    amount_cents: b.amount_cents - b.paid_cents,
    currency: b.currency || "GBP",
    method: "batch",
    batch_id: batch.id,
    paid_at: paidAt,
    created_by: user.id,
  }));

  const { error: paymentError } = await supabase.from("event_expense_payments").insert(paymentRows);
  if (paymentError) {
    // Roll back the batch header so we don't leave an orphaned batch with no payments.
    await supabase.from("supplier_payment_batches").delete().eq("id", batch.id).eq("workspace_id", workspaceId);
    throw new Error(paymentError.message);
  }

  // Generate a real remittance advice document for this batch and store it on
  // every payment row created above (soft-fails — a missing/failed document
  // must never undo the payment batch that's already been recorded).
  const { data: supplierRows } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .in("id", [...new Set(eligible.map((b) => b.supplier_id).filter((id): id is string => !!id))]);
  const supplierNames = new Map((supplierRows ?? []).map((s) => [s.id, s.name ?? "Unknown supplier"]));

  const remittanceHtml = generateRemittanceHtml({
    batchReference: reference,
    paidAt,
    currency,
    lines: eligible.map((b) => ({
      billNumber: b.bill_number ?? b.id.slice(0, 8),
      supplierName: b.supplier_id ? (supplierNames.get(b.supplier_id) ?? "Unknown supplier") : "Unknown supplier",
      description: b.description ?? "",
      amountCents: b.amount_cents - b.paid_cents,
    })),
  });

  const remittanceKey = await safeGenerateAndUpload({
    workspaceId,
    kind: "supplier-remittance",
    recordId: batch.id,
    filename: `remittance-${reference}.html`,
    contentType: "text/html",
    body: remittanceHtml,
  });

  if (remittanceKey) {
    await supabase
      .from("event_expense_payments")
      .update({ remittance_storage_key: remittanceKey })
      .eq("batch_id", batch.id)
      .eq("workspace_id", workspaceId);
  }

  const { error: updateError } = await supabase
    .from("event_expenses")
    .update({ payment_status: "processing", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in(
      "id",
      eligible.map((b) => b.id)
    );
  if (updateError) throw new Error(updateError.message);

  revalidatePath(LIST_PATH);
  return { batchId: batch.id, reference, totalCents, currency, billCount: eligible.length };
}

/** Signed, time-limited download link for a batch's generated remittance
 *  advice. Returns null if no document was stored (R2 not configured when
 *  the batch was created) rather than throwing. */
export async function getRemittanceDownloadUrl(batchId: string): Promise<string | null> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("event_expense_payments")
    .select("remittance_storage_key")
    .eq("batch_id", batchId)
    .eq("workspace_id", workspaceId)
    .not("remittance_storage_key", "is", null)
    .limit(1)
    .maybeSingle();

  if (!payment?.remittance_storage_key) return null;
  return r2PresignedGet({ key: payment.remittance_storage_key });
}
