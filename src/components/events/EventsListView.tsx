"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Filter,
  LayoutGrid,
  List,
  Calendar,
  MoreHorizontal,
  CalendarOff,
  Search,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { EventCard } from "@/components/events/EventCard";
import { cn } from "@/lib/utils";
import type { UiEventStatus } from "@/app/event-manager/events/_lib";

export interface EventListRow {
  id: string;
  name: string;
  client: string;
  venue?: string;
  date: string;
  guests: number;
  status: UiEventStatus;
  tasksDone: number;
  tasksTotal: number;
}

export interface StatusTab {
  label: string;
  /** kebab-case UI status this tab filters to, or null for "All". */
  status: UiEventStatus | null;
}

type ViewMode = "list" | "grid" | "calendar";

export function EventsListView({
  events,
  tabs,
  kpis,
}: {
  events: EventListRow[];
  tabs: StatusTab[];
  /** KPI strip rendered (server-side) between the tab bar and the toolbar. */
  kpis?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const tabStatus = tabs[activeTab]?.status ?? null;
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (tabStatus && e.status !== tabStatus) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.client.toLowerCase().includes(q) ||
        (e.venue ?? "").toLowerCase().includes(q)
      );
    });
  }, [events, tabs, activeTab, query]);

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <>
      {/* Tabs — sit flush under the page header */}
      <div className="bg-white border-b border-surface-200">
        <div className="px-6 flex gap-0 overflow-x-auto">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => {
                setActiveTab(i);
                setSelected(new Set());
              }}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
                i === activeTab
                  ? "text-brand-600 border-brand-600"
                  : "text-surface-500 border-transparent hover:text-surface-900 hover:border-surface-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-[1400px]">
        {kpis}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" strokeWidth={1.8} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events…"
                className="pl-9 pr-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors w-56"
              />
            </div>
            <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Filter className="w-4 h-4" strokeWidth={1.8} />
              Filter
            </button>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg">
                <span className="text-xs font-medium text-brand-700">
                  {selected.size} selected
                </span>
                <button className="text-xs text-brand-600 hover:underline font-medium">
                  Export
                </button>
                <span className="text-brand-200">|</span>
                <button className="text-xs text-danger-600 hover:underline font-medium">
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-surface-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={cn(
                "p-2 border-r border-surface-200 transition-colors",
                view === "list" ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:bg-surface-50"
              )}
              title="List view"
            >
              <List className="w-4 h-4" strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-2 border-r border-surface-200 transition-colors",
                view === "grid" ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:bg-surface-50"
              )}
              title="Card view"
            >
              <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setView("calendar")}
              className={cn(
                "p-2 transition-colors",
                view === "calendar" ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:bg-surface-50"
              )}
              title="Calendar view"
            >
              <Calendar className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Calendar View */}
        {view === "calendar" && (
          <EmptyState
            icon={CalendarOff}
            title="Calendar view coming soon"
            description="We're building a full calendar view so you can see all your events plotted on a timeline. Check back in the next release."
          />
        )}

        {/* Empty results */}
        {view !== "calendar" && filtered.length === 0 && (
          <EmptyState
            icon={CalendarOff}
            title={query || tabs[activeTab]?.status ? "No matching events" : "No events yet"}
            description={
              query || tabs[activeTab]?.status
                ? "Try adjusting your search or switching tabs to see more events."
                : "Create your first event to start managing your pipeline."
            }
          />
        )}

        {/* Card / Grid View */}
        {view === "grid" && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((event) => (
              <EventCard
                key={event.id}
                id={event.id}
                name={event.name}
                status={event.status}
                date={event.date}
                client={event.client}
                venue={event.venue}
                guests={event.guests}
                tasksDone={event.tasksDone}
                tasksTotal={event.tasksTotal}
              />
            ))}
          </div>
        )}

        {/* List / Table View */}
        {view === "list" && filtered.length > 0 && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Guests</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((event) => {
                  const isSelected = selected.has(event.id);
                  const progressPct =
                    event.tasksTotal > 0
                      ? Math.round((event.tasksDone / event.tasksTotal) * 100)
                      : 0;

                  return (
                    <tr
                      key={event.id}
                      className={cn(
                        "transition-colors group",
                        isSelected ? "bg-brand-50" : "hover:bg-surface-50"
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(event.id)}
                          className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/event-manager/events/${event.id}`}
                          className="font-medium text-surface-900 hover:text-brand-600 transition-colors"
                        >
                          {event.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-surface-500 hidden md:table-cell">{event.client}</td>
                      <td className="px-4 py-3 text-surface-500 hidden lg:table-cell whitespace-nowrap">{event.date}</td>
                      <td className="px-4 py-3 text-surface-500 hidden lg:table-cell">{event.guests}</td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-surface-100 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                progressPct === 100
                                  ? "bg-success-500"
                                  : progressPct >= 50
                                  ? "bg-brand-500"
                                  : "bg-warning-400"
                              )}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-surface-400 whitespace-nowrap">
                            {event.tasksDone}/{event.tasksTotal}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={event.status} />
                      </td>
                      <td className="px-4 py-3">
                        <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-all">
                          <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
