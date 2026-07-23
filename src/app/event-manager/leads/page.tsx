import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/supabase/types";
import { formatBudget, type NextAction } from "./lib";
import { LeadsClient, type LeadRow, type LeadsKpis, type LeadOwner } from "./LeadsClient";

export const dynamic = "force-dynamic";

/** Estimated value for a lead: explicit estimate, else midpoint of min/max range, else 0. */
function estimatedValueCents(l: Lead): number {
  if (l.budget_estimate_cents != null) return l.budget_estimate_cents;
  if (l.budget_min_cents != null || l.budget_max_cents != null) {
    const min = l.budget_min_cents ?? l.budget_max_cents ?? 0;
    const max = l.budget_max_cents ?? l.budget_min_cents ?? 0;
    return Math.round((min + max) / 2);
  }
  return 0;
}

function parseNextActions(raw: unknown): NextAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is NextAction =>
      !!a && typeof a === "object" && "label" in (a as Record<string, unknown>)
  ) as NextAction[];
}

export default async function LeadsPage() {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .eq("is_draft", false)
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

  const owners: LeadOwner[] = memberIds.map((id) => ({
    id,
    name: nameById.get(id) ?? "Team member",
  }));

  const typed = (leads ?? []) as Lead[];

  const rows: LeadRow[] = typed.map((l) => ({
    id: l.id,
    title: l.title,
    clientName: l.client_name,
    companyName: l.company_name,
    eventType: l.event_type,
    eventDate: l.event_date,
    eventLocation: l.event_location,
    city: l.city,
    guestCount: l.guest_count_estimate,
    budgetCents: l.budget_estimate_cents,
    budgetMinCents: l.budget_min_cents,
    budgetMaxCents: l.budget_max_cents,
    stage: l.stage,
    source: l.source,
    assignedTo: l.assigned_to ? nameById.get(l.assigned_to) ?? "Assigned" : null,
    assignedToId: l.assigned_to,
    priority: l.priority ?? "medium",
    leadScore: l.lead_score,
    nextActions: parseNextActions(l.next_actions),
    responseDueDate: l.response_due_date,
    coverImageUrl: l.cover_image_url,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  }));

  const now = new Date();
  const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const wonCount = typed.filter((l) => l.stage === "won").length;
  const lostCount = typed.filter((l) => l.stage === "lost").length;
  const closed = wonCount + lostCount;

  const inPipelineLeads = typed.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const hotLeads = inPipelineLeads.filter((l) => (l.priority ?? "medium") === "high").length;
  const pipelineValueCents = inPipelineLeads.reduce((sum, l) => sum + estimatedValueCents(l), 0);

  const kpis: LeadsKpis = {
    total: typed.length,
    newThisWeek: typed.filter((l) => new Date(l.created_at).getTime() >= weekAgoMs).length,
    inPipeline: inPipelineLeads.length,
    inPipelinePct: typed.length === 0 ? 0 : Math.round((inPipelineLeads.length / typed.length) * 100),
    hotLeads,
    pipelineValueLabel: formatBudget(pipelineValueCents),
    conversionRate: closed === 0 ? "—" : `${Math.round((wonCount / closed) * 100)}%`,
  };

  return <LeadsClient leads={rows} kpis={kpis} owners={owners} currentUserId={user.id} />;
}
