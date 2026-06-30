"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "text/plain",
  "text/csv",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const CATEGORIES = [
  "contract",
  "proposal",
  "invoice",
  "media",
  "floor_plan",
  "brief",
  "report",
  "other",
] as const;

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function detectFileType(name: string, contentType: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = contentType.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext) || mime.startsWith("image/")) return "image";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["mp4", "mov", "avi", "webm"].includes(ext) || mime.startsWith("video/")) return "video";
  if (["doc", "docx"].includes(ext) || mime.includes("word")) return "doc";
  if (["xls", "xlsx"].includes(ext) || mime.includes("excel") || mime.includes("spreadsheet")) return "spreadsheet";
  if (ext === "csv" || mime === "text/csv") return "csv";
  return "other";
}

/** Verify the event belongs to the current workspace. */
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

/**
 * Upload one or more documents/media files for an event.
 *
 * - Files are uploaded server-side to the "event-files" Supabase storage bucket.
 * - Only the storage_path is stored in event_documents — never a public URL.
 * - Credentials never leave the server.
 */
export async function uploadDocuments(eventId: string, formData: FormData) {
  const { ok, workspaceId, user, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found or access denied");

  const category = str(formData.get("category")) ?? "other";
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    throw new Error("Invalid category");
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) throw new Error("Please select at least one file");
  if (files.length > 10) throw new Error("Maximum 10 files per upload");

  const userProfile = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const uploaderName = userProfile.data?.display_name ?? user.email ?? "Team member";

  const errors: string[] = [];

  for (const file of files) {
    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push(`${file.name}: unsupported file type`);
      continue;
    }
    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: exceeds 50 MB limit`);
      continue;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `events/${workspaceId}/${eventId}/documents/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("event-files")
      .upload(storageKey, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      errors.push(`${file.name}: upload failed — ${uploadError.message}`);
      continue;
    }

    const { error: insertError } = await supabase.from("event_files").insert({
      workspace_id: workspaceId,
      event_id: eventId,
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      tags: [category],
      size_bytes: file.size,
      storage_key: storageKey,
      uploaded_by: user.id,
      caption: uploaderName,
    });

    if (insertError) {
      // Best-effort storage cleanup on DB failure
      await supabase.storage.from("event-files").remove([storageKey]);
      errors.push(`${file.name}: could not save record — ${insertError.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  revalidatePath(`/event-manager/events/${eventId}/documents-media`);
}

/** Delete a document (removes storage object and DB record). */
export async function deleteDocument(eventId: string, documentId: string) {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found or access denied");

  const { data: doc } = await supabase
    .from("event_files")
    .select("id, storage_key")
    .eq("id", documentId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!doc) throw new Error("Document not found");

  // Remove from storage first (best-effort)
  if (doc.storage_key) {
    await supabase.storage.from("event-files").remove([doc.storage_key]);
  }

  // Hard-delete the DB record (event_files has no deleted_at column)
  const { error } = await supabase
    .from("event_files")
    .delete()
    .eq("id", documentId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/documents-media`);
}

/** Generate a signed download URL for a private document (60 minute expiry). */
export async function getDownloadUrl(eventId: string, documentId: string): Promise<string> {
  const { ok, workspaceId, supabase } = await assertEvent(eventId);
  if (!ok) throw new Error("Event not found or access denied");

  const { data: doc } = await supabase
    .from("event_files")
    .select("storage_key")
    .eq("id", documentId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!doc?.storage_key) throw new Error("Document not found");

  const { data, error } = await supabase.storage
    .from("event-files")
    .createSignedUrl(doc.storage_key, 3600); // 1 hour

  if (error || !data?.signedUrl) throw new Error("Could not generate download link");

  return data.signedUrl;
}
