import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type {
  EventStaffAssignment,
  TeamAvailabilityBlock,
} from "@/lib/supabase/types";
import { TeamClient, type MemberRow, type AvailabilityRow, type TeamKpis } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // 1. Workspace members (no FK join — separate profile lookup).
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const memberRows = members ?? [];
  const memberIds = memberRows.map((m) => m.user_id);

  // 2. Profiles for those members (no email column on profiles — name only).
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

  // 3. Staff assignments across the workspace (joined to events for names/dates).
  const { data: assignments } = await supabase
    .from("event_staff_assignments")
    .select("id, event_id, user_id, role, status")
    .eq("workspace_id", workspaceId);

  const typedAssignments = (assignments ?? []) as Pick<
    EventStaffAssignment,
    "id" | "event_id" | "user_id" | "role" | "status"
  >[];

  // Resolve event names + dates for assignments (separate query, no FK join).
  const assignmentEventIds = Array.from(
    new Set(typedAssignments.map((a) => a.event_id)),
  );
  const eventById = new Map<string, { name: string; start_at: string | null }>();
  if (assignmentEventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, name, start_at")
      .eq("workspace_id", workspaceId)
      .in("id", assignmentEventIds)
      .is("deleted_at", null);
    for (const e of events ?? []) {
      eventById.set(e.id, { name: e.name, start_at: e.start_at });
    }
  }

  // 4. Availability blocks across the workspace.
  const { data: blocks } = await supabase
    .from("team_availability_blocks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("start_at", { ascending: true });

  const typedBlocks = (blocks ?? []) as TeamAvailabilityBlock[];

  // Build per-member workload.
  const memberOut: MemberRow[] = memberRows.map((m) => {
    const mine = typedAssignments.filter((a) => a.user_id === m.user_id);
    // Distinct active events for this member.
    const eventIds = Array.from(new Set(mine.map((a) => a.event_id)));
    const upcoming = eventIds
      .map((id) => {
        const ev = eventById.get(id);
        return ev ? { id, name: ev.name, startAt: ev.start_at } : null;
      })
      .filter((x): x is { id: string; name: string; startAt: string | null } => x !== null)
      .sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : Infinity;
        const tb = b.startAt ? new Date(b.startAt).getTime() : Infinity;
        return ta - tb;
      });

    const confirmedCount = mine.filter((a) => a.status === "confirmed").length;

    const memberBlocks = typedBlocks
      .filter((b) => b.user_id === m.user_id)
      .map((b) => ({
        id: b.id,
        startAt: b.start_at,
        endAt: b.end_at,
        blockType: b.block_type,
        reason: b.reason,
      }));

    return {
      userId: m.user_id,
      name: nameById.get(m.user_id) ?? "Team member",
      email: null,
      role: m.role ?? null,
      eventCount: eventIds.length,
      assignmentCount: mine.length,
      confirmedCount,
      upcomingEvents: upcoming.slice(0, 3),
      blocks: memberBlocks,
    };
  });

  // Flatten availability rows for the availability view.
  const availabilityOut: AvailabilityRow[] = typedBlocks.map((b) => ({
    id: b.id,
    userId: b.user_id,
    name: nameById.get(b.user_id) ?? "Team member",
    startAt: b.start_at,
    endAt: b.end_at,
    blockType: b.block_type,
    reason: b.reason,
  }));

  const now = Date.now();
  const activeBlocks = typedBlocks.filter(
    (b) => new Date(b.end_at).getTime() >= now,
  ).length;

  const kpis: TeamKpis = {
    members: memberRows.length,
    assignedEvents: assignmentEventIds.length,
    overloaded: memberOut.filter((m) => m.eventCount >= 6).length,
    activeBlocks,
  };

  const memberOptions = memberOut.map((m) => ({ userId: m.userId, name: m.name }));

  return (
    <TeamClient
      members={memberOut}
      availability={availabilityOut}
      kpis={kpis}
      memberOptions={memberOptions}
    />
  );
}
