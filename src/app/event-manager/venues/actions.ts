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

// Matches the DB's venues_status_chk constraint exactly. "preferred" is NOT a
// status — it's the separate `is_preferred` boolean (see setVenuePreferred).
// The old code offered "preferred" as a status option here and in the
// create/edit forms, which the DB check constraint has always rejected.
const VALID_VENUE_STATUS = ["active", "archived", "merged"];
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
      is_preferred: formData.get("is_preferred") === "on",
      preferred_since: formData.get("is_preferred") === "on" ? new Date().toISOString().slice(0, 10) : null,
      preferred_by: formData.get("is_preferred") === "on" ? user.id : null,
    })
    .select("id")
    .single();

  if (error || !venue) {
    throw new Error(error?.message ?? "Failed to create venue");
  }

  revalidatePath("/event-manager/venues");
  redirect(`/event-manager/venues/${venue.id}`);
}

/** Update an existing venue scoped to the active workspace. */
export async function updateVenue(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Venue name is required");

  const isPreferred = formData.get("is_preferred") === "on";

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
      is_preferred: isPreferred,
      preferred_since: isPreferred ? new Date().toISOString().slice(0, 10) : null,
      preferred_by: isPreferred ? user.id : null,
    })
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/venues");
  revalidatePath(`/event-manager/venues/${venueId}`);
  redirect(`/event-manager/venues/${venueId}`);
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

  revalidatePath("/event-manager/venues");
  revalidatePath(`/event-manager/venues/${venueId}`);
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

  revalidatePath(`/event-manager/venues/${venueId}`);
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

  revalidatePath(`/event-manager/venues/${venueId}`);
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
    note_type: str(formData.get("note_type")) ?? "general",
    is_pinned: formData.get("is_pinned") === "on",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  await logVenueActivity(workspaceId, venueId, {
    activityType: "note_added",
    title: "Note added",
    description: body.slice(0, 140),
    actorId: user.id,
  });

  revalidatePath(`/event-manager/venues/${venueId}/notes`);
  revalidatePath(`/event-manager/venues/${venueId}/activity`);
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

  revalidatePath(`/event-manager/venues/${venueId}`);
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

  revalidatePath(`/event-manager/venues/${venueId}/notes`);
}

// ── Activity log ─────────────────────────────────────────────────────────────

/** Insert a venue_activity_log row. Best-effort — never throws to the caller. */
export async function logVenueActivity(
  workspaceId: string,
  venueId: string,
  entry: {
    activityType: string;
    title: string;
    description?: string | null;
    actorId?: string | null;
    outcome?: string | null;
    isInternal?: boolean;
  }
) {
  try {
    const supabase = await createClient();
    await supabase.from("venue_activity_log").insert({
      workspace_id: workspaceId,
      venue_id: venueId,
      activity_type: entry.activityType,
      title: entry.title,
      description: entry.description ?? null,
      actor_id: entry.actorId ?? null,
      outcome: entry.outcome ?? null,
      is_internal: entry.isInternal ?? true,
      source: "app",
    });
  } catch (err) {
    console.error("[venues] logVenueActivity failed:", err);
  }
}

// ── Preferred status ─────────────────────────────────────────────────────────

/** Mark or unmark a venue as preferred for this workspace, with an optional reason. */
export async function setVenuePreferred(
  venueId: string,
  preferred: boolean,
  reason?: string | null
) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venues")
    .update({
      is_preferred: preferred,
      preferred_since: preferred ? new Date().toISOString().slice(0, 10) : null,
      preferred_reason: preferred ? (reason ?? null) : null,
      preferred_by: preferred ? user.id : null,
    })
    .eq("id", venueId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  await logVenueActivity(workspaceId, venueId, {
    activityType: "preferred_status_changed",
    title: preferred ? "Marked as preferred" : "Removed from preferred",
    actorId: user.id,
  });

  revalidatePath("/event-manager/venues");
  revalidatePath(`/event-manager/venues/${venueId}`);
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function addVenueContact(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Contact name is required");

  const isPrimary = formData.get("is_primary") === "on";
  if (isPrimary) {
    await supabase
      .from("venue_contacts")
      .update({ is_primary: false })
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId);
  }

  const { error } = await supabase.from("venue_contacts").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    name,
    role: str(formData.get("role")),
    email: str(formData.get("email")),
    phone: str(formData.get("phone")),
    is_primary: isPrimary,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/venues/${venueId}/overview`);
}

// ── Spaces & media ───────────────────────────────────────────────────────────

export async function addVenueSpace(venueId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Space name is required");

  const { error } = await supabase.from("venue_spaces").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    name,
    space_type: str(formData.get("space_type")),
    capacity_seated: int(formData.get("capacity_seated")),
    capacity_standing: int(formData.get("capacity_standing")),
    dimensions: str(formData.get("dimensions")),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/venues/${venueId}/gallery-spaces`);
}

/** Record a venue_media row after the file has already been PUT to R2 via the presign flow. */
export async function addVenueMedia(
  venueId: string,
  input: { r2Key: string; category: string; altText?: string; spaceId?: string | null }
) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase.from("venue_media").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    space_id: input.spaceId ?? null,
    category: input.category,
    r2_key: input.r2Key,
    alt_text: input.altText ?? null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/venues/${venueId}/gallery-spaces`);
}

// ── Commercial terms & transactions ──────────────────────────────────────────

export async function addVenueCommercialTransaction(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const transactionType = str(formData.get("transaction_type"));
  const amount = int(formData.get("amount"));
  if (!transactionType || amount === null) {
    throw new Error("Transaction type and amount are required");
  }

  const { error } = await supabase.from("venue_commercial_transactions").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    transaction_type: transactionType,
    amount_cents: Math.round(amount * 100),
    due_date: str(formData.get("due_date")),
    paid_status: str(formData.get("paid_status")) ?? "open",
    notes: str(formData.get("notes")),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  await logVenueActivity(workspaceId, venueId, {
    activityType: "commercial_transaction_recorded",
    title: `${transactionType.replace(/_/g, " ")} recorded`,
    actorId: user.id,
  });

  revalidatePath(`/event-manager/venues/${venueId}/commercials-records`);
  revalidatePath(`/event-manager/venues/${venueId}/activity`);
}

// ── Holds & room blocks ──────────────────────────────────────────────────────

export async function createVenueHold(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase.from("venue_holds").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    hold_type: str(formData.get("hold_type")) ?? "first_option",
    status: "requested",
    start_at: str(formData.get("start_at")),
    end_at: str(formData.get("end_at")),
    expiry_date: str(formData.get("expiry_date")),
    notes: str(formData.get("notes")),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  await logVenueActivity(workspaceId, venueId, {
    activityType: "hold_created",
    title: "Venue hold created",
    actorId: user.id,
  });

  revalidatePath(`/event-manager/venues/${venueId}/holds`);
  revalidatePath(`/event-manager/venues/${venueId}/activity`);
}

export async function createVenueRoomBlock(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase.from("venue_room_blocks").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    room_type: str(formData.get("room_type")),
    num_rooms: int(formData.get("num_rooms")) ?? 0,
    nightly_rate_cents: int(formData.get("nightly_rate")) ? Math.round(Number(str(formData.get("nightly_rate"))) * 100) : null,
    start_date: str(formData.get("start_date")),
    end_date: str(formData.get("end_date")),
    release_date: str(formData.get("release_date")),
    status: "requested",
    notes: str(formData.get("notes")),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  await logVenueActivity(workspaceId, venueId, {
    activityType: "room_block_created",
    title: "Room block created",
    actorId: user.id,
  });

  revalidatePath(`/event-manager/venues/${venueId}/rooms`);
  revalidatePath(`/event-manager/venues/${venueId}/activity`);
}
