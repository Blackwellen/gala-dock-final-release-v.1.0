"use client";

import Image from "next/image";
import { useMemo } from "react";
import { MoreHorizontal, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { groupByDate, formatTimeRange, agendaDateParts } from "./grid";
import type {
  CalendarItem,
  CalendarSummary,
  TeamMember,
  UpcomingHighlight,
  OverdueItem,
  ViewMode,
} from "./types";
import { BADGE_STYLES } from "./types";

interface AgendaViewProps {
  dateISO: string;
  items: CalendarItem[];
  summary: CalendarSummary;
  team: TeamMember[];
  highlights: UpcomingHighlight[];
  overdue: OverdueItem[];
  todayISO: string;
  onNavigate: (view: ViewMode, date: string) => void;
}

const SOURCE_ICONS: Record<string, string> = {
  task: "✓",
  run_sheet: "≡",
  finance: "$",
  venue_booking: "⌂",
  supplier_booking: "⚙",
};

export function AgendaView({
  items,
  summary,
  team,
  highlights,
  overdue,
  todayISO,
  onNavigate,
}: AgendaViewProps) {
  const groups = useMemo(() => groupByDate(items), [items]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Agenda list ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center px-4 py-2 bg-white border-b border-surface-200 shrink-0">
          <div className="w-[88px] shrink-0" /> {/* date tile */}
          <div className="w-[52px] shrink-0" /> {/* thumb */}
          <div className="flex-1" /> {/* title */}
          <div className="hidden md:block w-[120px] shrink-0 text-[11px] font-medium text-surface-400 text-center">Time</div>
          <div className="hidden lg:block w-[160px] shrink-0 text-[11px] font-medium text-surface-400">Venue / Platform</div>
          <div className="hidden xl:block w-[160px] shrink-0 text-[11px] font-medium text-surface-400">Owner</div>
          <div className="hidden md:block w-[100px] shrink-0 text-[11px] font-medium text-surface-400 text-right">Status</div>
          <div className="w-8 shrink-0" />
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto bg-surface-50">
          {groups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-surface-400">
              <div className="text-3xl mb-3">📅</div>
              <p className="text-sm font-medium">No items in this range</p>
              <p className="text-xs mt-1">Switch the date range or add new items</p>
            </div>
          )}

          {groups.map(([dayISO, dayItems]) => {
            const isToday = dayISO === todayISO;
            const parts = agendaDateParts(dayISO);
            const weekday = new Date(dayISO + "T00:00:00Z").toLocaleDateString("en-GB", {
              weekday: "long",
              timeZone: "UTC",
            });

            return (
              <div key={dayISO}>
                {/* Day header */}
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 sticky top-0 z-10 border-b border-surface-200",
                    isToday ? "bg-brand-50 border-brand-100" : "bg-surface-100"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isToday ? "text-brand-700" : "text-surface-500"
                    )}
                  >
                    {isToday ? "Today • " : ""}{weekday}, {parts.day} {parts.month}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      isToday ? "bg-brand-100 text-brand-700" : "bg-surface-200 text-surface-500"
                    )}
                  >
                    {dayItems.length}
                  </span>
                </div>

                {/* Day's items */}
                {dayItems.map((item) => (
                  <AgendaRow key={item.id} item={item} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-l border-surface-200 bg-white flex flex-col overflow-y-auto hidden lg:flex">
        {/* Agenda Summary */}
        <div className="p-4 border-b border-surface-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Agenda Summary
          </h3>
          {/* Donut chart (CSS-only) */}
          <div className="flex items-center gap-4 mb-3">
            <DonutChart summary={summary} />
            <div className="space-y-1.5">
              <LegendItem color="bg-blue-500" label="Events" count={summary.eventCount} />
              <LegendItem color="bg-amber-500" label="Tasks" count={summary.taskCount} />
              <LegendItem color="bg-green-500" label="Bookings" count={summary.bookingCount} />
              <LegendItem color="bg-brand-500" label="Run Sheets" count={summary.runSheetCount} />
            </div>
          </div>
          <div className="text-center text-xs text-surface-500">
            <span className="font-semibold text-surface-900">{summary.totalItems}</span> total
            <span className="mx-2">·</span>
            <span className="text-amber-600 font-semibold">{summary.dueTodayCount}</span> due today
            {summary.overdueCount > 0 && (
              <>
                <span className="mx-2">·</span>
                <span className="text-red-600 font-semibold">{summary.overdueCount}</span> overdue
              </>
            )}
          </div>
        </div>

        {/* Upcoming Highlights */}
        <div className="p-4 border-b border-surface-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Upcoming Highlights
          </h3>
          <div className="space-y-2">
            {highlights.slice(0, 3).map((h) => (
              <div key={h.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                <div className="shrink-0 w-9 text-center">
                  <div className="text-[10px] font-semibold text-brand-600 uppercase">{h.month}</div>
                  <div className="text-lg font-bold text-surface-900 leading-tight">{h.day}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-surface-900 truncate">{h.title}</div>
                  {h.time && <div className="text-[11px] text-surface-400">{h.time}</div>}
                  <span className={cn("inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium", BADGE_STYLES[h.badgeType])}>
                    {h.badgeLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Load */}
        <div className="p-4 border-b border-surface-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Team Load — Next 7 Days
          </h3>
          <div className="space-y-2.5">
            {team.slice(0, 4).map((m) => (
              <div key={m.name} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: m.avatarColor }}
                >
                  {m.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium text-surface-700 truncate">{m.name}</span>
                    <span className="text-[11px] text-surface-500 shrink-0 ml-1">{m.load}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        m.load > 80 ? "bg-red-500" : m.load > 60 ? "bg-amber-500" : "bg-green-500"
                      )}
                      style={{ width: `${m.load}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overdue / Needs Attention */}
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Overdue / Needs Attention
          </h3>
          {overdue.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">No overdue items</p>
          ) : (
            <div className="space-y-2">
              {overdue.map((o) => (
                <div key={o.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-red-50 border border-red-100">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-surface-900 truncate">{o.title}</div>
                    {o.subtitle && <div className="text-[11px] text-surface-500 truncate">{o.subtitle}</div>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", BADGE_STYLES[o.badgeType])}>
                        {o.badgeLabel}
                      </span>
                      <span className={cn(
                        "text-[10px] font-semibold",
                        o.dueUrgency === "overdue" ? "text-red-600" : "text-amber-600"
                      )}>
                        {o.dueLabel}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Agenda row ────────────────────────────────────────────────────────────────
function AgendaRow({ item }: { item: CalendarItem }) {
  const hasImage = !!item.imageUrl;
  const iconChar = SOURCE_ICONS[item.sourceType] ?? "•";

  return (
    <div className="flex items-center gap-0 px-4 py-2.5 border-b border-surface-100 hover:bg-white transition-colors cursor-pointer group">
      {/* Date tile (visible if it's the first item of day — handled by parent, here as spacer) */}
      <div className="w-[88px] shrink-0" />

      {/* Thumbnail or icon */}
      <div className="w-[48px] shrink-0 pr-3">
        {hasImage ? (
          <div className="w-10 h-10 rounded-lg overflow-hidden relative">
            <Image src={item.imageUrl!} alt="" fill className="object-cover" sizes="40px" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center text-surface-400 text-base font-mono">
            {iconChar}
          </div>
        )}
      </div>

      {/* Title + badge */}
      <div className="flex-1 min-w-0 pr-3">
        <div className="text-sm font-semibold text-surface-900 truncate">{item.title}</div>
        {item.subtitle && (
          <div className="text-[11px] text-surface-400 truncate">{item.subtitle}</div>
        )}
        <span className={cn("inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium", BADGE_STYLES[item.badgeType])}>
          {item.badgeLabel}
        </span>
      </div>

      {/* Time */}
      <div className="hidden md:block w-[120px] shrink-0 text-[11px] text-surface-500 text-center">
        {item.allDay ? "All day" : formatTimeRange(item.startsAt, item.endsAt)}
      </div>

      {/* Venue / Platform */}
      <div className="hidden lg:block w-[160px] shrink-0 pr-3">
        {(item.venueName || item.platformName) ? (
          <div className="text-[11px] text-surface-600 truncate">
            {item.venueName ?? item.platformName}
          </div>
        ) : (
          <div className="text-[11px] text-surface-300">—</div>
        )}
        {item.venueRoom && (
          <div className="text-[10px] text-surface-400 truncate">{item.venueRoom}</div>
        )}
      </div>

      {/* Owner */}
      <div className="hidden xl:flex items-center gap-2 w-[160px] shrink-0 pr-3">
        {item.owner && (
          <>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
              style={{ backgroundColor: item.owner.avatarColor ?? "#6366f1" }}
            >
              {item.owner.initials}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-surface-700 truncate">{item.owner.name}</div>
              <div className="text-[10px] text-surface-400 truncate">{item.owner.role}</div>
            </div>
          </>
        )}
      </div>

      {/* Status */}
      <div className="hidden md:flex w-[100px] shrink-0 justify-end pr-2">
        <StatusBadge status={item.status} />
      </div>

      {/* Actions */}
      <div className="w-8 shrink-0 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1 rounded hover:bg-surface-100 text-surface-400">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-green-50 text-green-700 border border-green-200",
    scheduled: "bg-blue-50 text-blue-700 border border-blue-200",
    in_progress: "bg-brand-50 text-brand-700 border border-brand-200",
    completed: "bg-surface-100 text-surface-500 border border-surface-200",
    due_today: "bg-amber-50 text-amber-700 border border-amber-200",
    pending: "bg-surface-50 text-surface-500 border border-surface-200",
    draft: "bg-surface-100 text-surface-400 border border-surface-200",
    published: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    overdue: "bg-red-50 text-red-700 border border-red-200",
  };
  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap", map[status] ?? map.pending)}>
      {label}
    </span>
  );
}

// ─── Donut chart (CSS conic-gradient) ─────────────────────────────────────────
function DonutChart({ summary }: { summary: CalendarSummary }) {
  const total = summary.totalItems || 1;
  const eventPct = (summary.eventCount / total) * 100;
  const taskPct = (summary.taskCount / total) * 100;
  const bookingPct = (summary.bookingCount / total) * 100;
  const runSheetPct = (summary.runSheetCount / total) * 100;

  const e1 = eventPct;
  const e2 = e1 + taskPct;
  const e3 = e2 + bookingPct;

  return (
    <div
      className="w-16 h-16 rounded-full shrink-0"
      style={{
        background: `conic-gradient(
          #3b82f6 0% ${e1}%,
          #f59e0b ${e1}% ${e2}%,
          #10b981 ${e2}% ${e3}%,
          #6366f1 ${e3}% 100%
        )`,
      }}
    >
      <div className="w-full h-full rounded-full bg-white m-[6px]" style={{ width: "calc(100% - 12px)", height: "calc(100% - 12px)" }} />
    </div>
  );
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", color)} />
      <span className="text-surface-600 flex-1">{label}</span>
      <span className="font-semibold text-surface-900">{count}</span>
    </div>
  );
}
