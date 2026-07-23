import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, isWithinPastDays } from "../../lib";
import { Activity as ActivityIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const ACTIVITY_LABEL: Record<string, string> = {
  venue_created: "Venue created",
  preferred_status_changed: "Preferred status changed",
  note_added: "Note added",
  document_uploaded: "Document uploaded",
  event_linked: "Event linked",
  hold_created: "Venue hold created",
  room_block_created: "Room block created",
  commercial_transaction_recorded: "Commercial transaction recorded",
};

export default async function VenueActivityPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: activity } = await supabase
    .from("venue_activity_log")
    .select("id, activity_type, title, description, outcome, is_internal, created_at")
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = activity ?? [];
  const thisMonth = rows.filter((a) => isWithinPastDays(a.created_at, 30));
  const internal = thisMonth.filter((a) => a.is_internal);
  const commercial = thisMonth.filter((a) => a.activity_type.startsWith("commercial") || a.activity_type.includes("hold") || a.activity_type.includes("room_block"));

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">This Month</p>
            <p className="text-2xl font-bold text-surface-900">{thisMonth.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Internal Updates</p>
            <p className="text-2xl font-bold text-surface-900">{internal.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Commercial Changes</p>
            <p className="text-2xl font-bold text-surface-900">{commercial.length}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={ActivityIcon} title="No activity yet" description="Actions taken on this venue — notes, documents, holds, commercial changes — will appear here." compact />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card divide-y divide-surface-100">
            {rows.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-800">{a.title || ACTIVITY_LABEL[a.activity_type] || a.activity_type}</p>
                  {a.description && <p className="text-xs text-surface-500 mt-0.5">{a.description}</p>}
                </div>
                <span className="text-xs text-surface-400 shrink-0 whitespace-nowrap">{formatDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <InsightCard title="Relationship Health">
          <p className="text-sm text-surface-500">
            Not yet calculated for this venue. Relationship health is derived from engagement, responsiveness,
            experience, commercial fit and reliability once enough activity has been recorded.
          </p>
        </InsightCard>
      </div>
    </div>
  );
}
