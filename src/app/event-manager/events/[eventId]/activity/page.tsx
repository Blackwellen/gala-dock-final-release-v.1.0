import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Clock, User, FileText, MessageSquare, CheckCircle2, AlertTriangle, Zap, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  created:       <CheckCircle2 className="h-4 w-4 text-success-600" />,
  updated:       <RefreshCw className="h-4 w-4 text-blue-600" />,
  deleted:       <AlertTriangle className="h-4 w-4 text-danger-600" />,
  commented:     <MessageSquare className="h-4 w-4 text-violet-600" />,
  uploaded:      <FileText className="h-4 w-4 text-amber-600" />,
  assigned:      <User className="h-4 w-4 text-teal-600" />,
  status_change: <Zap className="h-4 w-4 text-brand-600" />,
  sent:          <CheckCircle2 className="h-4 w-4 text-success-600" />,
};

const ACTION_COLORS: Record<string, string> = {
  created:       "bg-success-50 border-success-100",
  updated:       "bg-blue-50 border-blue-100",
  deleted:       "bg-danger-50 border-danger-100",
  commented:     "bg-violet-50 border-violet-100",
  uploaded:      "bg-amber-50 border-amber-100",
  assigned:      "bg-teal-50 border-teal-100",
  status_change: "bg-brand-50 border-brand-100",
  sent:          "bg-success-50 border-success-100",
};

import React from "react";

interface ActivityEntry {
  id: string;
  action_type: string | null;
  entity_type: string | null;
  entity_label: string | null;
  actor_name: string | null;
  description: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

function timeAgo(date: string | null): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default async function ActivityPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: activityData, count: total } = await supabase
    .from("event_activity")
    .select("id, action, resource_type, resource_id, actor_name, note, created_at, metadata", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(60);

  // Map the live event_activity columns onto the view model.
  const entries: ActivityEntry[] = (activityData ?? []).map((r) => ({
    id: r.id,
    action_type: r.action,
    entity_type: r.resource_type,
    entity_label: r.resource_id,
    actor_name: r.actor_name,
    description: r.note,
    created_at: r.created_at,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
  }));

  // Group by day
  const byDay = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    const day = e.created_at ? new Date(e.created_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "Unknown";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  const uniqueActors = new Set(entries.map((e) => e.actor_name).filter(Boolean)).size;
  const todayCount = entries.filter((e) => {
    if (!e.created_at) return false;
    const d = new Date(e.created_at);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Activity Feed</h2>
          <p className="text-sm text-surface-500">{total ?? 0} events recorded · {uniqueActors} team member{uniqueActors !== 1 ? "s" : ""} active · {todayCount} today</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-sm">
            <option>All Activity</option>
            <option>Created</option>
            <option>Updated</option>
            <option>Comments</option>
            <option>Uploads</option>
            <option>Status Changes</option>
          </select>
          <select className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-sm">
            <option>All Sections</option>
            <option>Tasks</option>
            <option>Suppliers</option>
            <option>Guests</option>
            <option>Finance</option>
            <option>Documents</option>
          </select>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white shadow-card py-16 text-center">
          <Clock className="mx-auto h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm font-medium text-surface-900">No activity yet</p>
          <p className="text-xs text-surface-400 mt-1">All actions taken on this event will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...byDay.entries()].map(([day, dayEntries]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{day}</span>
                <div className="flex-1 h-px bg-surface-200" />
                <span className="text-xs text-surface-400">{dayEntries.length} event{dayEntries.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[15px] top-0 bottom-0 w-px bg-surface-200" />
                <div className="space-y-3 pl-9">
                  {dayEntries.map((entry) => {
                    const action = (entry.action_type ?? "updated").toLowerCase();
                    const icon = ACTION_ICONS[action] ?? <RefreshCw className="h-4 w-4 text-surface-500" />;
                    const dotCls = ACTION_COLORS[action] ?? "bg-surface-50 border-surface-200";
                    return (
                      <div key={entry.id} className="relative">
                        {/* Timeline dot */}
                        <div className={`absolute -left-[26px] top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 ${dotCls}`}>
                          {icon}
                        </div>
                        <div className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-surface-900 leading-snug">
                                {entry.description ?? `${entry.actor_name ?? "Someone"} ${action} ${entry.entity_label ?? entry.entity_type ?? "a record"}`}
                              </p>
                              <div className="mt-1 flex items-center gap-2">
                                {entry.actor_name && (
                                  <span className="flex items-center gap-1 text-[11px] text-surface-500">
                                    <User className="h-3 w-3" />
                                    {entry.actor_name}
                                  </span>
                                )}
                                {entry.entity_type && (
                                  <span className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-medium text-surface-600 capitalize">
                                    {entry.entity_type.replace("_", " ")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] text-surface-400 whitespace-nowrap">
                              {entry.created_at ? new Date(entry.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
