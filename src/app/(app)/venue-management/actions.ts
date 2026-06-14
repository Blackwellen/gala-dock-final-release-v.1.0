"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { BOOKING_STATUSES, STAFF_ROLES } from "./lib";

// ── helpers ──────────────────────────────────────────────────────────────────

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function int(value: FormDataEntryValue | null): number | null {
  const raw = str(value);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function num(value: FormDataEntryValue | null): number | null {
  const raw = str(value);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Pounds (string) → integer cents. Returns 0 when empty/invalid. */
function poundsToCents(value: FormDataEntryValue | null): number {
  const n = num(value);
  if (n === null) return 0;
  return Math.round(n * 100);
}

/** Pounds (string) → integer cents or null when empty. */
function poundsToCentsOrNull(value: FormDataEntryValue | null): number | null {
  const raw = str(value);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Confirm a venue belongs to the active workspace (and isn't soft-deleted). */
async function assertVenue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  venueId: string
) {
  const { data } = await supabase
    .from("venues")
    .select("id")
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Venue not found");
}

/** Load a booking scoped to the workspace; throws if missing. */
async function loadBooking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  bookingId: string
) {
  const { data } = await supabase
    .from("venue_bookings")
    .select("id, venue_id, status, headcount, total_cents")
    .eq("id", bookingId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Booking not found");
  return data;
}

// ── Venue Spaces (CRUD) ────────────────────────────────────────────────────────

export async function createSpace(venueId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await assertVenue(supabase, workspaceId, venueId);

  const name = str(formData.get("name"));
  if (!name) throw new Error("Space name is required");

  const { error } = await supabase.from("venue_spaces").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    name,
    description: str(formData.get("description")),
    capacity_seated: int(formData.get("capacity_seated")),
    capacity_standing: int(formData.get("capacity_standing")),
    area_sqm: num(formData.get("area_sqm")),
    hire_fee_cents: poundsToCentsOrNull(formData.get("hire_fee")),
    sort_order: int(formData.get("sort_order")) ?? 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
}

export async function updateSpace(
  venueId: string,
  spaceId: string,
  formData: FormData
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Space name is required");

  const { error } = await supabase
    .from("venue_spaces")
    .update({
      name,
      description: str(formData.get("description")),
      capacity_seated: int(formData.get("capacity_seated")),
      capacity_standing: int(formData.get("capacity_standing")),
      area_sqm: num(formData.get("area_sqm")),
      hire_fee_cents: poundsToCentsOrNull(formData.get("hire_fee")),
      sort_order: int(formData.get("sort_order")) ?? 0,
    })
    .eq("id", spaceId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
}

export async function deleteSpace(venueId: string, spaceId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venue_spaces")
    .delete()
    .eq("id", spaceId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
}

// ── F&B Packages (CRUD) ─────────────────────────────────────────────────────────

export async function createFbPackage(venueId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await assertVenue(supabase, workspaceId, venueId);

  const name = str(formData.get("name"));
  if (!name) throw new Error("Package name is required");

  const { error } = await supabase.from("venue_fb_packages").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    name,
    description: str(formData.get("description")),
    per_head_cents: poundsToCents(formData.get("per_head")),
    min_headcount: int(formData.get("min_headcount")),
    sort_order: int(formData.get("sort_order")) ?? 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
}

export async function updateFbPackage(
  venueId: string,
  packageId: string,
  formData: FormData
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Package name is required");

  const { error } = await supabase
    .from("venue_fb_packages")
    .update({
      name,
      description: str(formData.get("description")),
      per_head_cents: poundsToCents(formData.get("per_head")),
      min_headcount: int(formData.get("min_headcount")),
      sort_order: int(formData.get("sort_order")) ?? 0,
    })
    .eq("id", packageId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
}

export async function deleteFbPackage(venueId: string, packageId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venue_fb_packages")
    .delete()
    .eq("id", packageId)
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
}

// ── Bookings (create + lifecycle) ────────────────────────────────────────────────

/** Compose an ISO timestamp from a date input + optional time input. */
function composeTimestamp(
  date: FormDataEntryValue | null,
  time: FormDataEntryValue | null
): string | null {
  const d = str(date);
  if (!d) return null;
  const t = str(time);
  const composed = new Date(`${d}T${t ?? "00:00"}:00`);
  return Number.isNaN(composed.getTime()) ? null : composed.toISOString();
}

export async function createBooking(venueId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await assertVenue(supabase, workspaceId, venueId);

  const clientName = str(formData.get("client_name"));
  if (!clientName) throw new Error("Client name is required");

  const spaceId = str(formData.get("space_id"));
  const statusRaw = String(formData.get("status") ?? "enquiry");
  const status = (BOOKING_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : "enquiry";

  const startAt = composeTimestamp(
    formData.get("start_date"),
    formData.get("start_time")
  );
  const endAt = composeTimestamp(
    formData.get("end_date") ?? formData.get("start_date"),
    formData.get("end_time")
  );

  const { data: booking, error } = await supabase
    .from("venue_bookings")
    .insert({
      workspace_id: workspaceId,
      venue_id: venueId,
      space_id: spaceId,
      client_name: clientName,
      client_email: str(formData.get("client_email")),
      status,
      start_at: startAt,
      end_at: endAt,
      headcount: int(formData.get("headcount")),
      total_cents: poundsToCents(formData.get("total")),
      notes: str(formData.get("notes")),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !booking) throw new Error(error?.message ?? "Failed to create booking");

  revalidatePath(`/venue-management/${venueId}`);
  revalidatePath("/venue-management");
  redirect(`/venue-management/bookings/${booking.id}`);
}

export async function updateBookingStatus(bookingId: string, status: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const booking = await loadBooking(supabase, workspaceId, bookingId);

  if (!(BOOKING_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Invalid booking status");
  }

  const { error } = await supabase
    .from("venue_bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/bookings/${bookingId}`);
  revalidatePath(`/venue-management/${booking.venue_id}`);
  revalidatePath("/venue-management");
}

export async function updateBookingDetails(bookingId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const booking = await loadBooking(supabase, workspaceId, bookingId);

  const clientName = str(formData.get("client_name"));
  if (!clientName) throw new Error("Client name is required");

  const startAt = composeTimestamp(
    formData.get("start_date"),
    formData.get("start_time")
  );
  const endAt = composeTimestamp(
    formData.get("end_date") ?? formData.get("start_date"),
    formData.get("end_time")
  );

  const { error } = await supabase
    .from("venue_bookings")
    .update({
      client_name: clientName,
      client_email: str(formData.get("client_email")),
      space_id: str(formData.get("space_id")),
      start_at: startAt,
      end_at: endAt,
      headcount: int(formData.get("headcount")),
      total_cents: poundsToCents(formData.get("total")),
      notes: str(formData.get("notes")),
    })
    .eq("id", bookingId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/bookings/${bookingId}`);
  revalidatePath(`/venue-management/${booking.venue_id}`);
}

export async function deleteBooking(bookingId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const booking = await loadBooking(supabase, workspaceId, bookingId);

  const { error } = await supabase
    .from("venue_bookings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${booking.venue_id}`);
  revalidatePath("/venue-management");
  redirect(`/venue-management/${booking.venue_id}`);
}

// ── Booking F&B selections ────────────────────────────────────────────────────────

export async function addFbSelection(bookingId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const booking = await loadBooking(supabase, workspaceId, bookingId);

  const packageId = str(formData.get("package_id"));
  if (!packageId) throw new Error("Choose a package");

  // Confirm package belongs to the same workspace.
  const { data: pkg } = await supabase
    .from("venue_fb_packages")
    .select("id")
    .eq("id", packageId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!pkg) throw new Error("Package not found");

  const quantity = int(formData.get("quantity"));

  const { error } = await supabase.from("venue_booking_fb_selections").insert({
    workspace_id: workspaceId,
    booking_id: bookingId,
    package_id: packageId,
    quantity: quantity && quantity > 0 ? quantity : 1,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/bookings/${bookingId}`);
  revalidatePath(`/venue-management/${booking.venue_id}`);
}

export async function removeFbSelection(bookingId: string, selectionId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venue_booking_fb_selections")
    .delete()
    .eq("id", selectionId)
    .eq("booking_id", bookingId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/bookings/${bookingId}`);
}

// ── Venue staff assignments ──────────────────────────────────────────────────────

export async function addStaffAssignment(
  venueId: string,
  formData: FormData,
  bookingId?: string
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await assertVenue(supabase, workspaceId, venueId);

  const staffName = str(formData.get("staff_name"));
  if (!staffName) throw new Error("Staff name is required");

  const roleRaw = String(formData.get("role") ?? "other");
  const role = STAFF_ROLES.includes(roleRaw) ? roleRaw : "other";

  const { error } = await supabase.from("venue_staff_assignments").insert({
    workspace_id: workspaceId,
    venue_id: venueId,
    booking_id: bookingId ?? str(formData.get("booking_id")),
    staff_name: staffName,
    role,
    shift_start: composeTimestamp(
      formData.get("shift_date"),
      formData.get("shift_start_time")
    ),
    shift_end: composeTimestamp(
      formData.get("shift_date"),
      formData.get("shift_end_time")
    ),
    notes: str(formData.get("notes")),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
  if (bookingId) revalidatePath(`/venue-management/bookings/${bookingId}`);
}

export async function removeStaffAssignment(
  assignmentId: string,
  venueId: string,
  bookingId?: string
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("venue_staff_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/venue-management/${venueId}`);
  if (bookingId) revalidatePath(`/venue-management/bookings/${bookingId}`);
}
