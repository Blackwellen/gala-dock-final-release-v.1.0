"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace, canManageWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesUpdate } from "@/lib/supabase/types";
import type { RiskLevel, SupplierDocMetadata } from "./types";

const BASE_PATH = "/event-manager/library/supplier-docs";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Load a library_assets row scoped to the caller's workspace, or null. Guards every mutation below against cross-workspace tampering via direct action calls. */
async function loadWorkspaceScopedAsset(assetId: string, workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("library_assets")
    .select("id, metadata, workspace_id")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

/** Verify a supplier document. Gated to workspace managers (owner/admin/manager) — the same role gate used for Workspace/Billing settings elsewhere in this codebase. */
export async function verifyDocument(assetId: string): Promise<ActionResult> {
  const { workspaceId, user } = await requireWorkspace();
  if (!(await canManageWorkspace())) return { ok: false, error: "You do not have permission to verify documents." };

  const asset = await loadWorkspaceScopedAsset(assetId, workspaceId);
  if (!asset) return { ok: false, error: "Document not found." };

  const supabase = await createClient();
  const nextMetadata: SupplierDocMetadata = {
    ...(asset.metadata as SupplierDocMetadata | null),
    verificationStatus: "verified",
    verifiedBy: user.id,
    verifiedAt: new Date().toISOString(),
    rejectedBy: undefined,
    rejectedAt: undefined,
    rejectionReason: undefined,
  };
  const { error } = await supabase
    .from("library_assets")
    .update({ metadata: nextMetadata as Json, updated_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE_PATH);
  return { ok: true };
}

/** Reject a supplier document. Gated to workspace managers. */
export async function rejectDocument(assetId: string, reason: string): Promise<ActionResult> {
  const { workspaceId, user } = await requireWorkspace();
  if (!(await canManageWorkspace())) return { ok: false, error: "You do not have permission to reject documents." };

  const asset = await loadWorkspaceScopedAsset(assetId, workspaceId);
  if (!asset) return { ok: false, error: "Document not found." };

  const supabase = await createClient();
  const nextMetadata: SupplierDocMetadata = {
    ...(asset.metadata as SupplierDocMetadata | null),
    verificationStatus: "rejected",
    rejectedBy: user.id,
    rejectedAt: new Date().toISOString(),
    rejectionReason: reason || "No reason provided",
  };
  const { error } = await supabase
    .from("library_assets")
    .update({ metadata: nextMetadata as Json, updated_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE_PATH);
  return { ok: true };
}

/**
 * "Request Documents" — writes a real row to `supplier_compliance_outreach`
 * (added by 20260711_supplier_rfq_depth.sql, already the table the Suppliers
 * section reads for its chaser/outreach tracking). Actual email/notification
 * delivery is out of scope for this pass — no SMTP/notification helper for
 * this table exists yet; the row itself is real and drives the Suppliers
 * section's outreach-status column already.
 */
export async function requestSupplierDocument(input: {
  supplierId: string;
  documentType: string;
  note?: string;
}): Promise<ActionResult> {
  const { workspaceId, user } = await requireWorkspace();
  if (!input.supplierId || !input.documentType.trim()) return { ok: false, error: "Supplier and document type are required." };

  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", input.supplierId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!supplier) return { ok: false, error: "Supplier not found in this workspace." };

  const { error } = await supabase.from("supplier_compliance_outreach").insert({
    workspace_id: workspaceId,
    supplier_id: input.supplierId,
    document_type: input.documentType.trim(),
    status: "request_sent",
    channel: "internal",
    sent_at: new Date().toISOString(),
    note: input.note?.trim() || null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE_PATH);
  return { ok: true };
}

/** Insert the library_assets row once the file has already been uploaded to R2 via the presign flow. */
export async function createSupplierDocument(input: {
  title: string;
  kind: "contract" | "rider" | "menu" | "invoice_template" | "document" | "image";
  storagePath: string;
  mime: string | null;
  sizeBytes: number;
  supplierId: string | null;
  documentType: string;
  category: string;
  expiryDate: string | null;
  riskLevel: RiskLevel | null;
  relatedEventId: string | null;
  visibility: "workspace" | "restricted" | "link";
}): Promise<ActionResult> {
  const { workspaceId, user } = await requireWorkspace();
  if (!input.title.trim() || !input.storagePath) return { ok: false, error: "Title and file are required." };

  const supabase = await createClient();
  const metadata: SupplierDocMetadata = {
    documentType: input.documentType.trim() || undefined,
    category: input.category.trim() || undefined,
    expiryDate: input.expiryDate || null,
    relatedEventId: input.relatedEventId || null,
    riskLevel: input.riskLevel ?? undefined,
    verificationStatus: "pending_review",
  };

  const { error } = await supabase.from("library_assets").insert({
    workspace_id: workspaceId,
    kind: input.kind,
    title: input.title.trim(),
    storage_path: input.storagePath,
    mime: input.mime,
    size_bytes: input.sizeBytes,
    entity_type: input.supplierId ? "supplier" : null,
    entity_id: input.supplierId,
    owner_user_id: user.id,
    visibility: input.visibility,
    metadata: metadata as Json,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE_PATH);
  return { ok: true };
}

/** Edit document metadata (type/category/expiry/risk/linked supplier/linked event) after upload. */
export async function updateDocumentMetadata(
  assetId: string,
  patch: {
    title?: string;
    documentType?: string;
    category?: string;
    expiryDate?: string | null;
    riskLevel?: RiskLevel | null;
    relatedEventId?: string | null;
    supplierId?: string | null;
  }
): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  const asset = await loadWorkspaceScopedAsset(assetId, workspaceId);
  if (!asset) return { ok: false, error: "Document not found." };

  const supabase = await createClient();
  const nextMetadata: SupplierDocMetadata = { ...(asset.metadata as SupplierDocMetadata | null) };
  if (patch.documentType !== undefined) nextMetadata.documentType = patch.documentType.trim() || undefined;
  if (patch.category !== undefined) nextMetadata.category = patch.category.trim() || undefined;
  if (patch.expiryDate !== undefined) nextMetadata.expiryDate = patch.expiryDate;
  if (patch.riskLevel !== undefined) nextMetadata.riskLevel = patch.riskLevel ?? undefined;
  if (patch.relatedEventId !== undefined) nextMetadata.relatedEventId = patch.relatedEventId;

  const update: TablesUpdate<"library_assets"> = { metadata: nextMetadata as Json, updated_at: new Date().toISOString() };
  if (patch.title !== undefined && patch.title.trim()) update.title = patch.title.trim();
  if (patch.supplierId !== undefined) {
    update.entity_type = patch.supplierId ? "supplier" : null;
    update.entity_id = patch.supplierId;
  }

  const { error } = await supabase.from("library_assets").update(update).eq("id", assetId).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE_PATH);
  return { ok: true };
}

/** Soft-delete (archive) a supplier document. */
export async function archiveDocument(assetId: string): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  const asset = await loadWorkspaceScopedAsset(assetId, workspaceId);
  if (!asset) return { ok: false, error: "Document not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE_PATH);
  return { ok: true };
}

/** Get a short-lived signed download/preview URL for a private R2 object key. */
export async function getSupplierDocumentDownloadUrl(assetId: string): Promise<{ url: string } | { error: string }> {
  const { workspaceId } = await requireWorkspace();
  const asset = await loadWorkspaceScopedAsset(assetId, workspaceId);
  if (!asset) return { error: "Document not found." };

  const supabase = await createClient();
  const { data: full } = await supabase
    .from("library_assets")
    .select("storage_path")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!full?.storage_path) return { error: "This document has no stored file." };

  const { r2Configured, r2PresignedGet } = await import("@/lib/storage/r2");
  if (!r2Configured()) return { error: "Storage is not configured." };
  try {
    const url = await r2PresignedGet({ key: full.storage_path });
    return { url };
  } catch {
    return { error: "Could not generate a download link." };
  }
}
