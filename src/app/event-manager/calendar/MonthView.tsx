"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Users, CalendarDays, CheckSquare, FileText, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthGrid, WEEKDAY_LABELS, formatTime } from "./grid";
import type {
  CalendarItem,
  CalendarSummary,
  TeamMember,
  UpcomingHighlight,
  ViewMode,
} from "./types";
import { BADGE_STYLES } from "./types";

// Hours 1-12 for the time axis colour
const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899"];

interface MonthViewProps {
  dateISO: string;
  items: CalendarItem[];
  summary: CalendarSummary;
  team: TeamMember[];
  highlights: UpcomingHighlight[];
  todayISO: string;
  onNavigate: (view: ViewMode, date: string) => void;
}

export function MonthView({
  dateISO,
  items,
  summary,
  team,
  highlights,
  todayISO,
  onNavigate,
}: MonthViewProps) {
  const grid = monthGrid(dateISO.slice(0, 7));
  const { days, month, year } = grid;

  // Group all items by their start date
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const day = it.startsAt.slice(0, 10);
      if (!day) continue;
      const list = map.get(day) ?? [];
      list.push(it);
      map.set(day, list);
    }
    return map;
  }, [items]);

  // Find the single multi-day banner (if any)
  const multiDayBanner = useMemo(
    () => items.find((it) => it.multiDay && it.allDay),
    [items]
  );

  // Determine which week row the banner occupies (row index 0–5)
  const bannerRowInfo = useMemo(() => {
    if (!multiDayBanner) return null;
    const startDate = multiDayBanner.startsAt.slice(0, 10);
    const endDate = (multiDayBanner.endsAt ?? multiDayBanner.startsAt).slice(0, 10);
    const idx = days.findIndex((d) => d >= startDate && d <= endDate);
    if (idx < 0) return null;
    const rowIndex = Math.floor(idx / 7);
    const rowStartDay = days[rowIndex * 7];
    const rowEndDay = days[rowIndex * 7 + 6];
    const effectiveStart = startDate < rowStartDay ? rowStartDay : startDate;
    const effectiveEnd = endDate > rowEndDay ? rowEndDay : endDate;
    const colStart = days.indexOf(effectiveStart) - rowIndex * 7;
    const colEnd = days.indexOf(effectiveEnd) - rowIndex * 7;
    return { rowIndex, colStart, colEnd: colEnd >= 0 ? colEnd : 6 };
  }, [multiDayBanner, days]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Calendar grid ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-surface-200 bg-white shrink-0">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-400"
            >
              {label}
            </div>
          ))}
        </div>

        {/* 6-week grid */}
        <div className="flex-1 overflow-y-auto bg-surface-50">
          {Array.from({ length: 6 }).map((_, rowIdx) => {
            const rowDays = days.slice(rowIdx * 7, rowIdx * 7 + 7);
            const isBannerRow = bannerRowInfo?.rowIndex === rowIdx;

            return (
              <div
                key={rowIdx}
                className="grid grid-cols-7 border-b border-surface-200 relative"
                style={{ minHeight: isBannerRow ? "160px" : "110px" }}
              >
                {/* Multi-day banner overlay */}
                {isBannerRow && multiDayBanner && bannerRowInfo && (
                  <MultiDayBanner
                    item={multiDayBanner}
                    colStart={bannerRowInfo.colStart}
                    colEnd={bannerRowInfo.colEnd}
                  />
                )}

                {rowDays.map((dayISO, colIdx) => {
                  const inMonth = parseInt(dayISO.slice(5, 7)) === month;
                  const isToday = dayISO === todayISO;
                  const dayItems = (byDay.get(dayISO) ?? []).filter(
                    (it) => !it.multiDay || !it.allDay
                  );
                  const showItems = dayItems.slice(0, isBannerRow ? 0 : 3);
                  const overflow = dayItems.length - showItems.length;

                  // Hide date number under banner for covered cells
                  const coveredByBanner =
                    isBannerRow &&
                    bannerRowInfo &&
                    colIdx >= bannerRowInfo.colStart &&
                    colIdx <= bannerRowInfo.colEnd;

                  return (
                    <div
                      key={dayISO}
                      className={cn(
                        "border-r last:border-r-0 border-surface-200 p-1 flex flex-col gap-0.5 cursor-pointer hover:bg-surface-100/60 transition-colors",
                        !inMonth && "bg-surface-50/60"
                      )}
                      onClick={() => onNavigate("day", dayISO)}
                    >
                      {/* Date number */}
                      {!coveredByBanner && (
                        <div className="flex justify-end px-0.5 pt-0.5">
                          <span
                            className={cn(
                              "w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium",
                              isToday
                                ? "bg-brand-600 text-white font-bold"
                                : inMonth
                                ? "text-surface-700"
                                : "text-surface-400"
                            )}
                          >
                            {parseInt(dayISO.slice(8))}
                          </span>
                        </div>
                      )}

                      {/* Event cards (hidden when covered by banner) */}
                      {!coveredByBanner &&
                        showItems.map((item) => (
                          <MonthEventCard key={item.id} item={item} />
                        ))}

                      {/* Overflow */}
                      {!coveredByBanner && overflow > 0 && (
                        <button
                          className="text-[10px] text-brand-600 font-medium px-1 hover:underline text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate("day", dayISO);
                          }}
                        >
                          +{overflow} more
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-l border-surface-200 bg-white flex flex-col overflow-y-auto hidden lg:flex">
        {/* Month At A Glance */}
        <div className="p-4 border-b border-surface-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Month At A Glance
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <GlanceCard icon={<CalendarDays className="w-4 h-4 text-blue-500" />} value={summary.eventCount} label="Events" />
            <GlanceCard icon={<CheckSquare className="w-4 h-4 text-amber-500" />} value={summary.taskCount} label="Tasks" />
            <GlanceCard icon={<Bookmark className="w-4 h-4 text-green-500" />} value={summary.bookingCount} label="Bookings" />
            <GlanceCard icon={<FileText className="w-4 h-4 text-brand-500" />} value={summary.runSheetCount} label="Run Sheets" />
          </div>
          <div className="mt-3 pt-3 border-t border-surface-100 flex items-center justify-between text-xs text-surface-500">
            <span>{summary.totalItems} total items</span>
            <span className="text-amber-600 font-medium">{summary.dueTodayCount} due today</span>
          </div>
        </div>

        {/* Upcoming Highlights */}
        <div className="p-4 border-b border-surface-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Upcoming Highlights
          </h3>
          <div className="space-y-2">
            {highlights.map((h) => (
              <div key={h.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                {/* Date tile */}
                <div className="shrink-0 w-9 text-center">
                  <div className="text-[10px] font-semibold text-brand-600 uppercase leading-none">{h.month}</div>
                  <div className="text-lg font-bold text-surface-900 leading-tight">{h.day}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-surface-900 truncate">{h.title}</div>
                  {h.time && <div className="text-[11px] text-surface-400">{h.time}</div>}
                  {h.venue && <div className="text-[11px] text-surface-400 truncate">{h.venue}</div>}
                  <span className={cn("inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium", BADGE_STYLES[h.badgeType])}>
                    {h.badgeLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Schedule */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Team Schedule</h3>
            <button className="text-[11px] text-brand-600 hover:underline font-medium">View all</button>
          </div>
          <div className="space-y-3">
            {team.slice(0, 4).map((m) => (
              <div key={m.name} className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: m.avatarColor }}
                >
                  {m.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-surface-900 truncate">{m.name}</div>
                  <div className="text-[11px] text-surface-400 truncate">{m.role}</div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[11px] font-medium text-surface-600">{m.load}%</span>
                  <div className="w-16 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
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
      </aside>
    </div>
  );
}

// ─── Multi-day banner ──────────────────────────────────────────────────────────
function MultiDayBanner({
  item,
  colStart,
  colEnd,
}: {
  item: CalendarItem;
  colStart: number;
  colEnd: number;
}) {
  const span = colEnd - colStart + 1;
  const spanPercent = (span / 7) * 100;
  const leftPercent = (colStart / 7) * 100;

  return (
    <div
      className="absolute inset-x-0 top-7 z-10 px-0.5 pointer-events-none"
      style={{ height: "calc(100% - 28px)" }}
    >
      <div
        className="absolute top-0 bottom-0 rounded-xl overflow-hidden pointer-events-auto cursor-pointer group"
        style={{
          left: `calc(${leftPercent}% + 2px)`,
          width: `calc(${spanPercent}% - 4px)`,
        }}
      >
        {/* Background image */}
        {item.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 60vw, 800px"
          />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0e0c27]/80 via-[#0e0c27]/60 to-[#0e0c27]/30" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-white font-bold text-base leading-tight drop-shadow-sm">
                {item.title}
              </h3>
              {item.venueName && (
                <p className="text-white/70 text-xs mt-0.5">{item.venueName}</p>
              )}
            </div>
            <span className="shrink-0 ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white border border-white/30 backdrop-blur-sm">
              {item.badgeLabel}
            </span>
          </div>

          {/* Team avatars */}
          {item.teamAvatars && item.teamAvatars.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {item.teamAvatars.slice(0, 4).map((init, i) => (
                  <div
                    key={init + i}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold border-2 border-white/20"
                    style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                  >
                    {init}
                  </div>
                ))}
                {(item.teamCount ?? 0) > 4 && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 text-white text-[9px] font-bold border-2 border-white/20">
                    +{(item.teamCount ?? 0) - 4}
                  </div>
                )}
              </div>
              <span className="text-white/60 text-[11px]">{item.teamCount} team members</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Month event card ──────────────────────────────────────────────────────────
function MonthEventCard({ item }: { item: CalendarItem }) {
  const hasImage = !!item.imageUrl;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium truncate cursor-pointer hover:opacity-90 transition-opacity",
        // Use badge colour as background tint
        item.badgeType === "event" ? "bg-blue-50 text-blue-800" :
        item.badgeType === "run_sheet" ? "bg-brand-50 text-brand-800" :
        item.badgeType === "booking" ? "bg-green-50 text-green-800" :
        item.badgeType === "task" ? "bg-amber-50 text-amber-800" :
        item.badgeType === "finance" ? "bg-red-50 text-red-800" :
        item.badgeType === "webinar" ? "bg-violet-50 text-violet-800" :
        item.badgeType === "theatre" ? "bg-purple-100 text-purple-900" :
        item.badgeType === "nightlife" ? "bg-[#1a1a2e] text-white" :
        item.badgeType === "festival" ? "bg-teal-50 text-teal-800" :
        item.badgeType === "corporate" ? "bg-brand-600 text-white" :
        item.badgeType === "wedding" ? "bg-pink-50 text-pink-800" :
        "bg-surface-100 text-surface-700"
      )}
    >
      {/* Time */}
      {!item.allDay && (
        <span className="shrink-0 opacity-70">{formatTime(item.startsAt)}</span>
      )}
      {/* Title */}
      <span className="flex-1 truncate">{item.title}</span>
      {/* Thumbnail */}
      {hasImage && (
        <div className="shrink-0 w-5 h-5 rounded overflow-hidden relative">
          <Image src={item.imageUrl!} alt="" fill className="object-cover" sizes="20px" />
        </div>
      )}
    </div>
  );
}

// ─── Glance card ──────────────────────────────────────────────────────────────
function GlanceCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-50 border border-surface-100">
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-base font-bold text-surface-900 leading-none">{value}</div>
        <div className="text-[11px] text-surface-400 leading-tight mt-0.5">{label}</div>
      </div>
    </div>
  );
}
