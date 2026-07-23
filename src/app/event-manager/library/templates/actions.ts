"use server";

// Server actions for the Templates screen of the Files & Asset Library.
// All mutations are scoped to the caller's active workspace (requireWorkspace()),
// re-verify ownership before writing, and revalidate the templates routes so the
// server-rendered list/detail pages reflect changes immediately.
//
// Storage: templates reuse the existing "event-files" Supabase Storage bucket
// (the same bucket already used by event documents/mood-board/expenses) under a
// `templates/{workspaceId}/...` prefix, rather than adding a new bucket or a new
// R2 presign "kind" — this keeps the change scoped to files under this directory.

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { LibraryKind } from "../library-utils";

export const TEMPLATE_BUCKET = "event-files";

export const TEMPLATE_KINDS: LibraryKind[] = [
  "template",
  "menu",
  "poster",
  "flyer",
  "signage",
  "presentation",
  "invoice_template",
];

export const TEMPLATE_CATEGORIES = [
  "Flyers",
  "Menus",
  "Posters",
  "Decks",
  "Signage",
  "Schedules",
  "Social",
  "Guest Packs",
  "Documents",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

const CATEGORY_TO_KIND: Record<TemplateCategory, LibraryKind> = {
  Flyers: "flyer",
  Menus: "menu",
  Posters: "poster",
  Decks: "presentation",
  Signage: "signage",
  Schedules: "template",
  Social: "template",
  "Guest Packs": "template",
  Documents: "invoice_template",
};

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
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function assertTemplate(templateId: string) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("library_assets")
    .select("*")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  return { ok: Boolean(asset), asset, workspaceId, user, supabase };
}

function revalidateAll(templateId?: string) {
  revalidatePath("/event-manager/library/templates");
  if (templateId) revalidatePath(`/event-manager/library/templates/${templateId}`);
}

/** Create a from-scratch text/merge-field template (no uploaded file). */
export async function createTemplateFromScratch(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  if (!title) throw new Error("Template name is required");

  const category = str(formData.get("category")) as TemplateCategory | null;
  const eventType = str(formData.get("eventType"));
  const description = str(formData.get("description"));
  const content = String(formData.get("content") ?? "");
  const variables = str(formData.get("variables"));
  const variableList = variables
    ? variables.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const kind: LibraryKind = category && CATEGORY_TO_KIND[category] ? CATEGORY_TO_KIND[category] : "template";

  const metadata: Json = {
    category: category ?? "Documents",
    event_type: eventType ?? null,
    variables: variableList,
    status: "draft",
    content,
  };

  const { data, error } = await supabase
    .from("library_assets")
    .insert({
      workspace_id: workspaceId,
      kind,
      title,
      description,
      mime: "text/plain",
      size_bytes: new TextEncoder().encode(content).length,
      storage_path: null,
      owner_user_id: user.id,
      visibility: "workspace",
      tags: category ? [category] : [],
      metadata,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidateAll();
  return { id: data.id };
}

/** Upload a design file (PDF/DOCX/PPTX/PNG/etc.) and create a template row for it. */
export async function uploadTemplateFile(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Please choose a file to upload");
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) throw new Error("Unsupported file type");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 50 MB limit");

  const title = str(formData.get("title")) ?? file.name.replace(/\.[^.]+$/, "");
  const category = str(formData.get("category")) as TemplateCategory | null;
  const eventType = str(formData.get("eventType"));
  const description = str(formData.get("description"));

  const kind: LibraryKind = category && CATEGORY_TO_KIND[category] ? CATEGORY_TO_KIND[category] : "template";
  const storageKey = `templates/${workspaceId}/${Date.now()}-${safeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(storageKey, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) throw new Error(`Upload failed — ${uploadError.message}`);

  const metadata: Json = {
    category: category ?? "Documents",
    event_type: eventType ?? null,
    variables: [],
    status: "draft",
  };

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
      owner_user_id: user.id,
      visibility: "workspace",
      tags: category ? [category] : [],
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from(TEMPLATE_BUCKET).remove([storageKey]);
    throw new Error(error.message);
  }

  revalidateAll();
  return { id: data.id };
}

/** Update a template's editable metadata (title, description, category, event type, variables, status, tags). */
export async function updateTemplateMetadata(templateId: string, formData: FormData) {
  const { ok, asset, supabase } = await assertTemplate(templateId);
  if (!ok || !asset) throw new Error("Template not found");

  const title = str(formData.get("title"));
  if (!title) throw new Error("Template name is required");

  const category = str(formData.get("category"));
  const eventType = str(formData.get("eventType"));
  const description = str(formData.get("description"));
  const status = str(formData.get("status")) ?? "approved";
  const variables = str(formData.get("variables"));
  const variableList = variables ? variables.split(",").map((v) => v.trim()).filter(Boolean) : [];
  const content = formData.has("content") ? String(formData.get("content") ?? "") : undefined;

  const existingMeta = (asset.metadata ?? {}) as Record<string, Json>;
  const existingCategory = typeof existingMeta.category === "string" ? existingMeta.category : "Documents";
  const metadata: Json = {
    ...existingMeta,
    category: category ?? existingCategory,
    event_type: eventType ?? null,
    variables: variableList,
    status,
    ...(content !== undefined ? { content } : {}),
  };

  const { error } = await supabase
    .from("library_assets")
    .update({ title, description, metadata })
    .eq("id", templateId);

  if (error) throw new Error(error.message);
  revalidateAll(templateId);
}

/** Duplicate a template as a new draft copy (same file/content, workspace-scoped). */
export async function duplicateTemplate(templateId: string) {
  const { ok, asset, workspaceId, user, supabase } = await assertTemplate(templateId);
  if (!ok || !asset) throw new Error("Template not found");

  const existingMeta = (asset.metadata ?? {}) as Record<string, Json>;
  const { data, error } = await supabase
    .from("library_assets")
    .insert({
      workspace_id: workspaceId,
      kind: asset.kind,
      title: `${asset.title} (Copy)`,
      description: asset.description,
      mime: asset.mime,
      size_bytes: asset.size_bytes,
      storage_path: asset.storage_path,
      cover_storage_path: asset.cover_storage_path,
      owner_user_id: user.id,
      visibility: asset.visibility,
      tags: asset.tags,
      metadata: { ...existingMeta, status: "draft", duplicated_from: templateId },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidateAll();
  return { id: data.id };
}

/** Soft-delete (archive) a template. */
export async function archiveTemplate(templateId: string) {
  const { ok, supabase } = await assertTemplate(templateId);
  if (!ok) throw new Error("Template not found");

  const { error } = await supabase
    .from("library_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId);

  if (error) throw new Error(error.message);
  revalidateAll(templateId);
}

/** Toggle the lock state ("Brand Template" / official, cannot be edited by non-admins). */
export async function toggleTemplateLock(templateId: string) {
  const { ok, asset, user, supabase } = await assertTemplate(templateId);
  if (!ok || !asset) throw new Error("Template not found");

  const nextLocked = !asset.locked_at;
  const { error } = await supabase
    .from("library_assets")
    .update({
      locked_at: nextLocked ? new Date().toISOString() : null,
      locked_by_user_id: nextLocked ? user.id : null,
    })
    .eq("id", templateId);

  if (error) throw new Error(error.message);
  revalidateAll(templateId);
}

/** Toggle "favourite" for the current user (modelled via metadata.favourited_by since
 *  there is no dedicated favourites table/column on library_assets). */
export async function toggleTemplateFavourite(templateId: string) {
  const { ok, asset, user, supabase } = await assertTemplate(templateId);
  if (!ok || !asset) throw new Error("Template not found");

  const existingMeta = (asset.metadata ?? {}) as Record<string, Json>;
  const favouritedBy = Array.isArray(existingMeta.favourited_by)
    ? (existingMeta.favourited_by as string[])
    : [];
  const next = favouritedBy.includes(user.id)
    ? favouritedBy.filter((id) => id !== user.id)
    : [...favouritedBy, user.id];

  const { error } = await supabase
    .from("library_assets")
    .update({ metadata: { ...existingMeta, favourited_by: next } })
    .eq("id", templateId);

  if (error) throw new Error(error.message);
  revalidateAll(templateId);
}

/**
 * "Use Template" — create a real output asset scoped to a target event, referencing
 * the original template's file, and record usage against the original template
 * (use_count / last_used_at) so "Times used" and "Top templates" reflect real activity.
 */
export async function useTemplate(
  templateId: string,
  opts: { eventId: string; outputName: string }
) {
  const { ok, asset, workspaceId, user, supabase } = await assertTemplate(templateId);
  if (!ok || !asset) throw new Error("Template not found");

  const { eventId, outputName } = opts;
  if (!eventId) throw new Error("Please choose a target event");

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) throw new Error("Event not found or access denied");

  const existingMeta = (asset.metadata ?? {}) as Record<string, Json>;

  const { data: created, error: insertError } = await supabase
    .from("library_assets")
    .insert({
      workspace_id: workspaceId,
      kind: asset.kind,
      title: outputName || `${asset.title} — Event Copy`,
      description: asset.description,
      mime: asset.mime,
      size_bytes: asset.size_bytes,
      storage_path: asset.storage_path,
      cover_storage_path: asset.cover_storage_path,
      entity_type: "event",
      entity_id: eventId,
      owner_user_id: user.id,
      visibility: asset.visibility,
      tags: asset.tags,
      metadata: { ...existingMeta, source_template_id: templateId, status: "draft" },
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  await supabase
    .from("library_assets")
    .update({ use_count: (asset.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", templateId);

  revalidateAll(templateId);
  return { id: created.id };
}
