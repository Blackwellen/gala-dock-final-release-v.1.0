import { createClient } from "@/lib/supabase/server";

export interface TeamMemberBase {
  userId: string;
  name: string;
  role: string | null;
  workspaceRole: string;
}

export interface TeamAssignmentRow {
  id: string;
  userId: string;
  eventId: string;
  eventName: string;
  venueName: string | null;
  role: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  callTime: string | null;
  endTime: string | null;
}

export interface TeamAvailabilityRow {
  id: string;
  userId: string;
  startAt: string;
  endAt: string;
  blockType: string;
  reason: string | null;
}

export interface TeamWorkspaceData {
  members: TeamMemberBase[];
  assignments: TeamAssignmentRow[];
  availability: TeamAvailabilityRow[];
}

/**
 * Shared fetch used by every Team & Staffing screen. One round trip per
 * table, joined in memory (Supabase client has no cross-table FK expansion
 * configured for workspace_members -> profiles here, so profile names are
 * resolved separately as the rest of the codebase already does).
 */
export async function getTeamWorkspaceData(workspaceId: string): Promise<TeamWorkspaceData> {
  const supabase = await createClient();

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const memberIds = (memberRows ?? []).map((m) => m.user_id);

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

  const members: TeamMemberBase[] = (memberRows ?? []).map((m) => ({
    userId: m.user_id,
    name: nameById.get(m.user_id) ?? "Team member",
    role: m.role ?? null,
    workspaceRole: m.role ?? "member",
  }));

  const { data: assignmentRows } = await supabase
    .from("event_staff_assignments")
    .select("id, event_id, user_id, role, status, call_time, end_time")
    .eq("workspace_id", workspaceId);

  const eventIds = Array.from(new Set((assignmentRows ?? []).map((a) => a.event_id)));
  const eventById = new Map<
    string,
    { name: string; startAt: string | null; endAt: string | null; venue: string | null }
  >();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, name, start_at, end_at, venue_name_snapshot")
      .eq("workspace_id", workspaceId)
      .in("id", eventIds)
      .is("deleted_at", null);
    for (const e of events ?? []) {
      eventById.set(e.id, {
        name: e.name,
        startAt: e.start_at,
        endAt: e.end_at,
        venue: e.venue_name_snapshot,
      });
    }
  }

  const assignments: TeamAssignmentRow[] = (assignmentRows ?? [])
    .filter((a) => a.user_id !== null && eventById.has(a.event_id))
    .map((a) => {
      const ev = eventById.get(a.event_id)!;
      return {
        id: a.id,
        userId: a.user_id as string,
        eventId: a.event_id,
        eventName: ev.name,
        venueName: ev.venue,
        role: a.role,
        status: a.status,
        startAt: ev.startAt,
        endAt: ev.endAt,
        callTime: a.call_time,
        endTime: a.end_time,
      };
    });

  const { data: blockRows } = await supabase
    .from("team_availability_blocks")
    .select("id, user_id, start_at, end_at, block_type, reason")
    .eq("workspace_id", workspaceId)
    .order("start_at", { ascending: true });

  const availability: TeamAvailabilityRow[] = (blockRows ?? []).map((b) => ({
    id: b.id,
    userId: b.user_id,
    startAt: b.start_at,
    endAt: b.end_at,
    blockType: b.block_type,
    reason: b.reason,
  }));

  return { members, assignments, availability };
}

export interface TeamDirectoryMember {
  userId: string;
  name: string;
  memberCode: string | null;
  department: string | null;
  role: string | null;
  location: string | null;
  employmentType: string;
  dayRateCents: number | null;
  hourRateCents: number | null;
  currency: string;
  rating: number | null;
  skills: string[];
  complianceStatus: "compliant" | "expiring_soon" | "expired" | "unknown";
  regions: { name: string; tier: string }[];
}

/** Richer, joined member data for Directory / Find / Profile screens. */
export async function getTeamDirectoryMembers(workspaceId: string): Promise<TeamDirectoryMember[]> {
  const supabase = await createClient();

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  const userIds = (memberRows ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const [{ data: profiles }, { data: teamProfiles }, { data: depts }, { data: roles }, { data: skillLinks }, { data: skills }, { data: certs }, { data: regions }] =
    await Promise.all([
      supabase.from("profiles").select("user_id, display_name").in("user_id", userIds),
      supabase.from("team_member_profiles").select("*").eq("workspace_id", workspaceId).in("user_id", userIds),
      supabase.from("team_departments").select("id, name").eq("workspace_id", workspaceId),
      supabase.from("staffing_roles").select("id, name").eq("workspace_id", workspaceId),
      supabase.from("team_member_skills").select("user_id, skill_id, proficiency").eq("workspace_id", workspaceId).in("user_id", userIds),
      supabase.from("skills").select("id, name").eq("workspace_id", workspaceId),
      supabase.from("team_member_certifications").select("user_id, status").eq("workspace_id", workspaceId).in("user_id", userIds),
      supabase.from("team_member_regions").select("user_id, region_name, tier").eq("workspace_id", workspaceId).in("user_id", userIds),
    ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Team member"]));
  const deptNameById = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const roleNameById = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const skillNameById = new Map((skills ?? []).map((s) => [s.id, s.name]));

  const skillsByUser = new Map<string, string[]>();
  for (const link of skillLinks ?? []) {
    const list = skillsByUser.get(link.user_id) ?? [];
    const name = skillNameById.get(link.skill_id);
    if (name) list.push(name);
    skillsByUser.set(link.user_id, list);
  }

  const complianceByUser = new Map<string, "compliant" | "expiring_soon" | "expired">();
  for (const c of certs ?? []) {
    const current = complianceByUser.get(c.user_id);
    if (c.status === "expired") complianceByUser.set(c.user_id, "expired");
    else if (c.status === "expiring_soon" && current !== "expired") complianceByUser.set(c.user_id, "expiring_soon");
    else if (!current) complianceByUser.set(c.user_id, "compliant");
  }

  const regionsByUser = new Map<string, { name: string; tier: string }[]>();
  for (const r of regions ?? []) {
    const list = regionsByUser.get(r.user_id) ?? [];
    list.push({ name: r.region_name, tier: r.tier });
    regionsByUser.set(r.user_id, list);
  }

  const tpByUser = new Map((teamProfiles ?? []).map((tp) => [tp.user_id, tp]));

  return userIds.map((userId) => {
    const tp = tpByUser.get(userId);
    return {
      userId,
      name: nameById.get(userId) ?? "Team member",
      memberCode: tp?.member_code ?? null,
      department: tp?.department_id ? deptNameById.get(tp.department_id) ?? null : null,
      role: tp?.primary_role_id ? roleNameById.get(tp.primary_role_id) ?? null : null,
      location: tp?.home_location ?? null,
      employmentType: tp?.employment_type ?? "employee",
      dayRateCents: tp?.day_rate_cents ?? null,
      hourRateCents: tp?.hour_rate_cents ?? null,
      currency: tp?.currency ?? "GBP",
      rating: tp?.rating ?? null,
      skills: skillsByUser.get(userId) ?? [],
      complianceStatus: complianceByUser.get(userId) ?? "unknown",
      regions: regionsByUser.get(userId) ?? [],
    };
  });
}
