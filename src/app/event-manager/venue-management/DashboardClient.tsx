"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Layers, CalendarRange, ArrowRight } from "lucide-react";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import { BookingStatusBadge } from "./BookingStatusBadge";
import { BOOKING_STATUS_META, BOOKING_STATUSES, formatDate } from "./lib";

export interface DashboardVenue {
  id: string;
  name: string;
  location: string;
  status: string;
  spaceCount: number;
  upcomingCount: number;
  revenueLabel: string;
}

export interface DashboardBooking {
  id: string;
  venueName: string;
  clientName: string;
  status: string;
  startAt: string | null;
  headcount: number | null;
  totalLabel: string;
}

const KANBAN_COLUMNS = BOOKING_STATUSES.map((s) => ({
  id: s,
  label: BOOKING_STATUS_META[s].label,
  color: BOOKING_STATUS_META[s].kanbanDot,
}));

export function VenueManagementDashboard({
  venues,
  bookings,
}: {
  venues: DashboardVenue[];
  bookings: DashboardBooking[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"venues" | "pipeline">("venues");

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setView("venues")}
          className={
            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors " +
            (view === "venues"
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-surface-600 border-surface-200 hover:border-surface-300")
          }
        >
          Venues
        </button>
        <button
          type="button"
          onClick={() => setView("pipeline")}
          className={
            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors " +
            (view === "pipeline"
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-surface-600 border-surface-200 hover:border-surface-300")
          }
        >
          Bookings Pipeline
        </button>
      </div>

      {view === "venues" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {venues.map((v) => (
            <Link
              key={v.id}
              href={`/event-manager/venue-management/${v.id}`}
              className="group bg-white rounded-xl border border-surface-200 shadow-card hover:shadow-md hover:border-surface-300 transition-all p-5 flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-surface-900 truncate">{v.name}</h3>
                  <p className="text-xs text-surface-500 truncate">{v.location}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-brand-500 transition-colors shrink-0" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat icon={<Layers className="w-4 h-4" />} value={v.spaceCount} label="Spaces" />
                <Stat
                  icon={<CalendarRange className="w-4 h-4" />}
                  value={v.upcomingCount}
                  label="Upcoming"
                />
                <div className="rounded-lg bg-surface-50 py-2">
                  <p className="text-sm font-bold text-surface-900 tabular-nums">{v.revenueLabel}</p>
                  <p className="text-[10px] uppercase tracking-wider text-surface-400 mt-0.5">Revenue</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <KanbanBoard
          columns={KANBAN_COLUMNS}
          items={bookings}
          getItemId={(b) => b.id}
          getItemColumnId={(b) => {
            const s = b.status;
            return (BOOKING_STATUSES as readonly string[]).includes(s) ? s : "enquiry";
          }}
          emptyColumnLabel="No bookings in this stage"
          renderCard={(b) => (
            <button
              type="button"
              onClick={() => router.push(`/event-manager/venue-management/bookings/${b.id}`)}
              className="w-full text-left"
            >
              <p className="text-sm font-semibold text-surface-900 truncate">{b.clientName}</p>
              <p className="text-xs text-surface-500 truncate mt-0.5">{b.venueName}</p>
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-xs text-surface-500">{formatDate(b.startAt)}</span>
                <span className="text-xs font-semibold text-surface-700 tabular-nums">{b.totalLabel}</span>
              </div>
              <div className="mt-2">
                <BookingStatusBadge status={b.status} />
              </div>
            </button>
          )}
        />
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg bg-surface-50 py-2">
      <div className="flex items-center justify-center gap-1 text-surface-700">
        <span className="text-surface-400">{icon}</span>
        <span className="text-sm font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-surface-400 mt-0.5">{label}</p>
    </div>
  );
}
