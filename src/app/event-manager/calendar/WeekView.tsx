"use client";

import Image from "next/image";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  weekGrid,
  weekDayLabels,
  timeToPx,
  durationToPx,
  timeToMinutes,
  formatTime,
  timeAxisHours,
} from "./grid";
import type {
  CalendarItem,
  TeamMember,
  UpcomingHighlight,
  ResourceBooking,
  UpcomingDeadline,
  ViewMode,
} from "./types";
import { BADGE_STYLES, BLOCK_BG, BLOCK_BORDER, BLOCK_TEXT } from "./types";

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 23;
const PX_PER_HOUR = 64;
const TIME_COL_WIDTH = 52;

interface WeekViewProps {
  dateISO: string;
  items: CalendarItem[];
  team: TeamMember[];
  highlights: UpcomingHighlight[];
  deadlines: UpcomingDeadline[];
  resources: ResourceBooking[];
  todayISO: string;
  onNavigate: (view: ViewMode, date: string) => void;
}

export function WeekView({
  dateISO,
  items,
  team,
  highlights,
  deadlines,
  resources,
  todayISO,
  onNavigate,
}: WeekViewProps) {
  const wg = weekGrid(dateISO);
  const dayLabels = weekDayLabels(wg.days);
  const axisHours = timeAxisHours(GRID_START_HOUR, GRID_END_HOUR);
  const totalGridHeight = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;

  // Separate all-day / multi-day from timed events
  const allDayItems = useMemo(
    () => items.filter((it) => it.allDay || it.multiDay),
    [items]
  );

  const timedItems = useMemo(
    () => items.filter((it) => !it.allDay && !it.multiDay),
    [items]
  );

  // Group timed items by day
  const timedByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of timedItems) {
      const day = it.startsAt.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(it);
      map.set(day, list);
    }
    return map;
  }, [timedItems]);

  // Compute all-day spans (which days in this week they cover)
  const allDaySpans = useMemo(() => {
    return allDayItems.map((it) => {
      const itemStart = it.startsAt.slice(0, 10);
      const itemEnd = (it.endsAt ?? it.startsAt).slice(0, 10);
      const weekStart = wg.days[0];
      const weekEnd = wg.days[6];
      const effectiveStart = itemStart < weekStart ? weekStart : itemStart;
      const effectiveEnd = itemEnd > weekEnd ? weekEnd : itemEnd;
      const colStart = wg.days.indexOf(effectiveStart);
      const colEnd = wg.days.indexOf(effectiveEnd);
      return {
        item: it,
        colStart: colStart >= 0 ? colStart : 0,
        colEnd: colEnd >= 0 ? colEnd : 6,
      };
    });
  }, [allDayItems, wg.days]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Week time grid ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Day header row */}
        <div
          className="flex border-b border-surface-200 shrink-0 bg-white"
          style={{ paddingLeft: TIME_COL_WIDTH }}
        >
          {dayLabels.map(({ short, num, iso }) => {
            const isToday = iso === todayISO;
            return (
              <div
                key={iso}
                className="flex-1 flex flex-col items-center py-2 cursor-pointer hover:bg-surface-50 transition-colors border-l border-surface-100"
                onClick={() => onNavigate("day", iso)}
              >
                <span className={cn("text-[11px] font-medium uppercase", isToday ? "text-brand-600" : "text-surface-400")}>
                  {short}
                </span>
                <span
                  className={cn(
                    "w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold mt-0.5",
                    isToday ? "bg-brand-600 text-white" : "text-surface-700"
                  )}
                >
                  {num}
                </span>
              </div>
            );
          })}
        </div>

        {/* All-day row */}
        {allDaySpans.length > 0 && (
          <div
            className="flex border-b border-surface-200 shrink-0 bg-surface-50 relative overflow-hidden"
            style={{ paddingLeft: TIME_COL_WIDTH, minHeight: "36px" }}
          >
            {/* Grid column lines */}
            <div className="absolute inset-y-0 left-[52px] right-0 flex pointer-events-none">
              {wg.days.map((d) => (
                <div key={d} className="flex-1 border-l border-surface-100" />
              ))}
            </div>
            {/* All-day events */}
            <div className="absolute inset-y-0 left-[52px] right-0 flex flex-col gap-0.5 p-1">
              {allDaySpans.map(({ item, colStart, colEnd }) => {
                const span = colEnd - colStart + 1;
                return (
                  <AllDayBanner key={item.id} item={item} colStart={colStart} span={span} totalCols={7} />
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable time grid */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex relative" style={{ height: totalGridHeight }}>
            {/* Time axis */}
            <div
              className="shrink-0 flex flex-col relative"
              style={{ width: TIME_COL_WIDTH }}
            >
              {axisHours.map((label, i) => (
                <div
                  key={label}
                  className="absolute text-[10px] text-surface-400 text-right pr-2 leading-none"
                  style={{ top: i * PX_PER_HOUR - 6, right: 0, width: TIME_COL_WIDTH }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* 7-column event grid */}
            <div className="flex-1 flex relative">
              {/* Horizontal hour lines */}
              <div className="absolute inset-0 pointer-events-none">
                {axisHours.map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-full border-t border-surface-100"
                    style={{ top: i * PX_PER_HOUR }}
                  />
                ))}
              </div>

              {/* Day columns */}
              {wg.days.map((dayISO, colIdx) => {
                const isToday = dayISO === todayISO;
                const dayItems = timedByDay.get(dayISO) ?? [];
                return (
                  <div
                    key={dayISO}
                    className={cn(
                      "flex-1 relative border-l border-surface-100 cursor-pointer",
                      isToday && "bg-brand-50/20"
                    )}
                    onClick={() => onNavigate("day", dayISO)}
                  >
                    {dayItems.map((it) => (
                      <WeekEventBlock key={it.id} item={it} colIdx={colIdx} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-l border-surface-200 bg-white flex flex-col overflow-y-auto hidden lg:flex">
        {/* Today's Highlights */}
        <div className="p-4 border-b border-surface-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            This Week
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <WeekStatCard value="5" label="Events" color="text-blue-600" />
            <WeekStatCard value="4" label="RS Checkpoints" color="text-brand-600" />
            <WeekStatCard value="3" label="Tasks Due" color="text-amber-600" />
            <WeekStatCard value="2" label="Deliveries" color="text-green-600" />
          </div>
        </div>

        {/* Team Availability */}
        <div className="p-4 border-b border-surface-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Team Availability
            </h3>
            <button className="text-[11px] text-brand-600 hover:underline">View all</button>
          </div>
          <div className="space-y-2.5">
            {team.slice(0, 4).map((m) => (
              <div key={m.name} className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: m.avatarColor }}
                >
                  {m.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium text-surface-700 truncate">{m.name}</span>
                    <span className={cn(
                      "text-[10px] font-semibold shrink-0 ml-1",
                      m.load > 80 ? "text-red-600" : m.load > 60 ? "text-amber-600" : "text-green-600"
                    )}>
                      {100 - m.load}% free
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-400"
                      style={{ width: `${100 - m.load}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="p-4 border-b border-surface-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Upcoming Deadlines
          </h3>
          <div className="space-y-2">
            {deadlines.map((d) => (
              <div key={d.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-surface-900 truncate">{d.title}</div>
                  {d.subtitle && <div className="text-[11px] text-surface-400 truncate">{d.subtitle}</div>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", BADGE_STYLES[d.badgeType])}>
                      {d.badgeLabel}
                    </span>
                    <span className="text-[10px] text-amber-600 font-medium">{d.dueLabel}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resource Bookings */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Resource Bookings
            </h3>
            <button className="text-[11px] text-brand-600 hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {resources.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                {r.imageUrl ? (
                  <div className="w-9 h-9 rounded-lg overflow-hidden relative shrink-0">
                    <Image src={r.imageUrl} alt={r.name} fill className="object-cover" sizes="36px" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-brand-50 shrink-0 flex items-center justify-center text-brand-400 text-sm">
                    ⌂
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-surface-900 truncate">{r.name}</div>
                  <div className="text-[11px] text-surface-400">{r.dateRange}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── All-day banner (week) ─────────────────────────────────────────────────────
function AllDayBanner({
  item,
  colStart,
  span,
  totalCols,
}: {
  item: CalendarItem;
  colStart: number;
  span: number;
  totalCols: number;
}) {
  const leftPct = (colStart / totalCols) * 100;
  const widthPct = (span / totalCols) * 100;

  const isImage = !!item.imageUrl;

  return (
    <div
      className="absolute top-1 h-7 rounded overflow-hidden flex items-center px-2 gap-1.5 cursor-pointer hover:opacity-90 transition-opacity"
      style={{
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 2px)`,
        background: isImage ? undefined : undefined,
      }}
    >
      {isImage && (
        <Image src={item.imageUrl!} alt="" fill className="object-cover" sizes="400px" />
      )}
      <div
        className={cn(
          "absolute inset-0",
          item.badgeType === "corporate" ? "bg-[#0e0c27]/80" :
          item.badgeType === "theatre" ? "bg-purple-900/80" :
          item.badgeType === "festival" ? "bg-teal-800/80" :
          "bg-brand-700/80"
        )}
      />
      <span className="relative z-10 text-white text-[11px] font-semibold truncate">
        {item.title}
      </span>
      <span className={cn("relative z-10 shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-white/20 text-white")}>
        {item.badgeLabel}
      </span>
    </div>
  );
}

// ─── Week event block ──────────────────────────────────────────────────────────
function WeekEventBlock({ item }: { item: CalendarItem; colIdx: number }) {
  const startMins = timeToMinutes(item.startsAt);
  const endMins = item.endsAt ? timeToMinutes(item.endsAt) : startMins + 60;
  const durationMins = Math.max(endMins - startMins, 30);

  const startH = Math.floor(startMins / 60);
  const startM = startMins % 60;

  // Clamp to grid
  if (startH < GRID_START_HOUR || startH >= GRID_END_HOUR) return null;

  const top = timeToPx(startH, startM, GRID_START_HOUR, PX_PER_HOUR);
  const height = Math.max(durationToPx(durationMins, PX_PER_HOUR), 22);

  return (
    <div
      className={cn(
        "absolute left-0.5 right-0.5 rounded border-l-2 px-1.5 overflow-hidden cursor-pointer hover:shadow-md transition-shadow z-10",
        BLOCK_BG[item.badgeType],
        BLOCK_BORDER[item.badgeType],
        BLOCK_TEXT[item.badgeType]
      )}
      style={{ top, height }}
      title={item.title}
    >
      <div className="flex items-start gap-1 h-full">
        <div className="flex-1 min-w-0 py-0.5">
          <div className="text-[10px] font-semibold leading-tight truncate">{item.title}</div>
          {height > 32 && (
            <div className="text-[9px] opacity-70 leading-tight truncate">
              {formatTime(item.startsAt)}
              {item.endsAt && ` – ${formatTime(item.endsAt)}`}
            </div>
          )}
        </div>
        {item.imageUrl && height > 40 && (
          <div className="w-8 h-8 rounded overflow-hidden relative shrink-0 mt-0.5">
            <Image src={item.imageUrl} alt="" fill className="object-cover" sizes="32px" />
          </div>
        )}
      </div>
    </div>
  );
}

function WeekStatCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-surface-50 border border-surface-100">
      <div className={cn("text-xl font-bold leading-none", color)}>{value}</div>
      <div className="text-[11px] text-surface-400 mt-0.5">{label}</div>
    </div>
  );
}
