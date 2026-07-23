"use client";

import Link from "next/link";
import { MapPin, MoreHorizontal } from "lucide-react";
import {
  EventTypeThumb,
  eventTypeMeta,
  OwnerAvatar,
  ScoreRing,
  PriorityBadge,
  formatMoney,
} from "@/components/sales/SalesPrimitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatEventDate, sourceLabel, type LeadStage } from "./lib";
import { Megaphone } from "lucide-react";
import type { LeadRow } from "./LeadsClient";

function leadValue(l: LeadRow): number {
  if (l.budgetCents != null) return l.budgetCents;
  if (l.budgetMinCents != null || l.budgetMaxCents != null) {
    const min = l.budgetMinCents ?? l.budgetMaxCents ?? 0;
    const max = l.budgetMaxCents ?? l.budgetMinCents ?? 0;
    return Math.round((min + max) / 2);
  }
  return 0;
}

function hasValue(l: LeadRow): boolean {
  return l.budgetCents != null || l.budgetMinCents != null || l.budgetMaxCents != null;
}

function nextActionDisplay(l: LeadRow): string {
  const pending = l.nextActions.find((a) => !a.done);
  if (!pending) return "—";
  if (l.responseDueDate) {
    const due = new Date(l.responseDueDate);
    if (!Number.isNaN(due.getTime())) {
      const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
      const hint = days > 0 ? `due in ${days}d` : days === 0 ? "due today" : `overdue ${Math.abs(days)}d`;
      return `${pending.label} · ${hint}`;
    }
  }
  return pending.label;
}

function leadStatus(stage: string): { label: string; dotColor: string } {
  if (stage === "won") return { label: "Won", dotColor: "bg-success-500" };
  if (stage === "lost") return { label: "Lost", dotColor: "bg-surface-400" };
  return { label: "Open", dotColor: "bg-info-500" };
}

export function CardsView({ leads }: { leads: LeadRow[] }) {
  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-surface-200 shadow-card">
        <EmptyState
          icon={Megaphone}
          title="No leads found"
          description="Try a different filter or search term."
          compact
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {leads.map((l) => {
        const meta = eventTypeMeta(l.eventType);
        const status = leadStatus(l.stage);
        const score = l.leadScore ?? 50;
        return (
          <div
            key={l.id}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <Link href={`/event-manager/leads/${l.id}`} className="block">
              <div className="relative h-40 w-full">
                <EventTypeThumb
                  type={l.eventType}
                  imageUrl={l.coverImageUrl}
                  className="h-40 w-full rounded-none"
                  iconClassName="h-9 w-9"
                />
                <span
                  className={
                    "absolute left-2.5 top-2.5 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm " +
                    (l.coverImageUrl ? "border-white/30 bg-black/40 text-white backdrop-blur-sm" : meta.chip)
                  }
                >
                  {l.eventType ?? "Other"}
                </span>
                <div className="absolute right-2.5 top-2.5">
                  <ScoreRing score={score} size={42} strokeWidth={4} elevated />
                </div>
              </div>
            </Link>

            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/event-manager/leads/${l.id}`} className="min-w-0">
                  <p className="truncate font-semibold text-sm text-surface-900 group-hover:text-brand-600 transition-colors">
                    {l.title}
                  </p>
                  <p className="truncate text-xs text-surface-500">
                    {l.companyName ?? l.clientName}
                  </p>
                </Link>
                <button
                  type="button"
                  aria-label="More actions"
                  className="shrink-0 rounded-lg p-1 text-surface-300 hover:bg-surface-100 hover:text-surface-600"
                  onClick={(e) => e.preventDefault()}
                >
                  <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>

              <div className="space-y-1 text-xs text-surface-500">
                {(l.eventLocation ?? l.city) && (
                  <p className="flex items-center gap-1.5 truncate">
                    <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                    {l.eventLocation ?? l.city}
                  </p>
                )}
                <p className="flex items-center gap-3">
                  <span>{formatEventDate(l.eventDate)}</span>
                  {l.guestCount != null && <span>{l.guestCount} guests</span>}
                </p>
              </div>

              <p className="text-base font-bold text-surface-900 tabular-nums">
                {hasValue(l) ? formatMoney(leadValue(l)) : "—"}
              </p>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <OwnerAvatar name={l.assignedTo} size="xs" />
                  <span className="truncate text-xs text-surface-600">
                    {l.assignedTo ?? "Unassigned"}
                  </span>
                </div>
                <PriorityBadge priority={l.priority} />
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px] text-surface-400">
                <span>{sourceLabel(l.source)}</span>
                <StatusBadge status={l.stage as LeadStage} />
              </div>

              <div className="mt-1 flex items-center justify-between gap-2 border-t border-surface-100 pt-2">
                <span className="truncate text-[11px] text-surface-500">{nextActionDisplay(l)}</span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-surface-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
                  {status.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
