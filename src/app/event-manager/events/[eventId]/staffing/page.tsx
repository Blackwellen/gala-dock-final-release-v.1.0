import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { EventStaffAssignment } from "@/lib/supabase/types";
import { StaffingClient, type AssignmentRow, type StaffingKpis } from "./StaffingClient";

export const dynamic = "force-dynamic";

export default async function StaffingPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, start_at")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  // Assignments for this event.
  const { data: assignments } = await supabase
    .from("event_staff_assignments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const typed = (assignments ?? []) as EventStaffAssignment[];

  // Workspace members (separate profile lookup, no FK join).
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const memberRows = members ?? [];
  const memberIds = memberRows.map((m) => m.user_id);
  const nameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    for (const p of profiles ?? []) {
      if (p.display_name) nameById.set(p.user_id, p.display_name);
    }
  }

  const rows: AssignmentRow[] = typed.map((a) => ({
    id: a.id,
    userId: a.user_id,
    name: a.user_id
      ? nameById.get(a.user_id) ?? "Team member"
      : a.staff_name ?? "Staff",
    isTeamMember: Boolean(a.user_id),
    role: a.role,
    callTime: a.call_time,
    endTime: a.end_time,
    status: a.status,
    notes: a.notes,
  }));

  // Members not yet assigned (so we don't double-assign the same person).
  const assignedUserIds = new Set(typed.map((a) => a.user_id).filter(Boolean) as string[]);
  const memberOptions = memberRows
    .filter((m) => !assignedUserIds.has(m.user_id))
    .map((m) => ({
      userId: m.user_id,
      name: nameById.get(m.user_id) ?? "Team member",
    }));

  const kpis: StaffingKpis = {
    assigned: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    pending: rows.filter((r) => r.status === "pending").length,
    teamMembers: rows.filter((r) => r.isTeamMember).length,
  };

  return (
    <StaffingClient
      eventId={event.id}
      eventName={event.name}
      assignments={rows}
      memberOptions={memberOptions}
      kpis={kpis}
    />
  );
}
