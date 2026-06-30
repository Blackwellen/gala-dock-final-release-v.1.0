import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/supabase/types";
import { LeadsClient, type LeadRow, type LeadsKpis } from "./LeadsClient";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Resolve assignee display names from the workspace member profiles.
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

  const typed = (leads ?? []) as Lead[];

  const rows: LeadRow[] = typed.map((l) => ({
    id: l.id,
    title: l.title,
    clientName: l.client_name,
    eventType: l.event_type,
    eventDate: l.event_date,
    budgetCents: l.budget_estimate_cents,
    stage: l.stage,
    source: l.source,
    assignedTo: l.assigned_to ? nameById.get(l.assigned_to) ?? "Assigned" : null,
    createdAt: l.created_at,
  }));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const wonCount = typed.filter((l) => l.stage === "won").length;
  const lostCount = typed.filter((l) => l.stage === "lost").length;
  const closed = wonCount + lostCount;

  const kpis: LeadsKpis = {
    total: typed.length,
    thisMonth: typed.filter((l) => new Date(l.created_at).getTime() >= monthStart)
      .length,
    inPipeline: typed.filter((l) => l.stage !== "won" && l.stage !== "lost").length,
    conversionRate: closed === 0 ? "—" : `${Math.round((wonCount / closed) * 100)}%`,
  };

  return <LeadsClient leads={rows} kpis={kpis} />;
}
