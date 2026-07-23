import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { formatDate, formatGBP, isFutureDate } from "../../lib";
import { CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

// Event statuses use underscores in the DB; StatusBadge's vocabulary is
// hyphenated — adapt rather than extend the shared union (matches the
// existing eventBadgeStatus() pattern from the old VenueDetailClient).
function eventBadgeStatus(status: string): string {
  return status.replace(/_/g, "-");
}

export default async function VenueEventsPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("id, name, client_name, start_at, guest_count_day, status, budget_cents")
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("start_at", { ascending: false });

  const rows = events ?? [];
  const upcoming = rows.filter((e) => isFutureDate(e.start_at));
  const past = rows.filter((e) => e.start_at && !isFutureDate(e.start_at));

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Events Hosted</p>
            <p className="text-2xl font-bold text-surface-900">{rows.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Upcoming</p>
            <p className="text-2xl font-bold text-surface-900">{upcoming.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Past</p>
            <p className="text-2xl font-bold text-surface-900">{past.length}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState
              icon={CalendarDays}
              title="No linked events yet"
              description="Events linked to this venue in this workspace will appear here."
              compact
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Attendance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((ev) => (
                  <tr key={ev.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <Link href={`/event-manager/events/${ev.id}`} className="font-medium text-surface-900 hover:text-brand-600">
                        {ev.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-surface-600">{ev.client_name ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-600">{formatDate(ev.start_at)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={eventBadgeStatus(ev.status) as never} /></td>
                    <td className="px-4 py-3.5 text-surface-600 hidden md:table-cell tabular-nums">{ev.guest_count_day ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-600 hidden lg:table-cell tabular-nums">{formatGBP(ev.budget_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <InsightCard title="Quick Insights">
          <p className="text-sm text-surface-500">
            {rows.length > 0
              ? `${rows.length} event${rows.length === 1 ? "" : "s"} linked to this venue in this workspace.`
              : "Link an event to this venue from the event's Venue tab to see it here."}
          </p>
        </InsightCard>
      </div>
    </div>
  );
}
