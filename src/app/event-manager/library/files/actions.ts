"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { LibraryKind } from "../library-utils";

const LIST_PATH = "/event-manager/library/files";

/** Insert the `library_assets` row once the browser has already uploaded the
 *  file directly to R2 via a presigned PUT (see /api/r2/presign). Only
 *  metadata + the R2 object key are ever written to Postgres — the file
 *  itself never passes through the Supabase DB as a blob. */
export async function finalizeLibraryUpload(input: {
  title: string;
  kind: LibraryKind;
  mime: string;
  sizeBytes: number;
  storagePath: string;
  eventId?: string | null;
  tags?: string[];
}) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  if (!input.title.trim()) throw new Error("A file title is required");
  if (!input.storagePath.startsWith(`${workspaceId}/`)) {
    throw new Error("Invalid storage path for this workspace");
  }

  const { data: settings } = await supabase
    .from("library_settings")
    .select("default_visibility")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { error } = await supabase.from("library_assets").insert({
    workspace_id: workspaceId,
    title: input.title.trim(),
    kind: input.kind,
    mime: input.mime,
    size_bytes: input.sizeBytes,
    storage_path: input.storagePath,
    owner_user_id: user.id,
    entity_type: input.eventId ? "event" : null,
    entity_id: input.eventId ?? null,
    tags: input.tags ?? [],
    visibility: settings?.default_visibility ?? "workspace",
  });

  if (error) throw new Error(error.message);

  revalidatePath(LIST_PATH);
}

async function assertOwnedAsset(assetId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("library_assets")
    .select("id, storage_path")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!asset) throw new Error("File not found or access denied");
  return { workspaceId, user, supabase, asset };
}

/** Toggle the pinned/favourite state (used as the star icon on file cards/rows). */
export async function toggleFavourite(assetId: string, nextPinned: boolean) {
  const { workspaceId, supabase } = await assertOwnedAsset(assetId);

  const { error } = await supabase
    .from("library_assets")
    .update({ pinned_at: nextPinned ? new Date().toISOString() : null })
    .eq("id", assetId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath(LIST_PATH);
}

/** Soft-delete (archive) one or more files. */
export async function archiveAssets(assetIds: string[]) {
  if (assetIds.length === 0) return;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("library_assets")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", assetIds)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath(LIST_PATH);
}

/** Create (or reuse an existing active) view-only external share link for a file. */
export async function createShareLink(assetId: string): Promise<{ token: string }> {
  const { workspaceId, user, supabase } = await assertOwnedAsset(assetId);

  const { data: existing } = await supabase
    .from("library_share_links")
    .select("token")
    .eq("asset_id", assetId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { token: existing.token };

  const token = randomBytes(24).toString("base64url");

  const { error } = await supabase.from("library_share_links").insert({
    asset_id: assetId,
    token,
    scope: "view",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  await supabase
    .from("library_assets")
    .update({ visibility: "link" })
    .eq("id", assetId)
    .eq("workspace_id", workspaceId);

  revalidatePath(LIST_PATH);
  return { token };
}

/** Create a folder — modelled as a "custom" library_collection, the closest
 *  existing kind to a free-form folder in the current schema. */
export async function createFolder(name: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required");

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    || `folder-${Date.now()}`;

  const { error } = await supabase.from("library_collections").insert({
    workspace_id: workspaceId,
    name: trimmed,
    slug: `${slug}-${Date.now().toString(36)}`,
    kind: "custom",
    created_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(LIST_PATH);
}
