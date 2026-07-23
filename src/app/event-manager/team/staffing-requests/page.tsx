import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { StaffingRequestsClient, type StaffingRequestRow } from "./StaffingRequestsClient";

export const dynamic = "force-dynamic";

export default async function StaffingRequestsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("staffing_requests")
    .select("id, event_id, role_label, quantity_required, quantity_filled, start_at, end_at, location, urgency, status, assigned_lead_id")
    .eq("workspace_id", workspaceId)
    .order("start_at", { ascending: true });

  const rows = requests ?? [];
  const eventIds = Array.from(new Set(rows.map((r) => r.event_id)));
  const eventById = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase.from("events").select("id, name").in("id", eventIds);
    for (const e of events ?? []) eventById.set(e.id, e.name);
  }

  const leadIds = Array.from(new Set(rows.map((r) => r.assigned_lead_id).filter((x): x is string => Boolean(x))));
  const leadNameById = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", leadIds);
    for (const p of profiles ?? []) if (p.display_name) leadNameById.set(p.user_id, p.display_name);
  }

  const out: StaffingRequestRow[] = rows.map((r) => ({
    id: r.id,
    eventName: eventById.get(r.event_id) ?? "Untitled event",
    roleLabel: r.role_label,
    quantityRequired: r.quantity_required,
    quantityFilled: r.quantity_filled,
    startAt: r.start_at,
    endAt: r.end_at,
    location: r.location,
    urgency: r.urgency,
    status: r.status,
    assignedLeadName: r.assigned_lead_id ? leadNameById.get(r.assigned_lead_id) ?? null : null,
  }));

  return <StaffingRequestsClient requests={out} />;
}
