import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Lead, LeadActivity } from "@/lib/supabase/types";
import { LeadDetailClient, type LinkedEvent, type MemberOption } from "./LeadDetailClient";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead) notFound();
  const typedLead = lead as Lead;

  const { data: activities } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const memberIds = (members ?? []).map((m) => m.user_id);
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
  const teamMembers: MemberOption[] = memberIds.map((id) => ({
    id,
    name: nameById.get(id) ?? "Team member",
  }));

  // Linked event (if converted).
  let linkedEvent: LinkedEvent | null = null;
  if (typedLead.converted_event_id) {
    const { data: ev } = await supabase
      .from("events")
      .select("id, name, status")
      .eq("id", typedLead.converted_event_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (ev) {
      linkedEvent = { id: ev.id, name: ev.name, status: ev.status };
    }
  }

  const typedActivities = (activities ?? []) as LeadActivity[];
  const activityRows = typedActivities.map((a) => ({
    id: a.id,
    action: a.action,
    detail: a.detail,
    actorName: a.actor_id ? nameById.get(a.actor_id) ?? "Someone" : "System",
    createdAt: a.created_at,
  }));

  return (
    <LeadDetailClient
      lead={typedLead}
      assignedName={
        typedLead.assigned_to ? nameById.get(typedLead.assigned_to) ?? null : null
      }
      activities={activityRows}
      teamMembers={teamMembers}
      linkedEvent={linkedEvent}
    />
  );
}
