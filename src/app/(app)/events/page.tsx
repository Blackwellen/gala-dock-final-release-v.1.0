"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Upload,
  Download,
  Filter,
  LayoutGrid,
  List,
  Calendar,
  MoreHorizontal,
  CalendarDays,
  Users2,
  CheckSquare,
  AlertTriangle,
  CalendarOff,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { EventCard } from "@/components/events/EventCard";
import { cn } from "@/lib/utils";

const TABS = [
  "All Events",
  "New Enquiries",
  "Briefing",
  "Quoting",
  "Awaiting Approval",
  "Confirmed",
  "In Delivery",
  "Completed",
  "Cancelled/Lost",
];

type EventStatus =
  | "confirmed"
  | "quoting"
  | "awaiting-approval"
  | "in-delivery"
  | "completed"
  | "cancelled"
  | "new-enquiry"
  | "briefing";

const EVENTS: {
  id: string;
  name: string;
  client: string;
  date: string;
  guests: number;
  status: EventStatus;
  owner: string;
  venue: string;
  tasksDone: number;
  tasksTotal: number;
}[] = [
  {
    id: "1",
    name: "The Carter Wedding",
    client: "S. Carter",
    date: "14 Jun 2026",
    guests: 120,
    status: "confirmed",
    owner: "JT",
    venue: "The Grand Pavilion, London",
    tasksDone: 18,
    tasksTotal: 24,
  },
  {
    id: "2",
    name: "Meridian Tech Summit",
    client: "Meridian Ltd",
    date: "19 Jun 2026",
    guests: 300,
    status: "in-delivery",
    owner: "KL",
    venue: "ExCeL London",
    tasksDone: 31,
    tasksTotal: 36,
  },
  {
    id: "3",
    name: "Hawthorn Birthday Ball",
    client: "J. Hawthorn",
    date: "28 Jun 2026",
    guests: 60,
    status: "quoting",
    owner: "JT",
    venue: "Claridge's, London",
    tasksDone: 4,
    tasksTotal: 20,
  },
  {
    id: "4",
    name: "Thornbury Gala Dinner",
    client: "Thornbury CC",
    date: "5 Jul 2026",
    guests: 200,
    status: "confirmed",
    owner: "MR",
    venue: "Thornbury Castle",
    tasksDone: 12,
    tasksTotal: 22,
  },
  {
    id: "5",
    name: "Blake Corporate Away",
    client: "Blake Finance",
    date: "12 Jul 2026",
    guests: 45,
    status: "briefing",
    owner: "JT",
    venue: "Blenheim Palace",
    tasksDone: 2,
    tasksTotal: 18,
  },
  {
    id: "6",
    name: "Winters 40th",
    client: "P. Winters",
    date: "20 Jul 2026",
    guests: 80,
    status: "new-enquiry",
    owner: "KL",
    venue: "TBC",
    tasksDone: 0,
    tasksTotal: 10,
  },
];

type ViewMode = "list" | "grid" | "calendar";

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [view, setView] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = selected.size === EVENTS.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(EVENTS.map((e) => e.id)));
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

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
              href="/app/events/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New Event
            </Link>
          </>
        }
        tabs={
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={cn(
                  "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  i === activeTab
                    ? "text-brand-600 border-brand-600"
                    : "text-surface-500 border-transparent hover:text-surface-900 hover:border-surface-300"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        }
      />

      {/* KPIs */}
      <div className="p-6 space-y-6 max-w-[1400px]">
        <KPIGrid className="grid-cols-2 sm:grid-cols-4">
          <MetricCard
            label="Active Events"
            value="12"
            icon={CalendarDays}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
          <MetricCard
            label="Confirmed"
            value="7"
            icon={CalendarDays}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Awaiting Approval"
            value="3"
            icon={CheckSquare}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
          <MetricCard
            label="At Risk"
            value="1"
            icon={AlertTriangle}
            iconColor="text-danger-600"
            iconBg="bg-danger-50"
          />
        </KPIGrid>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Filter className="w-4 h-4" strokeWidth={1.8} />
              Filter
            </button>

            {/* Bulk actions — shown only when rows selected */}
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
                view === "list"
                  ? "bg-brand-50 text-brand-600"
                  : "text-surface-400 hover:bg-surface-50"
              )}
              title="List view"
            >
              <List className="w-4 h-4" strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-2 border-r border-surface-200 transition-colors",
                view === "grid"
                  ? "bg-brand-50 text-brand-600"
                  : "text-surface-400 hover:bg-surface-50"
              )}
              title="Card view"
            >
              <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setView("calendar")}
              className={cn(
                "p-2 transition-colors",
                view === "calendar"
                  ? "bg-brand-50 text-brand-600"
                  : "text-surface-400 hover:bg-surface-50"
              )}
              title="Calendar view"
            >
              <Calendar className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* ── Calendar View ──────────────────────────────────────────────────── */}
        {view === "calendar" && (
          <EmptyState
            icon={CalendarOff}
            title="Calendar view coming soon"
            description="We're building a full calendar view so you can see all your events plotted on a timeline. Check back in the next release."
          />
        )}

        {/* ── Card / Grid View ───────────────────────────────────────────────── */}
        {view === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {EVENTS.map((event) => (
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

        {/* ── List / Table View ──────────────────────────────────────────────── */}
        {view === "list" && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  {/* Bulk select all */}
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">
                    Guests
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {EVENTS.map((event) => {
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
                        isSelected
                          ? "bg-brand-50"
                          : "hover:bg-surface-50"
                      )}
                    >
                      {/* Checkbox */}
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
                          href={`/app/events/${event.id}`}
                          className="font-medium text-surface-900 hover:text-brand-600 transition-colors"
                        >
                          {event.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-surface-500 hidden md:table-cell">
                        {event.client}
                      </td>
                      <td className="px-4 py-3 text-surface-500 hidden lg:table-cell whitespace-nowrap">
                        {event.date}
                      </td>
                      <td className="px-4 py-3 text-surface-500 hidden lg:table-cell">
                        {event.guests}
                      </td>
                      {/* Progress bar */}
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
    </div>
  );
}
