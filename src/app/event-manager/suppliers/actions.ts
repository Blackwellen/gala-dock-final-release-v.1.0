"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace, getWorkspaceRole } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { SupplierStatus } from "@/lib/supabase/types";
import { isValidArchiveReason, isValidPauseReason } from "./_data/reasons";

const VALID_STATUSES: SupplierStatus[] = [
  "active",
  "paused",
  "archived",
  "suspended_by_admin",
];

function coerceStatus(raw: FormDataEntryValue | null): SupplierStatus {
  const value = String(raw ?? "active");
  return (VALID_STATUSES as string[]).includes(value)
    ? (value as SupplierStatus)
    : "active";
}

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function rating(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.round(n)) : null;
}

/**
 * Create a new supplier (and optional primary contact) scoped to the active
 * workspace, then redirect to the new supplier's detail page.
 */
export async function createSupplier(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Supplier name is required");

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name,
      status: coerceStatus(formData.get("status")),
      category_id: str(formData.get("category_id")),
      website: str(formData.get("website")),
      primary_email: str(formData.get("primary_email")),
      primary_phone: str(formData.get("primary_phone")),
      notes: str(formData.get("notes")),
      rating_internal: rating(formData.get("rating_internal")),
    })
    .select("id")
    .single();

  if (error || !supplier) {
    throw new Error(error?.message ?? "Failed to create supplier");
  }

  // Optionally create a primary contact when contact details were provided.
  const contactName = str(formData.get("contact_name"));
  const contactEmail = str(formData.get("contact_email"));
  const contactPhone = str(formData.get("contact_phone"));
  if (contactName || contactEmail || contactPhone) {
    await supabase.from("supplier_contacts").insert({
      workspace_id: workspaceId,
      supplier_id: supplier.id,
      name: contactName ?? name,
      email: contactEmail,
      phone: contactPhone,
      role: str(formData.get("contact_role")),
      is_primary: true,
    });
  }

  revalidatePath("/event-manager/suppliers");
  redirect(`/event-manager/suppliers/${supplier.id}`);
}

/**
 * Update an existing supplier scoped to the active workspace, then redirect
 * back to its detail page.
 */
export async function updateSupplier(supplierId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Supplier name is required");

  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
      status: coerceStatus(formData.get("status")),
      category_id: str(formData.get("category_id")),
      website: str(formData.get("website")),
      primary_email: str(formData.get("primary_email")),
      primary_phone: str(formData.get("primary_phone")),
      notes: str(formData.get("notes")),
      rating_internal: rating(formData.get("rating_internal")),
    })
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/suppliers");
  revalidatePath(`/event-manager/suppliers/${supplierId}`);
  redirect(`/event-manager/suppliers/${supplierId}`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Phase 3 — lifecycle mutations (pause/reactivate, archive/restore, star,
 * document-chase outreach). Every mutation is workspace + role scoped and
 * writes a `supplier_activity` audit row. RLS on the underlying tables
 * (owner/admin/manager for insert/update — see
 * 20260711_supplier_rfq_depth.sql) is the backstop; the role check below
 * exists so the UI gets a friendly error instead of a raw RLS rejection.
 * ────────────────────────────────────────────────────────────────────── */

type ActionResult = { error?: string; message?: string };

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

async function requireManager() {
  const ctx = await requireWorkspace();
  const role = await getWorkspaceRole();
  if (!role || !MANAGER_ROLES.has(role)) {
    throw new Error("You need owner, admin or manager access to manage suppliers.");
  }
  return ctx;
}

async function logSupplierActivity(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  supplierId: string,
  actorId: string,
  action: string,
  subject: Record<string, unknown>
) {
  // Best-effort — a failed audit write should not roll back a mutation that
  // already succeeded, but it is surfaced in server logs for diagnosis.
  const { error } = await supabase.from("supplier_activity").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    actor_id: actorId,
    action,
    subject: subject as Json,
  });
  if (error) console.error("[supplier_activity] failed to log", action, error.message);
}

async function findLifecycleSupplier(supabase: SupabaseClient<Database>, workspaceId: string, supplierId: string) {
  const { data } = await supabase
    .from("suppliers")
    .select("id, status, category_id, tier")
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function revalidateSuppliers(supplierId?: string) {
  revalidatePath("/event-manager/suppliers");
  if (supplierId) revalidatePath(`/event-manager/suppliers/${supplierId}`);
}

/* ─── Pause / reactivate ─────────────────────────────────────────────── */

export async function pauseSupplier(
  supplierId: string,
  reason: string,
  reasonDetail: string,
  note: string
): Promise<ActionResult> {
  if (!isValidPauseReason(reason)) return { error: "Please choose a valid pause reason." };

  const { workspaceId, user } = await requireManager();
  const supabase = await createClient();

  const supplier = await findLifecycleSupplier(supabase, workspaceId, supplierId);
  if (!supplier) return { error: "Supplier not found." };
  if (supplier.status === "paused") return { error: "This supplier is already paused." };

  const { error: insertError } = await supabase.from("supplier_pauses").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    reason,
    reason_detail: reasonDetail.trim() || null,
    note: note.trim() || null,
    paused_by: user.id,
  });
  if (insertError) return { error: insertError.message };

  const { error: updateError } = await supabase
    .from("suppliers")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId);
  if (updateError) return { error: updateError.message };

  await logSupplierActivity(supabase, workspaceId, supplierId, user.id, "paused", { reason, reasonDetail });
  revalidateSuppliers(supplierId);
  return {};
}

export async function reactivateSupplier(supplierId: string, note: string): Promise<ActionResult> {
  const { workspaceId, user } = await requireManager();
  const supabase = await createClient();

  const supplier = await findLifecycleSupplier(supabase, workspaceId, supplierId);
  if (!supplier) return { error: "Supplier not found." };

  const { data: openPause } = await supabase
    .from("supplier_pauses")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .is("reactivated_at", null)
    .maybeSingle();
  if (!openPause) return { error: "No active pause found for this supplier." };

  const { error: pauseError } = await supabase
    .from("supplier_pauses")
    .update({
      reactivated_at: new Date().toISOString(),
      reactivated_by: user.id,
      reactivation_note: note.trim() || null,
    })
    .eq("id", openPause.id);
  if (pauseError) return { error: pauseError.message };

  const { error: updateError } = await supabase
    .from("suppliers")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId);
  if (updateError) return { error: updateError.message };

  await logSupplierActivity(supabase, workspaceId, supplierId, user.id, "reactivated", { note });
  revalidateSuppliers(supplierId);
  return {};
}

/* ─── Archive / restore ──────────────────────────────────────────────── */

export async function archiveSupplier(
  supplierId: string,
  reason: string,
  reasonDetail: string,
  canBeRestored: boolean,
  retentionYears: number
): Promise<ActionResult> {
  if (!isValidArchiveReason(reason)) return { error: "Please choose a valid archive reason." };

  const { workspaceId, user } = await requireManager();
  const supabase = await createClient();

  const supplier = await findLifecycleSupplier(supabase, workspaceId, supplierId);
  if (!supplier) return { error: "Supplier not found." };
  if (supplier.status === "archived") return { error: "This supplier is already archived." };

  const years = Number.isFinite(retentionYears) && retentionYears > 0 ? retentionYears : 6;
  const retentionUntil = new Date();
  retentionUntil.setUTCFullYear(retentionUntil.getUTCFullYear() + years);

  const { error: insertError } = await supabase.from("supplier_archives").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    previous_category_id: supplier.category_id,
    previous_tier: supplier.tier,
    reason,
    reason_detail: reasonDetail.trim() || null,
    archived_by: user.id,
    can_be_restored: canBeRestored,
    retention_until: retentionUntil.toISOString().slice(0, 10),
  });
  if (insertError) return { error: insertError.message };

  const { error: updateError } = await supabase
    .from("suppliers")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId);
  if (updateError) return { error: updateError.message };

  await logSupplierActivity(supabase, workspaceId, supplierId, user.id, "archived", { reason, reasonDetail });
  revalidateSuppliers(supplierId);
  return {};
}

export async function restoreSupplier(supplierId: string): Promise<ActionResult> {
  const { workspaceId, user } = await requireManager();
  const supabase = await createClient();

  const supplier = await findLifecycleSupplier(supabase, workspaceId, supplierId);
  if (!supplier) return { error: "Supplier not found." };

  const { data: openArchive } = await supabase
    .from("supplier_archives")
    .select("id, legal_hold, can_be_restored")
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .is("restored_at", null)
    .maybeSingle();
  if (!openArchive) return { error: "No archive record found for this supplier." };
  if (openArchive.legal_hold) return { error: "This supplier is under legal hold and cannot be restored." };
  if (!openArchive.can_be_restored) return { error: "This archive record is not eligible for restore." };

  const { error: archiveError } = await supabase
    .from("supplier_archives")
    .update({ restored_at: new Date().toISOString(), restored_by: user.id })
    .eq("id", openArchive.id);
  if (archiveError) return { error: archiveError.message };

  const { error: updateError } = await supabase
    .from("suppliers")
    .update({ status: "active", archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId);
  if (updateError) return { error: updateError.message };

  await logSupplierActivity(supabase, workspaceId, supplierId, user.id, "restored", {});
  revalidateSuppliers(supplierId);
  return {};
}

/* ─── Star toggle (Recently Used) ────────────────────────────────────── */

export async function toggleSupplierStar(supplierId: string): Promise<ActionResult & { starred?: boolean }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("supplier_stars")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("supplier_stars").delete().eq("id", existing.id);
    if (error) return { error: error.message };
    revalidateSuppliers(supplierId);
    return { starred: false };
  }

  const { error } = await supabase.from("supplier_stars").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    user_id: user.id,
  });
  if (error) return { error: error.message };
  revalidateSuppliers(supplierId);
  return { starred: true };
}

/* ─── Document compliance outreach ───────────────────────────────────── */

// No email-sending integration exists anywhere in this codebase (checked for
// resend/nodemailer/sendEmail — only a stubbed MCP adapter registry with no
// real send call). These actions always write a real, truthful outreach
// row, but never claim an email actually left the building.
const NO_EMAIL_NOTICE =
  "Saved — email sending is not yet configured for this environment. Contact the supplier directly to follow up.";

export async function requestSupplierDocuments(
  supplierId: string,
  documentTypes: string[]
): Promise<ActionResult & { emailSent: boolean }> {
  const types = documentTypes.map((t) => t.trim()).filter(Boolean);
  if (types.length === 0) return { error: "Select at least one document to request.", emailSent: false };

  const { workspaceId, user } = await requireManager();
  const supabase = await createClient();

  const supplier = await findLifecycleSupplier(supabase, workspaceId, supplierId);
  if (!supplier) return { error: "Supplier not found.", emailSent: false };

  const { error } = await supabase.from("supplier_compliance_outreach").insert(
    types.map((documentType) => ({
      workspace_id: workspaceId,
      supplier_id: supplierId,
      document_type: documentType,
      status: "request_sent",
      channel: "email",
      created_by: user.id,
    }))
  );
  if (error) return { error: error.message, emailSent: false };

  await logSupplierActivity(supabase, workspaceId, supplierId, user.id, "documents_requested", { documentTypes: types });
  revalidateSuppliers(supplierId);
  return { message: NO_EMAIL_NOTICE, emailSent: false };
}

/* ─── Document upload (R2) ───────────────────────────────────────────── */

/**
 * Record a supplier document that was already uploaded to R2 via a
 * presigned PUT (see `/api/r2/presign`, kind `supplier-document`). This
 * action only writes the `supplier_files` row — it never accepts a
 * client-supplied storage path outside this supplier/workspace's own
 * R2 prefix, so a forged `storagePath` cannot attach another workspace's
 * object to this supplier.
 */
export async function recordSupplierDocumentUpload(
  supplierId: string,
  documentType: string,
  storagePath: string,
  filename: string,
  mimeType: string,
  sizeBytes: number
): Promise<ActionResult> {
  const type = documentType.trim();
  if (!type) return { error: "Document type is required." };
  if (!filename.trim()) return { error: "Filename is required." };

  const { workspaceId, user } = await requireManager();
  const supabase = await createClient();

  const supplier = await findLifecycleSupplier(supabase, workspaceId, supplierId);
  if (!supplier) return { error: "Supplier not found." };

  const safeWorkspaceId = workspaceId.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!storagePath.startsWith(`${safeWorkspaceId}/`)) {
    return { error: "Invalid storage path for this workspace." };
  }

  const { error } = await supabase.from("supplier_files").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    kind: "cert",
    document_type: type,
    filename: filename.trim(),
    storage_path: storagePath,
    mime_type: mimeType || null,
    size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    review_status: "uploaded",
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };

  await logSupplierActivity(supabase, workspaceId, supplierId, user.id, "document_uploaded", { documentType: type, filename });
  revalidateSuppliers(supplierId);
  return {};
}

export async function sendDocumentReminder(
  supplierId: string,
  documentType: string
): Promise<ActionResult & { emailSent: boolean }> {
  const type = documentType.trim();
  if (!type) return { error: "No document type specified.", emailSent: false };

  const { workspaceId, user } = await requireManager();
  const supabase = await createClient();

  const supplier = await findLifecycleSupplier(supabase, workspaceId, supplierId);
  if (!supplier) return { error: "Supplier not found.", emailSent: false };

  const { error } = await supabase.from("supplier_compliance_outreach").insert({
    workspace_id: workspaceId,
    supplier_id: supplierId,
    document_type: type,
    status: "reminder_sent",
    channel: "email",
    created_by: user.id,
  });
  if (error) return { error: error.message, emailSent: false };

  await logSupplierActivity(supabase, workspaceId, supplierId, user.id, "reminder_sent", { documentType: type });
  revalidateSuppliers(supplierId);
  return { message: NO_EMAIL_NOTICE, emailSent: false };
}
