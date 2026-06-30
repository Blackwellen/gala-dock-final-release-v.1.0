"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Plus, Users, Clipboard, ChevronDown, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeToPx, durationToPx, formatTime, timeAxisHours, dayLabel } from "./grid";
import type { DayLaneItem, TeamMember, Guest, ViewMode } from "./types";
import { BLOCK_BG, BLOCK_BORDER, BLOCK_TEXT, BADGE_STYLES } from "./types";

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 24;
const PX_PER_HOUR = 72;
const TIME_COL_WIDTH = 52;

const LANES = [
  { key: "main_event", label: "Main Event", icon: "🎪" },
  { key: "task", label: "Tasks", icon: "✓" },
  { key: "supplier_booking", label: "Suppliers", icon: "🔧" },
  { key: "team", label: "Team", icon: "👥" },
  { key: "venue_booking", label: "Venue Bookings", icon: "🏛" },
] as const;

interface DayViewProps {
  dateISO: string;
  items: DayLaneItem[];
  guests: Guest[];
  teamOnDuty: TeamMember[];
  todayISO: string;
  onNavigate: (view: ViewMode, date: string) => void;
}

export function DayView({ dateISO, items, guests, teamOnDuty, todayISO }: DayViewProps) {
  const isToday = dateISO === todayISO;
  const label = dayLabel(dateISO);
  const axisHours = timeAxisHours(GRID_START_HOUR, GRID_END_HOUR);
  const totalGridHeight = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const byLane = useMemo(() => {
    const map = new Map<string, DayLaneItem[]>();
    for (const it of items) {
      const lane = it.laneType ?? "main_event";
      const list = map.get(lane) ?? [];
      list.push(it);
      map.set(lane, list);
    }
    return map;
  }, [items]);

  const mainEvent = useMemo(() => items.find((it) => it.laneType === "main_event"), [items]);
  const openTasksCount = byLane.get("task")?.length ?? 0;
  const taskDone = Math.floor(openTasksCount * 0.4);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Day lane grid ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Column headers */}
        <div
          className="flex shrink-0 border-b border-surface-200 bg-surface-50"
          style={{ paddingLeft: TIME_COL_WIDTH }}
        >
          {LANES.map((lane) => (
            <div
              key={lane.key}
              className="flex-1 flex items-center gap-1.5 px-2 py-2 border-l border-surface-100 text-[11px] font-semibold text-surface-600"
            >
              <span>{lane.icon}</span>
              <span className="truncate">{lane.label}</span>
              <span className="ml-auto text-surface-400 font-normal text-[10px]">
                {byLane.get(lane.key)?.length ?? 0}
              </span>
            </div>
          ))}
        </div>

        {/* Date header */}
        <div
          className="flex shrink-0 items-center gap-2 px-2 py-2 border-b border-surface-100"
          style={{ paddingLeft: TIME_COL_WIDTH + 8 }}
        >
          <span className={cn("text-sm font-semibold", isToday ? "text-brand-600" : "text-surface-700")}>
            {label}
          </span>
          {isToday && (
            <span className="text-[10px] font-medium bg-brand-600 text-white px-2 py-0.5 rounded-full">
              Today
            </span>
          )}
        </div>

        {/* Scrollable time grid */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex relative" style={{ height: totalGridHeight }}>
            {/* Time axis */}
            <div className="shrink-0 relative" style={{ width: TIME_COL_WIDTH }}>
              {axisHours.map((lbl, i) => (
                <div
                  key={lbl}
                  className="absolute text-[10px] text-surface-400 text-right pr-2 leading-none"
                  style={{ top: i * PX_PER_HOUR - 6, right: 0, width: TIME_COL_WIDTH }}
                >
                  {lbl}
                </div>
              ))}
            </div>

            {/* Lane columns */}
            <div className="flex-1 flex relative">
              {/* Hour lines */}
              <div className="absolute inset-0 pointer-events-none">
                {axisHours.map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-full border-t border-surface-100"
                    style={{ top: i * PX_PER_HOUR }}
                  />
                ))}
              </div>

              {LANES.map((lane) => {
                const laneItems = byLane.get(lane.key) ?? [];
                return (
                  <div key={lane.key} className="flex-1 relative border-l border-surface-100">
                    {laneItems.map((it) => (
                      <DayLaneBlock key={it.id} item={it} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <aside className="w-[272px] shrink-0 border-l border-surface-200 bg-white flex flex-col overflow-y-auto hidden lg:flex">
        {/* Main event card */}
        {mainEvent && (
          <div className="relative overflow-hidden shrink-0" style={{ height: 136 }}>
            {mainEvent.imageUrl ? (
              <Image src={mainEvent.imageUrl} alt={mainEvent.title} fill className="object-cover" sizes="272px" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#0e0c27] to-[#4F46E5]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <div className="mb-1">
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded", BADGE_STYLES[mainEvent.badgeType])}>
                  {mainEvent.badgeLabel}
                </span>
              </div>
              <div className="text-white font-bold text-sm leading-tight truncate">{mainEvent.title}</div>
              <div className="flex items-center gap-3 mt-1.5">
                {mainEvent.venueName && (
                  <span className="flex items-center gap-1 text-white/70 text-[10px]">
                    <MapPin className="w-2.5 h-2.5" />
                    {mainEvent.venueName}
                  </span>
                )}
                <span className="flex items-center gap-1 text-white/70 text-[10px]">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(mainEvent.startsAt)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Guests */}
        <div className="p-4 border-b border-surface-100">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5 text-surface-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Upcoming Guests
            </h3>
            <span className="ml-auto text-[11px] font-semibold text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
              {guests.length}
            </span>
          </div>
          <div className="space-y-2">
            {guests.slice(0, 5).map((g) => (
              <div key={g.id} className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: g.avatarColor ?? "#4F46E5" }}
                >
                  {g.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-surface-900 truncate">{g.name}</div>
                  {g.role && <div className="text-[10px] text-surface-400 truncate">{g.role}</div>}
                </div>
                <span className={cn(
                  "shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded",
                  g.status === "confirmed" ? "bg-green-100 text-green-700" :
                  g.status === "pending" ? "bg-amber-100 text-amber-700" :
                  "bg-surface-100 text-surface-500"
                )}>
                  {g.status}
                </span>
              </div>
            ))}
            {guests.length > 5 && (
              <button className="flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
                +{guests.length - 5} more guests
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Team on Duty */}
        <div className="p-4 border-b border-surface-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Team on Duty</h3>
            <span className="text-[11px] text-surface-400">{teamOnDuty.length} staff</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {teamOnDuty.map((m) => (
              <div key={m.name} className="flex items-center gap-1.5 bg-surface-50 rounded-full pl-0.5 pr-2.5 py-0.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                  style={{ backgroundColor: m.avatarColor }}
                >
                  {m.initials}
                </div>
                <span className="text-[10px] font-medium text-surface-700">{m.name.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Open Tasks donut */}
        <div className="p-4 border-b border-surface-100">
          <div className="flex items-center gap-2 mb-3">
            <Clipboard className="w-3.5 h-3.5 text-surface-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Open Tasks</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 shrink-0">
              <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                <circle
                  cx="18" cy="18" r="14"
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="4"
                  strokeDasharray={`${(taskDone / Math.max(openTasksCount, 1)) * 87.96} 87.96`}
                />
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-sm font-bold text-surface-900 leading-none">{taskDone}</span>
                <span className="text-[9px] text-surface-400">done</span>
              </span>
            </div>
            <div className="space-y-1.5">
              <TaskStatusRow color="bg-brand-500" label="In Progress" count={Math.floor(openTasksCount * 0.3)} />
              <TaskStatusRow color="bg-green-500" label="Done" count={taskDone} />
              <TaskStatusRow color="bg-amber-400" label="Pending" count={Math.max(0, openTasksCount - taskDone - Math.floor(openTasksCount * 0.3))} />
            </div>
          </div>
        </div>

        {/* Quick Add */}
        <div className="p-4">
          <button
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-brand-600 border border-dashed border-brand-300 rounded-lg hover:bg-brand-50 transition-colors"
            onClick={() => setQuickAddOpen(!quickAddOpen)}
          >
            <Plus className="w-3.5 h-3.5" />
            Quick Add
          </button>
          {quickAddOpen && (
            <div className="mt-2 space-y-1">
              {[
                { label: "Add Task", icon: "✓", color: "text-amber-600 hover:bg-amber-50" },
                { label: "Add Note", icon: "📝", color: "text-surface-600 hover:bg-surface-50" },
                { label: "Add Reminder", icon: "⏰", color: "text-blue-600 hover:bg-blue-50" },
                { label: "Add Supplier", icon: "🔧", color: "text-green-600 hover:bg-green-50" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                    opt.color
                  )}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function DayLaneBlock({ item }: { item: DayLaneItem }) {
  const top = timeToPx(item.startHour, item.startMinute, GRID_START_HOUR, PX_PER_HOUR);
  const height = Math.max(durationToPx(item.durationMinutes, PX_PER_HOUR), 26);

  if (item.startHour < GRID_START_HOUR || item.startHour >= GRID_END_HOUR) return null;

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded-lg border overflow-hidden cursor-pointer hover:shadow-md transition-shadow z-10",
        BLOCK_BG[item.badgeType],
        BLOCK_BORDER[item.badgeType]
      )}
      style={{ top, height }}
      title={item.title}
    >
      <div className={cn("pl-2 pr-1 py-1 h-full flex flex-col justify-center", BLOCK_TEXT[item.badgeType])}>
        {item.imageUrl && height > 50 ? (
          <div className="flex gap-1.5 items-center h-full">
            <div className="w-9 h-9 rounded overflow-hidden relative shrink-0">
              <Image src={item.imageUrl} alt="" fill className="object-cover" sizes="36px" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold leading-tight truncate">{item.title}</div>
              {height > 46 && (
                <div className="text-[9px] opacity-60 leading-tight">
                  {String(item.startHour).padStart(2, "0")}:{String(item.startMinute).padStart(2, "0")}
                  {item.durationMinutes ? ` · ${item.durationMinutes}m` : ""}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="text-[10px] font-semibold leading-tight truncate">{item.title}</div>
            {height > 32 && (
              <div className="text-[9px] opacity-60 leading-tight">
                {String(item.startHour).padStart(2, "0")}:{String(item.startMinute).padStart(2, "0")}
                {item.durationMinutes ? ` · ${item.durationMinutes}m` : ""}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TaskStatusRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-2 h-2 rounded-full shrink-0", color)} />
      <span className="text-[11px] text-surface-500 flex-1">{label}</span>
      <span className="text-[11px] font-semibold text-surface-700">{count}</span>
    </div>
  );
}
