import { notFound } from "next/navigation";
import { EventHero } from "@/components/events/EventHero";
import {
  EventDetailTabs,
  type EventDetailData,
  type DetailSupplierRow,
  type DetailTaskRow,
  type DetailRunSheetRow,
  type DetailFileRow,
} from "@/components/events/EventDetailTabs";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  toUiStatus,
  clientLabel,
  venueLabel,
  formatEventDate,
  formatTimeOfDay,
  formatGbpFromCents,
} from "../_lib";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function taskUiStatus(status: string, dueAt: string | null): DetailTaskRow["status"] {
  if (status === "completed" || status === "done") return "completed";
  if (dueAt && new Date(dueAt).getTime() < Date.now()) return "overdue";
  return "pending";
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  // Resolve the event owner's display name for the hero.
  let ownerLabel = "Unassigned";
  if (event.owner_user_id) {
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", event.owner_user_id)
      .maybeSingle();
    if (ownerProfile?.display_name) ownerLabel = ownerProfile.display_name;
  }

  // Related rows for the tabs — all scoped to workspace + this event.
  const [
    { data: tasks },
    { data: eventSuppliers },
    { data: files },
    { data: runSheet },
  ] = await Promise.all([
    supabase
      .from("event_tasks")
      .select("id, title, status, priority, due_at, assignee_user_id")
      .eq("workspace_id", workspaceId)
      .eq("event_id", eventId)
      .is("archived_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("event_suppliers")
      .select("id, status, role_on_event, notes, supplier:suppliers(id, name)")
      .eq("workspace_id", workspaceId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_files")
      .select("id, filename, mime_type, size_bytes, created_at, uploaded_by")
      .eq("workspace_id", workspaceId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_run_sheet_items")
      .select("id, title, lane, section, starts_at, position")
      .eq("workspace_id", workspaceId)
      .eq("event_id", eventId)
      .order("position", { ascending: true }),
  ]);

  const supplierRows: DetailSupplierRow[] = (eventSuppliers ?? []).map((s) => {
    const supplier = Array.isArray(s.supplier) ? s.supplier[0] : s.supplier;
    return {
      id: s.id,
      name: supplier?.name ?? "Unknown supplier",
      category: s.role_on_event ?? "—",
      status: s.status,
      notes: s.notes,
    };
  });

  const taskRows: DetailTaskRow[] = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    assignee: t.assignee_user_id ? t.assignee_user_id.slice(0, 2).toUpperCase() : "—",
    due: formatEventDate(t.due_at, "No due date"),
    priority: t.priority ?? "medium",
    status: taskUiStatus(t.status, t.due_at),
  }));

  const runSheetRows: DetailRunSheetRow[] = (runSheet ?? []).map((r) => ({
    id: r.id,
    time: formatTimeOfDay(r.starts_at),
    description: r.title,
    lane: r.lane ?? "other",
    section: r.section,
  }));

  const fileRows: DetailFileRow[] = (files ?? []).map((f) => ({
    id: f.id,
    name: f.filename,
    isImage: (f.mime_type ?? "").startsWith("image/"),
    size: formatBytes(f.size_bytes),
    uploadedBy: "—",
    date: formatEventDate(f.created_at),
  }));

  const detailData: EventDetailData = {
    eventId: event.id,
    budgetLabel: formatGbpFromCents(event.budget_cents),
    budgetCents: event.budget_cents,
    guestCountDay: event.guest_count_day,
    guestCountEvening: event.guest_count_evening,
    description: event.description,
    internalNotes: event.internal_notes,
    pipelineNotes: event.pipeline_notes,
    clientName: clientLabel(event),
    clientEmail: event.client_email,
    riskLevel: event.risk_level,
    suppliers: supplierRows,
    tasks: taskRows,
    runSheet: runSheetRows,
    files: fileRows,
  };

  const guestCount = event.guest_count_day || event.guest_count_evening || undefined;

  return (
    <div className="animate-fade-in">
      <EventHero
        eventId={event.id}
        name={event.name}
        status={toUiStatus(event.status)}
        date={formatEventDate(event.start_at)}
        venue={venueLabel(event)}
        client={clientLabel(event)}
        owner={ownerLabel}
        guestCount={guestCount}
      />
      <EventDetailTabs data={detailData} />
    </div>
  );
}
