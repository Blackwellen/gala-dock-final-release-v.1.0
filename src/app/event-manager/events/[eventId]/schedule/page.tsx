import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, Download, Clock } from "lucide-react";
import { ScheduleList, type RunItem } from "./ScheduleList";

export const dynamic = "force-dynamic";

const LANE_COLORS: Record<string, string> = {
  tech:     "bg-blue-100 text-blue-700 border-blue-200",
  foh:      "bg-green-100 text-green-700 border-green-200",
  talent:   "bg-violet-100 text-violet-700 border-violet-200",
  comms:    "bg-amber-100 text-amber-700 border-amber-200",
  security: "bg-red-100 text-red-700 border-red-200",
  catering: "bg-orange-100 text-orange-700 border-orange-200",
  other:    "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function laneColor(lane: string | null) {
  return LANE_COLORS[(lane ?? "other").toLowerCase()] ?? LANE_COLORS.other;
}

export default async function SchedulePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, start_at, end_at")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: items } = await supabase
    .from("event_run_sheet_items")
    .select("id, title, lane, section, starts_at, notes, position")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  const runItems = (items ?? []) as RunItem[];

  const sections = new Map<string, RunItem[]>();
  for (const item of runItems) {
    const sec = item.section ?? "General";
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(item);
  }

  const lanes = [...new Set(runItems.map((i) => i.lane ?? "other").filter(Boolean))];

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Run Sheet / Schedule</h2>
          <p className="text-sm text-surface-500">{runItems.length} item{runItems.length !== 1 ? "s" : ""} across {sections.size} section{sections.size !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm transition-colors">
            <Download className="h-4 w-4" strokeWidth={1.8} />
            Export PDF
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm transition-colors">
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add Item
          </button>
        </div>
      </div>

      {/* Lane legend */}
      {lanes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {lanes.map((lane) => (
            <span key={lane} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${laneColor(lane)}`}>
              {lane.charAt(0).toUpperCase() + lane.slice(1)}
            </span>
          ))}
        </div>
      )}

      {/* Run sheet with inline editing */}
      {runItems.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white shadow-card py-16 text-center">
          <Clock className="mx-auto h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm font-medium text-surface-900">No run sheet items yet</p>
          <p className="text-xs text-surface-400 mt-1">Build your schedule by adding timed items to each lane.</p>
          <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            <Plus className="h-4 w-4" />
            Add First Item
          </button>
        </div>
      ) : (
        <ScheduleList runItems={runItems} eventId={eventId} />
      )}
    </div>
  );
}
