import Link from "next/link";
import {
  Plus,
  Upload,
  Download,
  CalendarDays,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import {
  EventsListView,
  type EventListRow,
  type StatusTab,
} from "@/components/events/EventsListView";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_TABS,
  toUiStatus,
  clientLabel,
  venueLabel,
  formatEventDate,
} from "./_lib";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, name, status, start_at, client_name, client_company, venue_name_snapshot, location, guest_count_day, guest_count_evening"
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("start_at", { ascending: true, nullsFirst: false });

  const eventRows = events ?? [];
  const eventIds = eventRows.map((e) => e.id);

  // Pull task rows for progress bars (done vs total) in one query.
  const taskCounts = new Map<string, { done: number; total: number }>();
  if (eventIds.length > 0) {
    const { data: tasks } = await supabase
      .from("event_tasks")
      .select("event_id, status")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .in("event_id", eventIds);

    for (const t of tasks ?? []) {
      const entry = taskCounts.get(t.event_id) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (t.status === "completed" || t.status === "done") entry.done += 1;
      taskCounts.set(t.event_id, entry);
    }
  }

  const rows: EventListRow[] = eventRows.map((e) => {
    const counts = taskCounts.get(e.id) ?? { done: 0, total: 0 };
    return {
      id: e.id,
      name: e.name,
      client: clientLabel(e),
      venue: venueLabel(e),
      date: formatEventDate(e.start_at),
      guests: e.guest_count_day || e.guest_count_evening || 0,
      status: toUiStatus(e.status),
      tasksDone: counts.done,
      tasksTotal: counts.total,
    };
  });

  // KPIs derived from live data.
  const activeCount = rows.filter(
    (r) => r.status !== "completed" && r.status !== "cancelled"
  ).length;
  const confirmedCount = rows.filter((r) => r.status === "confirmed").length;
  const awaitingCount = rows.filter((r) => r.status === "awaiting-approval").length;
  // At-risk derived from the risk_level column where flagged.
  const { count: atRiskCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .eq("risk_level", "high");

  const tabs: StatusTab[] = STATUS_TABS.map((t) => ({
    label: t.label,
    status: t.status ? toUiStatus(t.status) : null,
  }));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Events"
        description="Manage your full event pipeline"
        actions={
          <>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Upload className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Export</span>
            </button>
            <Link
              href="/events/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New Event
            </Link>
          </>
        }
      />

      <EventsListView
        events={rows}
        tabs={tabs}
        kpis={
          <KPIGrid className="grid-cols-2 sm:grid-cols-4">
            <MetricCard
              label="Active Events"
              value={String(activeCount)}
              icon={CalendarDays}
              iconColor="text-brand-600"
              iconBg="bg-brand-50"
            />
            <MetricCard
              label="Confirmed"
              value={String(confirmedCount)}
              icon={CalendarDays}
              iconColor="text-success-600"
              iconBg="bg-success-50"
            />
            <MetricCard
              label="Awaiting Approval"
              value={String(awaitingCount)}
              icon={CheckSquare}
              iconColor="text-warning-600"
              iconBg="bg-warning-50"
            />
            <MetricCard
              label="At Risk"
              value={String(atRiskCount ?? 0)}
              icon={AlertTriangle}
              iconColor="text-danger-600"
              iconBg="bg-danger-50"
            />
          </KPIGrid>
        }
      />
    </div>
  );
}
