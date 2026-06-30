"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["pending", "confirmed", "declined"] as const;
type StaffStatus = (typeof STATUSES)[number];

function coerceStatus(raw: FormDataEntryValue | null | string): StaffStatus {
  const v = String(raw ?? "pending");
  return (STATUSES as readonly string[]).includes(v) ? (v as StaffStatus) : "pending";
}

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/** Confirm the event belongs to the active workspace. Throws if not. */
async function assertEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  eventId: string,
) {
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Event not found");
}

/**
 * Assign a team member or a named (off-platform) staffer to an event.
 * Either user_id (workspace member) or staff_name must be provided.
 */
export async function assignStaff(eventId: string, formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await assertEvent(supabase, workspaceId, eventId);

  let userId = str(formData.get("user_id"));
  const staffName = str(formData.get("staff_name"));

  if (userId) {
    // Validate the member belongs to this workspace.
    const { data: member } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!member) userId = null;
  }

  if (!userId && !staffName) {
    throw new Error("Select a team member or enter a staff name");
  }

  const { error } = await supabase.from("event_staff_assignments").insert({
    workspace_id: workspaceId,
    event_id: eventId,
    created_by: user.id,
    user_id: userId,
    staff_name: userId ? null : staffName,
    role: str(formData.get("role")),
    call_time: str(formData.get("call_time")),
    end_time: str(formData.get("end_time")),
    status: coerceStatus(formData.get("status")),
    notes: str(formData.get("notes")),
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/staffing`);
}

/** Update an existing assignment's role, times, status or notes. */
export async function updateAssignment(
  eventId: string,
  assignmentId: string,
  formData: FormData,
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_staff_assignments")
    .update({
      role: str(formData.get("role")),
      call_time: str(formData.get("call_time")),
      end_time: str(formData.get("end_time")),
      status: coerceStatus(formData.get("status")),
      notes: str(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/staffing`);
}

/** Quick status change (pending → confirmed etc.) without the full edit form. */
export async function setAssignmentStatus(
  eventId: string,
  assignmentId: string,
  status: string,
) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_staff_assignments")
    .update({ status: coerceStatus(status), updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/staffing`);
}

/** Remove an assignment from the event. */
export async function removeAssignment(eventId: string, assignmentId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("event_staff_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath(`/event-manager/events/${eventId}/staffing`);
}
