"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

// ── helpers ──────────────────────────────────────────────────────────────────

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function int(value: FormDataEntryValue | null): number | null {
  const n = Number(str(value));
  return Number.isFinite(n) ? Math.round(n) : null;
}

const VALID_VENUE_STATUS = ["preferred", "active", "inactive", "archived"];
function coerceStatus(raw: FormDataEntryValue | null): string {
  const v = String(raw ?? "active");
  return VALID_VENUE_STATUS.includes(v) ? v : "active";
}

const VALID_DOC_TYPE = [
  "hire-agreement",
  "floorplan",
  "health-safety",
  "insurance",
  "capacity-certificate",
  "site-map",
  "other",
];
function coerceDocType(raw: FormDataEntryValue | null): string {
  const v = String(raw ?? "other");
  return VALID_DOC_TYPE.includes(v) ? v : "other";
}

function docStatusFromExpiry(expiry: string | null): string {
  if (!expiry) return "active";
  const t = new Date(expiry).getTime();
  if (Number.isNaN(t)) return "active";
  const now = Date.now();
  if (t < now) return "expired";
  if (t <= now + 1000 * 60 * 60 * 24 * 30) return "expiring-soon";
  return "active";
}

// ── Venue create / update ─────────────────────────────────────────────────────

/**
 * Create a venue scoped to the active workspace, then redirect to its detail
 * page. Uses the REAL venues schema (single `capacity`, address parts, contact
 * email/phone, website, notes, status). The plan's hire-fee / day+evening
 * capacity / setup columns do not exist on this table and are intentionally
 * omitted.
 */
export async function createVenue(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Venue name is required");

  const { data: venue, error } = await supabase
    .from("venues")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name,
      status: coerceStatus(formData.get("status")),
      website: str(formData.get("website")),
      address_line1: str(formData.get("address_line1")),
      address_line2: str(formData.get("address_line2")),
      city: str(formData.get("city")),
      region: str(formData.get("region")),
      postal_code: str(formData.get("postal_code")),
      capacity: int(formData.get("capacity")),
      contact_email: str(formData.get("contact_email")),
      contact_phone: str(formData.get("contact_phone")),
      notes: str(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error || !venue) {
    throw new Error(error?.message ?? "Failed to create venue");
  }

  revalidatePath("/venues");
  redirect(`/venues/${venue.id}`);
}

/** Update an existing venue scoped to the active workspace. */
export async function updateVenue(venueId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Venue name is required");

  const { error } = await supabase
    .from("venues")
    .update({
      name,
      status: coerceStatus(formData.get("status")),
      website: str(formData.get("website")),
      address_line1: str(formData.get("address_line1")),
      address_line2: str(formData.get("address_line2")),
      city: str(formData.get("city")),
      region: str(formData.get("region")),
      postal_code: str(formData.get("postal_code")),
      capacity: int(formData.get("capacity")),
      contact_email: str(formData.get("contact_email")),
      contact_phone: str(formData.get("contact_phone")),
      notes: str(formData.get("notes")),
    })
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  revalidatePath("/venues");
  revalidatePath(`/venues/${venueId}`);
  redirect(`/venues/${venueId}`);
}

/** Soft-delete (archive) a venue. */
export async function archiveVenue(venueId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venues")
    .update({ status: "archived" })
    .eq("id", venueId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/venues");
  revalidatePath(`/venues/${venueId}`);
}

// ── Venue documents (upload-only) ──────────────────────────────────────────────

/**
 * Upload a venue document to Supabase Storage and record it in venue_documents.
 * Upload-only: the file comes from a hidden <input type="file"> — never a URL.
 */
export async function uploadVenueDocument(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  // Confirm the venue belongs to this workspace before touching storage.
  const { data: venue } = await supabase
    .from("venues")
    .select("id")
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!venue) throw new Error("Venue not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose a file to upload");
  }

  const docType = coerceDocType(formData.get("doc_type"));
  const expiry = str(formData.get("expiry_date"));
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `${workspaceId}/${venueId}/${docType}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("venue-files")
    .upload(storageKey, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { error: insertError } = await supabase.from("venue_documents").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    doc_type: docType,
    filename: file.name,
    storage_key: storageKey,
    file_size_bytes: file.size,
    expiry_date: expiry,
    status: docStatusFromExpiry(expiry),
    uploaded_by: user.id,
  });
  if (insertError) {
    // Best-effort cleanup of the orphaned object.
    await supabase.storage.from("venue-files").remove([storageKey]);
    throw new Error(insertError.message);
  }

  revalidatePath(`/venues/${venueId}`);
}

/** Delete a venue document (removes the storage object and the row). */
export async function deleteVenueDocument(venueId: string, documentId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("venue_documents")
    .select("id, storage_key")
    .eq("id", documentId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!doc) throw new Error("Document not found");

  await supabase.storage.from("venue-files").remove([doc.storage_key]);
  const { error } = await supabase
    .from("venue_documents")
    .delete()
    .eq("id", documentId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venues/${venueId}`);
}

/** Return a short-lived signed URL for downloading a venue document. */
export async function getVenueDocumentUrl(
  venueId: string,
  documentId: string
): Promise<string> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("venue_documents")
    .select("storage_key")
    .eq("id", documentId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!doc) throw new Error("Document not found");

  const { data, error } = await supabase.storage
    .from("venue-files")
    .createSignedUrl(doc.storage_key, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create download link");
  }
  return data.signedUrl;
}

// ── Venue notes ────────────────────────────────────────────────────────────────

/** Add a note to a venue. */
export async function addVenueNote(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const body = str(formData.get("body"));
  if (!body) throw new Error("Note cannot be empty");

  const { data: venue } = await supabase
    .from("venues")
    .select("id")
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!venue) throw new Error("Venue not found");

  const { error } = await supabase.from("venue_notes").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    body,
    is_pinned: formData.get("is_pinned") === "on",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/venues/${venueId}`);
}

/** Toggle the pinned state of a venue note. */
export async function toggleVenueNotePin(
  venueId: string,
  noteId: string,
  pinned: boolean
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venue_notes")
    .update({ is_pinned: pinned })
    .eq("id", noteId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venues/${venueId}`);
}

/** Delete a venue note. */
export async function deleteVenueNote(venueId: string, noteId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venue_notes")
    .delete()
    .eq("id", noteId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venues/${venueId}`);
}
