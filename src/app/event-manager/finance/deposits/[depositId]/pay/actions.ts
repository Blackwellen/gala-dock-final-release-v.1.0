"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { safeGenerateAndUpload, generateDepositReceiptHtml } from "../../../_lib/documents";
import { r2PresignedGet } from "@/lib/storage/r2";

export interface RecordDepositPaymentInput {
  depositId: string;
  amountMajor: number; // major units, e.g. 500.00
  method: string;
}

/**
 * Records a partial or final payment against a deposit: inserts a ledger row
 * into `event_deposit_payments`, bumps `event_deposits.paid_cents`, flips the
 * deposit's `status` to `partial`/`paid`, and generates a real receipt
 * document (HTML) stored in R2 — soft-fails on the document (a missing R2
 * config must never block the payment itself from being recorded).
 */
export interface RecordDepositPaymentResult {
  paymentId: string;
  newStatus: string;
  balanceRemainingCents: number;
}

export async function recordDepositPayment(input: RecordDepositPaymentInput): Promise<RecordDepositPaymentResult> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  if (!Number.isFinite(input.amountMajor) || input.amountMajor <= 0) {
    throw new Error("Enter a payment amount greater than zero.");
  }
  const amountCents = Math.round(input.amountMajor * 100);

  const { data: deposit, error: depositError } = await supabase
    .from("event_deposits")
    .select("id, event_id, label, amount_cents, paid_cents, currency")
    .eq("id", input.depositId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (depositError || !deposit) throw new Error("Deposit not found");

  const balance = deposit.amount_cents - deposit.paid_cents;
  if (amountCents > balance) {
    throw new Error(`Payment (${(amountCents / 100).toFixed(2)}) exceeds the remaining balance (${(balance / 100).toFixed(2)}).`);
  }

  const paidAt = new Date().toISOString();
  const { data: paymentRow, error: paymentError } = await supabase
    .from("event_deposit_payments")
    .insert({
      workspace_id: workspaceId,
      deposit_id: input.depositId,
      amount_cents: amountCents,
      currency: deposit.currency,
      method: input.method || null,
      paid_at: paidAt,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (paymentError || !paymentRow) throw new Error(paymentError?.message ?? "Failed to record payment");

  const newPaidCents = deposit.paid_cents + amountCents;
  const newBalance = deposit.amount_cents - newPaidCents;
  const newStatus = newBalance <= 0 ? "paid" : "partial";

  const { error: updateError } = await supabase
    .from("event_deposits")
    .update({ paid_cents: newPaidCents, status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", input.depositId)
    .eq("workspace_id", workspaceId);
  if (updateError) throw new Error(updateError.message);

  const { data: eventRow } = await supabase.from("events").select("name").eq("id", deposit.event_id).maybeSingle();

  const receiptHtml = generateDepositReceiptHtml({
    depositLabel: deposit.label,
    eventName: eventRow?.name ?? "Unknown event",
    amountCents,
    currency: deposit.currency,
    method: input.method || null,
    paidAt,
    balanceRemainingCents: Math.max(0, newBalance),
  });

  const receiptKey = await safeGenerateAndUpload({
    workspaceId,
    kind: "deposit-receipt",
    recordId: paymentRow.id,
    filename: `deposit-receipt-${paymentRow.id.slice(0, 8)}.html`,
    contentType: "text/html",
    body: receiptHtml,
  });

  if (receiptKey) {
    await supabase
      .from("event_deposit_payments")
      .update({ receipt_storage_key: receiptKey })
      .eq("id", paymentRow.id)
      .eq("workspace_id", workspaceId);
  }

  revalidatePath("/event-manager/finance/deposits");

  return {
    paymentId: paymentRow.id,
    newStatus,
    balanceRemainingCents: Math.max(0, newBalance),
  };
}

/** Signed, time-limited download link for a deposit payment's generated receipt. */
export async function getDepositReceiptDownloadUrl(paymentId: string): Promise<string | null> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("event_deposit_payments")
    .select("receipt_storage_key")
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!payment?.receipt_storage_key) return null;
  return r2PresignedGet({ key: payment.receipt_storage_key });
}
