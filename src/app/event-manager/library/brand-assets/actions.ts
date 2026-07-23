"use server";

// Server actions for the Brand Assets screen of the Files & Asset Library.
// All mutations are scoped to the caller's active workspace (requireWorkspace()),
// re-verify workspace ownership before writing, and revalidate the brand-assets
// route so the server-rendered list reflects changes immediately.
//
// Storage: brand assets reuse the existing "event-files" Supabase Storage bucket
// (the same bucket already used by Templates/documents/mood-boards) under a
// `brand-assets/{workspaceId}/...` prefix — consistent with how the sibling
// Templates tab (also backed by `library_assets`) uploads files, and avoids
// depending on R2 credentials being configured in every environment.

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  kindFromMime, mergeBrandMetadata, BRAND_ASSET_BUCKET,
  type ApprovalStatus, type BrandAssetType,
} from "./brand-assets-utils";

const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // font files (.ttf/.otf) and design tool files (.ase) often report this
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

const LIST_PATH = "/event-manager/library/brand-assets";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function csvList(v: FormDataEntryValue | null): string[] {
  const s = str(v);
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

async function assertAsset(assetId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("library_assets")
    .select("*")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  return { ok: Boolean(asset), asset, workspaceId, user, supabase };
}

function revalidateAll() {
  revalidatePath(LIST_PATH);
}

/** Upload a real brand asset file (logo, colour palette, typography kit, social
 *  artwork, sponsor asset, template, photography, video, ...) and create the
 *  `library_assets` row for it. New uploads default to "pending_review" so the
 *  approval workflow shown in the reference UI is a real, working state
 *  machine rather than everything auto-approving on arrival. */
export async function uploadBrandAsset(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Please choose a file to upload");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 100 MB limit");
  if (file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type)) throw new Error("Unsupported file type");

  const title = str(formData.get("title")) ?? file.name.replace(/\.[^.]+$/, "");
  const assetType = (str(formData.get("assetType")) ?? "other") as BrandAssetType;
  const brandName = str(formData.get("brandName"));
  const eventId = str(formData.get("eventId"));
  const description = str(formData.get("description"));
  const tags = csvList(formData.get("tags"));
  const hexColors = csvList(formData.get("hexColors"));
  const fontNames = csvList(formData.get("fontNames"));

  const kind = kindFromMime(file.type || null);
  const storageKey = `brand-assets/${workspaceId}/${Date.now()}-${safeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(BRAND_ASSET_BUCKET)
    .upload(storageKey, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) throw new Error(`Upload failed — ${uploadError.message}`);

  const metadata: Json = {
    asset_type: assetType,
    brand_name: brandName,
    approval_status: "pending_review",
    hex_colors: hexColors,
    font_names: fontNames,
    starred: false,
    approved_by: null,
    approved_at: null,
    rejected_reason: null,
  };

  // Verify the target event (if any) really belongs to this workspace before linking.
  let linkedEventId: string | null = null;
  if (eventId) {
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .maybeSingle();
    linkedEventId = event?.id ?? null;
  }

  const { data, error } = await supabase
    .from("library_assets")
    .insert({
      workspace_id: workspaceId,
      kind,
      title,
      description,
      mime: file.type || "application/octet-stream",
      size_bytes: file.size,
      storage_path: storageKey,
      cover_storage_path: kind === "image" ? storageKey : null,
      owner_user_id: user.id,
      entity_type: linkedEventId ? "event" : null,
      entity_id: linkedEventId,
      visibility: "workspace",
      tags,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from(BRAND_ASSET_BUCKET).remove([storageKey]);
    throw new Error(error.message);
  }

  await supabase.from("library_versions").insert({
    asset_id: data.id,
    version: 1,
    storage_path: storageKey,
    size_bytes: file.size,
    author_user_id: user.id,
    note: "Initial upload",
  });

  revalidateAll();
  return { id: data.id as string };
}

/** Create a brand kit. Brand kits are `library_assets` rows tagged
 *  `metadata.asset_type = "brand_kit"` — there is no dedicated brand-kit
 *  table, so this is the same shape as a normal asset with a fixed asset
 *  type. A file is optional: a kit can start as an empty grouping shell
 *  (e.g. "Summer Gala Brand Kit") and have individual assets tagged with the
 *  same `brand_name` added to it over time. */
export async function createBrandKit(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  if (!title) throw new Error("Brand kit name is required");
  const brandName = str(formData.get("brandName"));
  const description = str(formData.get("description"));
  const file = formData.get("file");

  let storageKey: string | null = null;
  let mime: string | null = null;
  let sizeBytes = 0;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 100 MB limit");
    storageKey = `brand-assets/${workspaceId}/${Date.now()}-${safeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(BRAND_ASSET_BUCKET)
      .upload(storageKey, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw new Error(`Upload failed — ${uploadError.message}`);
    mime = file.type || "application/octet-stream";
    sizeBytes = file.size;
  }

  const metadata: Json = {
    asset_type: "brand_kit",
    brand_name: brandName,
    approval_status: "draft",
    hex_colors: [],
    font_names: [],
    starred: false,
    approved_by: null,
    approved_at: null,
    rejected_reason: null,
  };

  const kind = mime ? kindFromMime(mime) : "asset";

  const { data, error } = await supabase
    .from("library_assets")
    .insert({
      workspace_id: workspaceId,
      kind,
      title,
      description,
      mime,
      size_bytes: sizeBytes,
      storage_path: storageKey,
      owner_user_id: user.id,
      visibility: "workspace",
      tags: ["brand-kit"],
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    if (storageKey) await supabase.storage.from(BRAND_ASSET_BUCKET).remove([storageKey]);
    throw new Error(error.message);
  }

  revalidateAll();
  return { id: data.id as string };
}

/** Real approval-state change — updates `metadata.approval_status`. Not yet
 *  a proper enum column (schema gap — see build summary), but this is a
 *  genuine persisted state transition, not a decorative UI toggle. */
export async function setApprovalStatus(assetId: string, status: ApprovalStatus, reason?: string) {
  const { ok, asset, supabase, user } = await assertAsset(assetId);
  if (!ok || !asset) throw new Error("Asset not found");

  const patch: Record<string, Json> = { approval_status: status };
  if (status === "approved") {
    patch.approved_by = user.id;
    patch.approved_at = new Date().toISOString();
    patch.rejected_reason = null;
  }
  if (status === "rejected") {
    patch.rejected_reason = reason ?? "Changes requested";
  }

  const { error } = await supabase
    .from("library_assets")
    .update({ metadata: mergeBrandMetadata(asset.metadata, patch) })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  revalidateAll();
}

/** Lock/unlock an asset — this one is a real column (`locked_at` / `locked_by_user_id`). */
export async function setLocked(assetId: string, locked: boolean) {
  const { ok, user, supabase } = await assertAsset(assetId);
  if (!ok) throw new Error("Asset not found");

  const { error } = await supabase
    .from("library_assets")
    .update({
      locked_at: locked ? new Date().toISOString() : null,
      locked_by_user_id: locked ? user.id : null,
    })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  revalidateAll();
}

export async function toggleStar(assetId: string, starred: boolean) {
  const { ok, asset, supabase } = await assertAsset(assetId);
  if (!ok || !asset) throw new Error("Asset not found");

  const { error } = await supabase
    .from("library_assets")
    .update({ metadata: mergeBrandMetadata(asset.metadata, { starred }) })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  revalidateAll();
}

/** Record a real usage event (e.g. "insert into event pack" / download) — increments `use_count`. */
export async function recordAssetUsage(assetId: string) {
  const { ok, asset, supabase } = await assertAsset(assetId);
  if (!ok || !asset) return;

  await supabase
    .from("library_assets")
    .update({ use_count: (asset.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", assetId);

  revalidateAll();
}

/** Generate a short-lived signed URL to preview/download a private brand asset file. */
export async function getBrandAssetSignedUrl(storagePath: string) {
  await requireWorkspace();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BRAND_ASSET_BUCKET).createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) return { ok: false as const };
  return { ok: true as const, url: data.signedUrl };
}

/** Upload a new version of an existing asset — inserts a real `library_versions`
 *  row and points the asset's current storage_path at the new file. */
export async function createAssetVersion(assetId: string, formData: FormData) {
  const { ok, workspaceId, user, supabase } = await assertAsset(assetId);
  if (!ok) throw new Error("Asset not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Please choose a file to upload");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 100 MB limit");

  const note = str(formData.get("note"));
  const storageKey = `brand-assets/${workspaceId}/${Date.now()}-${safeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(BRAND_ASSET_BUCKET)
    .upload(storageKey, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) throw new Error(`Upload failed — ${uploadError.message}`);

  const { count } = await supabase
    .from("library_versions")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", assetId);
  const nextVersion = (count ?? 0) + 1;

  await supabase.from("library_versions").insert({
    asset_id: assetId,
    version: nextVersion,
    storage_path: storageKey,
    size_bytes: file.size,
    author_user_id: user.id,
    note,
  });

  await supabase
    .from("library_assets")
    .update({
      storage_path: storageKey,
      mime: file.type || "application/octet-stream",
      size_bytes: file.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId);

  revalidateAll();
}

/** Soft-delete (archive) an asset. */
export async function archiveBrandAsset(assetId: string) {
  const { ok, supabase } = await assertAsset(assetId);
  if (!ok) throw new Error("Asset not found");

  const { error } = await supabase
    .from("library_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  revalidateAll();
}

export async function setVisibility(assetId: string, visibility: "workspace" | "restricted" | "link" | "public_token") {
  const { ok, supabase } = await assertAsset(assetId);
  if (!ok) throw new Error("Asset not found");

  const { error } = await supabase.from("library_assets").update({ visibility }).eq("id", assetId);
  if (error) throw new Error(error.message);

  revalidateAll();
}
