"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for event expense tracking.
 *
 * Schema notes (verified against database.types.ts — these differ from the plan):
 *  - `event_expenses`: (id, workspace_id, event_id, category (nullable text),
 *    description, amount_cents, expense_date (nullable date), supplier_id,
 *    receipt_storage_key, status (text, default 'recorded'), created_by, ...).
 *    NO paid_by_name / reimbursed / notes columns. Money is *_cents.
 *  - There is NO `event_budgets` table; budget context comes from
 *    `event_budget_lines` (category, quantity, unit_cost_cents) when present.
 */

export const EXPENSE_CATEGORIES = [
  "venue-hire",
  "catering",
  "av-tech",
  "photography",
  "floristry",
  "entertainment",
  "staffing",
  "transport",
  "stationery",
  "accommodation",
  "insurance",
  "licences",
  "miscellaneous",
] as const;

const EXPENSE_STATUSES = ["recorded", "approved", "reimbursed"] as const;

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

function coerceCategory(raw: FormDataEntryValue | null): string {
  const v = String(raw ?? "miscellaneous");
  return (EXPENSE_CATEGORIES as readonly string[]).includes(v) ? v : "miscellaneous";
}

function coerceStatus(raw: FormDataEntryValue | null): string {
  const v = String(raw ?? "recorded");
  return (EXPENSE_STATUSES as readonly string[]).includes(v) ? v : "recorded";
}

async function assertEvent(eventId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  return { ok: Boolean(event), workspaceId, user, supabase };
}

/** Upload a receipt (upload-only) to the event-files bucket. Returns its key. */
async function uploadReceipt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  eventId: string,
  formData: FormData
): Promise<string | null> {
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `expenses/${workspaceId}/${eventId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from("event-files")
    .upload(storageKey, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw new Error(`Receipt upload failed: ${error.message}`);
  return storageKey;
}

/** Create an expense for an event. */
export async function createExpense(eventId: string, formData: FormData) {
  const { ok, workspaceId, user, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const description = str(formData.get("description"));
  if (!description) throw new Error("A description is required");

  const receiptKey = await uploadReceipt(supabase, workspaceId, eventId, formData);

  const { error } = await supabase.from("event_expenses").insert({
    workspace_id: workspaceId,
    event_id: eventId,
    category: coerceCategory(formData.get("category")),
    description: description.slice(0, 500),
    amount_cents: poundsToCents(formData.get("amount")),
    expense_date: str(formData.get("expense_date")),
    supplier_id: str(formData.get("supplier_id")),
    receipt_storage_key: receiptKey,
    status: coerceStatus(formData.get("status")),
    created_by: user.id,
  });
  if (error) {
    if (receiptKey) await supabase.storage.from("event-files").remove([receiptKey]);
    throw new Error(error.message);
  }

  revalidatePath(`/events/${eventId}/expenses`);
}

/** Update an existing expense. Optionally replaces the receipt. */
export async function updateExpense(
  eventId: string,
  expenseId: string,
  formData: FormData
) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const description = str(formData.get("description"));
  if (!description) throw new Error("A description is required");

  // Load existing to know the old receipt key.
  const { data: existing } = await supabase
    .from("event_expenses")
    .select("id, receipt_storage_key")
    .eq("id", expenseId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!existing) throw new Error("Expense not found");

  const newReceiptKey = await uploadReceipt(supabase, workspaceId, eventId, formData);

  const update: {
    category: string;
    description: string;
    amount_cents: number;
    expense_date: string | null;
    supplier_id: string | null;
    status: string;
    updated_at: string;
    receipt_storage_key?: string;
  } = {
    category: coerceCategory(formData.get("category")),
    description: description.slice(0, 500),
    amount_cents: poundsToCents(formData.get("amount")),
    expense_date: str(formData.get("expense_date")),
    supplier_id: str(formData.get("supplier_id")),
    status: coerceStatus(formData.get("status")),
    updated_at: new Date().toISOString(),
  };
  if (newReceiptKey) update.receipt_storage_key = newReceiptKey;

  const { error } = await supabase
    .from("event_expenses")
    .update(update)
    .eq("id", expenseId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);
  if (error) {
    if (newReceiptKey) await supabase.storage.from("event-files").remove([newReceiptKey]);
    throw new Error(error.message);
  }

  // Clean up the replaced receipt object after a successful update.
  if (newReceiptKey && existing.receipt_storage_key) {
    await supabase.storage.from("event-files").remove([existing.receipt_storage_key]);
  }

  revalidatePath(`/events/${eventId}/expenses`);
}

/** Delete an expense and its receipt object. */
export async function deleteExpense(eventId: string, expenseId: string) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found");

  const { data: row } = await supabase
    .from("event_expenses")
    .select("id, receipt_storage_key")
    .eq("id", expenseId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!row) throw new Error("Expense not found");

  if (row.receipt_storage_key) {
    await supabase.storage.from("event-files").remove([row.receipt_storage_key]);
  }

  const { error } = await supabase
    .from("event_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}/expenses`);
}

/** Return a short-lived signed URL for a receipt. */
export async function getReceiptUrl(
  eventId: string,
  expenseId: string
): Promise<string> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("event_expenses")
    .select("receipt_storage_key")
    .eq("id", expenseId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!row?.receipt_storage_key) throw new Error("No receipt for this expense");

  const { data, error } = await supabase.storage
    .from("event-files")
    .createSignedUrl(row.receipt_storage_key, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create receipt link");
  }
  return data.signedUrl;
}
