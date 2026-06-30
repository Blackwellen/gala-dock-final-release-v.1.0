"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

// ── helpers ──────────────────────────────────────────────────────────────────

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(str(value));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parse a "£" major-unit amount into integer cents (pence). */
function poundsToCents(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").replace(/[£,\s]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** Verify the supplier belongs to the active workspace; throws if not. */
async function assertSupplier(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  supplierId: string
) {
  const { data } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Supplier not found");
}

const detailPath = (id: string) => `/event-manager/suppliers/manage/${id}`;

// ── Rate cards ─────────────────────────────────────────────────────────────────

export async function addRateCard(supplierId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await assertSupplier(supabase, workspaceId, supplierId);

  const itemName = str(formData.get("item_name"));
  if (!itemName) throw new Error("Item name is required");

  const { error } = await supabase.from("supplier_rate_cards").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    item_name: itemName,
    unit: str(formData.get("unit")),
    unit_price_cents: poundsToCents(formData.get("unit_price")),
    currency: str(formData.get("currency")) ?? "GBP",
    notes: str(formData.get("notes")),
    sort_order: intOrNull(formData.get("sort_order")) ?? 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

export async function updateRateCard(
  supplierId: string,
  rateCardId: string,
  formData: FormData
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const itemName = str(formData.get("item_name"));
  if (!itemName) throw new Error("Item name is required");

  const { error } = await supabase
    .from("supplier_rate_cards")
    .update({
      item_name: itemName,
      unit: str(formData.get("unit")),
      unit_price_cents: poundsToCents(formData.get("unit_price")),
      currency: str(formData.get("currency")) ?? "GBP",
      notes: str(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rateCardId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

export async function deleteRateCard(supplierId: string, rateCardId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("supplier_rate_cards")
    .delete()
    .eq("id", rateCardId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

// ── Availability (blocked dates) ───────────────────────────────────────────────

export async function addBlockedDate(supplierId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await assertSupplier(supabase, workspaceId, supplierId);

  const blockedDate = str(formData.get("blocked_date"));
  if (!blockedDate) throw new Error("Please choose a date to block");

  const { error } = await supabase.from("supplier_blocked_dates").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    blocked_date: blockedDate,
    reason: str(formData.get("reason")),
  });
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

export async function deleteBlockedDate(supplierId: string, blockedDateId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("supplier_blocked_dates")
    .delete()
    .eq("id", blockedDateId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

// ── Ratings ────────────────────────────────────────────────────────────────────

export async function addRating(supplierId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await assertSupplier(supabase, workspaceId, supplierId);

  const ratingRaw = Number(formData.get("rating"));
  const rating = Number.isFinite(ratingRaw)
    ? Math.min(5, Math.max(1, Math.round(ratingRaw)))
    : 0;
  if (rating < 1) throw new Error("Please choose a rating from 1 to 5");

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

  const { error } = await supabase.from("supplier_ratings").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    event_id: eventId,
    rating,
    review: str(formData.get("review")),
    rated_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

export async function deleteRating(supplierId: string, ratingId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("supplier_ratings")
    .delete()
    .eq("id", ratingId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

// ── Contracts (upload-only file → supplier-files bucket) ────────────────────────

export async function addContract(supplierId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await assertSupplier(supabase, workspaceId, supplierId);

  const title = str(formData.get("title"));
  if (!title) throw new Error("Contract title is required");

  let storageKey: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    storageKey = `${workspaceId}/${supplierId}/contracts/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("supplier-files")
      .upload(storageKey, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
  }

  const eventId = str(formData.get("event_id"));
  if (eventId) {
    const { data: ev } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!ev) {
      if (storageKey) await supabase.storage.from("supplier-files").remove([storageKey]);
      throw new Error("Linked event not found");
    }
  }

  const { error } = await supabase.from("supplier_contracts").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    event_id: eventId,
    title,
    status: str(formData.get("status")) ?? "draft",
    storage_key: storageKey,
    value_cents:
      str(formData.get("value")) !== null ? poundsToCents(formData.get("value")) : null,
    signed_at: str(formData.get("signed_at")),
    expires_at: str(formData.get("expires_at")),
    created_by: user.id,
  });
  if (error) {
    if (storageKey) await supabase.storage.from("supplier-files").remove([storageKey]);
    throw new Error(error.message);
  }

  revalidatePath(detailPath(supplierId));
}

export async function deleteContract(supplierId: string, contractId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from("supplier_contracts")
    .select("id, storage_key")
    .eq("id", contractId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!contract) throw new Error("Contract not found");

  if (contract.storage_key) {
    await supabase.storage.from("supplier-files").remove([contract.storage_key]);
  }
  const { error } = await supabase
    .from("supplier_contracts")
    .delete()
    .eq("id", contractId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(detailPath(supplierId));
}

/** Return a short-lived signed URL for downloading a contract file. */
export async function getContractUrl(
  supplierId: string,
  contractId: string
): Promise<string> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from("supplier_contracts")
    .select("storage_key")
    .eq("id", contractId)
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!contract?.storage_key) throw new Error("Contract has no file");

  const { data, error } = await supabase.storage
    .from("supplier-files")
    .createSignedUrl(contract.storage_key, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create download link");
  }
  return data.signedUrl;
}
