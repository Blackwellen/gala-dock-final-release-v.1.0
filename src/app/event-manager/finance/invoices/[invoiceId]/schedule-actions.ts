"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for invoice payment schedules.
 *
 * Money is stored in `invoice_payment_schedules.amount_cents` (bigint). All UI
 * input is in GBP major units and converted to integer cents here. RLS is on,
 * and every query also constrains by `workspace_id` for defence-in-depth.
 */

export interface ScheduleInstallmentInput {
  label: string;
  /** GBP major units (e.g. 2706.00). Converted to cents on insert. */
  amount: number;
  /** Optional percentage of invoice total (e.g. 33.33). */
  percentage?: number | null;
  /** yyyy-mm-dd */
  dueDate: string;
}

/**
 * Bulk-inserts a payment schedule for an invoice. The UI always submits the
 * complete set of milestones (initial setup OR a full rebuild), so any existing
 * rows are cleared first to avoid duplicates. Sort order is sequential.
 */
export async function createSchedule(
  invoiceId: string,
  installments: ScheduleInstallmentInput[]
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Verify the invoice belongs to this workspace before writing children.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const clean = installments
    .filter((i) => i.label.trim().length > 0 && i.dueDate)
    .map((i, index) => ({
      workspace_id: workspaceId,
      invoice_id: invoiceId,
      label: i.label.trim(),
      amount_cents: Math.round((i.amount ?? 0) * 100),
      percentage:
        i.percentage === null || i.percentage === undefined
          ? null
          : i.percentage,
      due_date: i.dueDate,
      status: "pending",
      sort_order: index,
    }));

  if (clean.length === 0) {
    throw new Error("Add at least one payment milestone");
  }

  // Replace any existing schedule (UI submits the full set on setup/rebuild).
  await supabase
    .from("invoice_payment_schedules")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId);

  const { error } = await supabase
    .from("invoice_payment_schedules")
    .insert(clean);

  if (error) {
    throw new Error(error.message || "Failed to create payment schedule");
  }

  revalidatePath(`/event-manager/finance/invoices/${invoiceId}`);
}

/** Marks a single schedule item paid (or back to pending). */
export async function markScheduleItemPaid(
  invoiceId: string,
  scheduleItemId: string,
  paid: boolean
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoice_payment_schedules")
    .update({
      status: paid ? "paid" : "pending",
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId)
    .eq("id", scheduleItemId);

  if (error) {
    throw new Error(error.message || "Failed to update payment milestone");
  }

  revalidatePath(`/event-manager/finance/invoices/${invoiceId}`);
}

/** Deletes the entire schedule for an invoice (all rows). */
export async function deleteSchedule(invoiceId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoice_payment_schedules")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId);

  if (error) {
    throw new Error(error.message || "Failed to delete payment schedule");
  }

  revalidatePath(`/event-manager/finance/invoices/${invoiceId}`);
}

/** Deletes a single schedule milestone. */
export async function deleteScheduleItem(
  invoiceId: string,
  scheduleItemId: string
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoice_payment_schedules")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId)
    .eq("id", scheduleItemId);

  if (error) {
    throw new Error(error.message || "Failed to delete milestone");
  }

  revalidatePath(`/event-manager/finance/invoices/${invoiceId}`);
}
