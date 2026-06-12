"use client";

import Link from "next/link";
import { CalendarDays, User, MapPin, Users, ArrowRight, CheckSquare } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

type EventStatus =
  | "new-enquiry"
  | "briefing"
  | "quoting"
  | "awaiting-approval"
  | "confirmed"
  | "in-delivery"
  | "completed"
  | "cancelled";

interface EventCardProps {
  id: string;
  name: string;
  status: EventStatus;
  date: string;
  client: string;
  venue?: string;
  guests: number;
  tasksTotal?: number;
  tasksDone?: number;
  className?: string;
}

export function EventCard({
  id,
  name,
  status,
  date,
  client,
  venue,
  guests,
  tasksTotal = 0,
  tasksDone = 0,
  className,
}: EventCardProps) {
  const progressPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  return (
    <div
      className={cn(
        "group bg-white rounded-xl border border-surface-200 shadow-card",
        "hover:border-brand-300 hover:shadow-md transition-all duration-200",
        "flex flex-col",
        className
      )}
    >
      {/* Card Header */}
      <div className="px-4 pt-4 pb-3 border-b border-surface-100">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link
            href={`/app/events/${id}`}
            className="font-semibold text-surface-900 text-sm leading-snug group-hover:text-brand-600 transition-colors line-clamp-2"
          >
            {name}
          </Link>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Card Body */}
      <div className="px-4 py-3 space-y-2 flex-1">
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <CalendarDays className="w-3.5 h-3.5 shrink-0 text-surface-400" strokeWidth={1.8} />
          <span>{date}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-surface-500">
          <User className="w-3.5 h-3.5 shrink-0 text-surface-400" strokeWidth={1.8} />
          <span className="truncate">{client}</span>
        </div>

        {venue && (
          <div className="flex items-center gap-2 text-xs text-surface-500">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-surface-400" strokeWidth={1.8} />
            <span className="truncate">{venue}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-surface-500">
          <Users className="w-3.5 h-3.5 shrink-0 text-surface-400" strokeWidth={1.8} />
          <span>{guests} guests</span>
        </div>
      </div>

      {/* Task Progress */}
      {tasksTotal > 0 && (
        <div className="px-4 py-2.5 border-t border-surface-100">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-surface-500">
              <CheckSquare className="w-3 h-3" strokeWidth={1.8} />
              <span>
                {tasksDone}/{tasksTotal} tasks
              </span>
            </div>
            <span className="text-[11px] font-medium text-surface-500">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progressPct === 100
                  ? "bg-success-500"
                  : progressPct >= 60
                  ? "bg-brand-500"
                  : progressPct >= 30
                  ? "bg-warning-400"
                  : "bg-surface-300"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-surface-100">
        <Link
          href={`/app/events/${id}`}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors"
        >
          Open
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
