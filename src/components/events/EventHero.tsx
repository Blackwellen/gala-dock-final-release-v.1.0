"use client";

import Link from "next/link";
import {
  Edit2, ChevronDown, UserPlus, Users2, CheckSquare,
  Sparkles, FileDown, Calendar, Archive, MapPin, User,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

interface EventHeroProps {
  eventId: string;
  name: string;
  status: "new-enquiry" | "briefing" | "quoting" | "awaiting-approval" | "confirmed" | "in-delivery" | "completed" | "cancelled";
  date: string;
  venue?: string;
  client: string;
  owner: string;
  guestCount?: number;
}

const PIPELINE = [
  { id: "new-enquiry",       label: "Enquiry" },
  { id: "briefing",          label: "Briefing" },
  { id: "quoting",           label: "Quoting" },
  { id: "awaiting-approval", label: "Approval" },
  { id: "confirmed",         label: "Confirmed" },
  { id: "in-delivery",       label: "Delivery" },
  { id: "completed",         label: "Done" },
];

export function EventHero({ eventId, name, status, date, venue, client, owner, guestCount }: EventHeroProps) {
  const pipelineIdx = PIPELINE.findIndex((s) => s.id === status);

  return (
    <div className="bg-white border-b border-surface-200">
      <div className="px-6 py-5">
        {/* Name row */}
        <div className="flex items-start gap-4 justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold text-surface-900 tracking-tight truncate">{name}</h1>
            <StatusBadge status={status} />
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
              Change Status
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <UserPlus className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Invite Client</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.8} />
              <span className="hidden sm:inline">AI Summary</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <FileDown className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Export Pack</span>
            </button>
            <Link
              href={`/app/events/${eventId}/edit`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
              Edit
            </Link>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-5 text-sm text-surface-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
            {date}
          </span>
          {venue && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
              {venue}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
            {client}
          </span>
          {guestCount && (
            <span className="flex items-center gap-1.5">
              <Users2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
              {guestCount} guests
            </span>
          )}
          <span className="flex items-center gap-1.5 text-surface-400">
            Owner: <span className="font-medium text-surface-600 ml-0.5">{owner}</span>
          </span>
        </div>

        {/* Pipeline bar */}
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {PIPELINE.map((stage, i) => {
            const isDone = i < pipelineIdx;
            const isActive = i === pipelineIdx;
            const isUpcoming = i > pipelineIdx;
            return (
              <div key={stage.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                    isDone && "bg-success-50 text-success-700 border border-success-200",
                    isActive && "bg-brand-600 text-white shadow-brand",
                    isUpcoming && "bg-surface-100 text-surface-400 border border-surface-200"
                  )}
                >
                  {isDone && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {stage.label}
                </div>
                {i < PIPELINE.length - 1 && (
                  <div className={cn("w-4 h-0.5 mx-0.5", i < pipelineIdx ? "bg-success-300" : "bg-surface-200")} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
