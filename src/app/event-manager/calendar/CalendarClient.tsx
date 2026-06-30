"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutList,
  Plus,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  todayISODate,
  monthGrid,
  weekGrid,
  addMonths,
  addWeeks,
  addDayKey,
  dayLabel,
} from "./grid";
import {
  DEMO_MONTH_ITEMS,
  DEMO_WEEK_ITEMS,
  DEMO_DAY_ITEMS,
  DEMO_SUMMARY,
  DEMO_TEAM,
  DEMO_HIGHLIGHTS,
  DEMO_OVERDUE,
  DEMO_RESOURCES,
  DEMO_DEADLINES,
  DEMO_DAY_GUESTS,
  DEMO_DAY_TEAM_ON_DUTY,
} from "./demo-data";
import type { CalendarItem, DayLaneItem, ViewMode } from "./types";
import { MonthView } from "./MonthView";
import { AgendaView } from "./AgendaView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";

interface CalendarClientProps {
  view: ViewMode;
  dateISO: string;
  liveItems: CalendarItem[];
  hasWorkspace: boolean;
}

export function CalendarClient({
  view,
  dateISO,
  liveItems,
  hasWorkspace,
}: CalendarClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = todayISODate();
  const useDemoData = !hasWorkspace || liveItems.length === 0;

  // The day grid positions blocks from precomputed hour/minute/duration fields.
  // Live items only carry ISO timestamps, so derive those fields here.
  const liveDayItems = useMemo<DayLaneItem[]>(
    () =>
      liveItems.map((it) => {
        const start = new Date(it.startsAt);
        const end = it.endsAt ? new Date(it.endsAt) : null;
        const durationMinutes = end ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)) : 60;
        return {
          ...it,
          startHour: start.getUTCHours(),
          startMinute: start.getUTCMinutes(),
          durationMinutes,
        };
      }),
    [liveItems]
  );

  const navigate = useCallback(
    (newView: ViewMode, newDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", newView);
      params.set("date", newDate);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const goToView = useCallback(
    (newView: ViewMode) => navigate(newView, dateISO),
    [navigate, dateISO]
  );

  const goToToday = useCallback(
    () => navigate(view, today),
    [navigate, view, today]
  );

  const navPrev = useCallback(() => {
    if (view === "month") {
      const mk = dateISO.slice(0, 7);
      navigate("month", addMonths(mk, -1) + "-01");
    } else if (view === "week") {
      navigate("week", addWeeks(dateISO, -1));
    } else if (view === "day") {
      navigate("day", addDayKey(dateISO, -1));
    } else {
      navigate("agenda", addDayKey(dateISO, -28));
    }
  }, [view, dateISO, navigate]);

  const navNext = useCallback(() => {
    if (view === "month") {
      const mk = dateISO.slice(0, 7);
      navigate("month", addMonths(mk, 1) + "-01");
    } else if (view === "week") {
      navigate("week", addWeeks(dateISO, 1));
    } else if (view === "day") {
      navigate("day", addDayKey(dateISO, 1));
    } else {
      navigate("agenda", addDayKey(dateISO, 28));
    }
  }, [view, dateISO, navigate]);

  const periodLabel = useMemo(() => {
    if (view === "month") {
      return monthGrid(dateISO.slice(0, 7)).monthLabel;
    }
    if (view === "week") {
      return weekGrid(dateISO).weekLabel;
    }
    if (view === "day") {
      return dayLabel(dateISO);
    }
    // agenda
    const end = new Date(dateISO + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + 27);
    const toISO = end.toISOString().slice(0, 10);
    const fmt = (d: string) =>
      new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    return `${fmt(dateISO)} – ${fmt(toISO)}, ${end.getUTCFullYear()}`;
  }, [view, dateISO]);

  const isToday = dateISO === today;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-surface-50">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-3 bg-white border-b border-surface-200 shrink-0 overflow-x-auto">
        {/* Period nav */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={navPrev}
            className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-surface-900 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2} />
          </button>
          <button
            onClick={navNext}
            className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-surface-900 transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* Period label */}
        <span className="text-[13px] font-semibold text-surface-900 shrink-0 min-w-[180px]">
          {periodLabel}
        </span>

        {/* Today */}
        <button
          onClick={goToToday}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md border shrink-0 transition-colors",
            isToday
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
          )}
        >
          Today
        </button>

        <div className="flex-1 min-w-4" />

        {/* Filter chips */}
        <button className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-surface-600 border border-surface-200 rounded-md hover:bg-surface-50 transition-colors shrink-0">
          <Filter className="w-3 h-3" />
          All Items
        </button>

        {/* Layer dots */}
        <div className="hidden xl:flex items-center gap-2 text-[11px] text-surface-500 shrink-0">
          <LayerDot color="bg-blue-500" label="Event" />
          <LayerDot color="bg-brand-500" label="Run Sheet" />
          <LayerDot color="bg-green-500" label="Booking" />
          <LayerDot color="bg-amber-500" label="Task" />
        </div>

        <button className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-surface-600 border border-surface-200 rounded-md hover:bg-surface-50 transition-colors shrink-0">
          <SlidersHorizontal className="w-3 h-3" />
          More Filters
        </button>

        {/* View mode: Calendar / Agenda */}
        <div className="flex items-center border border-surface-200 rounded-lg overflow-hidden shrink-0">
          <ViewToggle
            label="Calendar"
            icon={<CalendarDays className="w-3.5 h-3.5" />}
            active={view !== "agenda"}
            onClick={() => goToView("month")}
          />
          <ViewToggle
            label="Agenda"
            icon={<LayoutList className="w-3.5 h-3.5" />}
            active={view === "agenda"}
            onClick={() => goToView("agenda")}
          />
        </div>

        {/* Sub-view: Month / Week / Day */}
        {view !== "agenda" && (
          <div className="flex items-center border border-surface-200 rounded-lg overflow-hidden shrink-0">
            <SubViewToggle label="Month" active={view === "month"} onClick={() => goToView("month")} />
            <SubViewToggle label="Week" active={view === "week"} onClick={() => goToView("week")} />
            <SubViewToggle label="Day" active={view === "day"} onClick={() => goToView("day")} />
          </div>
        )}

        {/* Quick add */}
        <button className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 transition-colors shrink-0">
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Add
        </button>
      </div>

      {/* ── View body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden min-h-0">
        {view === "month" && (
          <MonthView
            dateISO={dateISO}
            items={useDemoData ? DEMO_MONTH_ITEMS : liveItems}
            summary={DEMO_SUMMARY}
            team={DEMO_TEAM}
            highlights={DEMO_HIGHLIGHTS}
            todayISO={today}
            onNavigate={navigate}
          />
        )}
        {view === "agenda" && (
          <AgendaView
            dateISO={dateISO}
            items={useDemoData ? DEMO_MONTH_ITEMS : liveItems}
            summary={DEMO_SUMMARY}
            team={DEMO_TEAM}
            highlights={DEMO_HIGHLIGHTS}
            overdue={DEMO_OVERDUE}
            todayISO={today}
            onNavigate={navigate}
          />
        )}
        {view === "week" && (
          <WeekView
            dateISO={dateISO}
            items={useDemoData ? DEMO_WEEK_ITEMS : liveItems}
            team={DEMO_TEAM}
            highlights={DEMO_HIGHLIGHTS}
            deadlines={DEMO_DEADLINES}
            resources={DEMO_RESOURCES}
            todayISO={today}
            onNavigate={navigate}
          />
        )}
        {view === "day" && (
          <DayView
            dateISO={dateISO}
            items={useDemoData ? DEMO_DAY_ITEMS : liveDayItems}
            guests={DEMO_DAY_GUESTS}
            teamOnDuty={DEMO_DAY_TEAM_ON_DUTY}
            todayISO={today}
            onNavigate={navigate}
          />
        )}
      </div>
    </div>
  );
}

function LayerDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("w-2 h-2 rounded-full shrink-0", color)} />
      <span>{label}</span>
    </span>
  );
}

function ViewToggle({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-brand-600 text-white" : "bg-white text-surface-600 hover:bg-surface-50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SubViewToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0 border-surface-200",
        active ? "bg-brand-600 text-white border-brand-600" : "bg-white text-surface-600 hover:bg-surface-50"
      )}
    >
      {label}
    </button>
  );
}
