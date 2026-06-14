"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Clock,
  PenLine,
  Phone,
  Flag,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventDayItem {
  id: string;
  time: string;
  title: string;
  lane: string;
}

export interface EventDayBoardProps {
  eventId: string;
  eventName: string;
  dateLabel: string;
  items: EventDayItem[];
}

const LANE_COLOURS: Record<string, string> = {
  tech: "bg-violet-500",
  foh: "bg-brand-500",
  talent: "bg-success-500",
  comms: "bg-info-500",
  security: "bg-danger-500",
  catering: "bg-warning-500",
  other: "bg-surface-600",
};

const LANE_LABELS: Record<string, string> = {
  tech: "Tech",
  foh: "Front of House",
  talent: "Talent",
  comms: "Comms",
  security: "Security",
  catering: "Catering",
  other: "Other",
};

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EventDayBoard({ eventId, eventName, dateLabel, items }: EventDayBoardProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  // Completion is tracked client-side: the run-sheet schema has no completion column.
  const [done, setDone] = useState<Set<string>>(new Set());
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  function toggleItem(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const doneCount = done.size;
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;
  const usedLanes = Array.from(new Set(items.map((i) => i.lane)));

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-brand-600 to-violet-600 text-white">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                  Event Day Mode
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{eventName}</h1>
              <p className="text-surface-400 text-sm mt-1">{dateLabel}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-2 text-surface-300">
                <Clock className="w-4 h-4" strokeWidth={1.8} />
                <span className="text-2xl font-mono font-semibold tabular-nums">{formatClock(now)}</span>
              </div>
              <p className="text-xs text-surface-500 mt-1">Live clock</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-surface-400">Run sheet progress</span>
              <span className="text-xs font-semibold text-white">
                {doneCount} / {items.length} completed ({progress}%)
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-success-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-white/10 bg-white/5 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <PenLine className="w-4 h-4" strokeWidth={1.8} />
            Add Note
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Phone className="w-4 h-4" strokeWidth={1.8} />
            Contact Supplier
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-warning-300 bg-warning-500/10 hover:bg-warning-500/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Flag className="w-4 h-4" strokeWidth={1.8} />
            Flag Issue
          </button>

          <div className="ml-auto shrink-0">
            <button
              type="button"
              onClick={() => router.push(`/events/${eventId}`)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-surface-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.8} />
              Exit Event Day Mode
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-widest mb-4">Run Sheet</h2>

          {items.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-12 text-center">
              <p className="text-sm font-medium text-white">No run sheet items yet</p>
              <p className="text-sm text-surface-400 mt-1.5">
                Add timed items to this event&apos;s run sheet to drive event-day mode.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isDone = done.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={cn(
                      "w-full flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left group",
                      isDone
                        ? "bg-white/5 border-white/5 opacity-60"
                        : "bg-white/[0.06] border-white/10 hover:bg-white/[0.1] hover:border-white/20"
                    )}
                  >
                    <div className={cn("w-1 h-8 rounded-full shrink-0", LANE_COLOURS[item.lane] ?? LANE_COLOURS.other)} />
                    <div className="w-16 shrink-0">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-white/10 text-xs font-mono font-semibold text-surface-300">
                        {item.time}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium transition-all", isDone ? "line-through text-surface-500" : "text-white")}>
                        {item.title}
                      </p>
                      <p className="text-xs text-surface-500 mt-0.5">{LANE_LABELS[item.lane] ?? item.lane}</p>
                    </div>
                    <div className="shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-success-500" strokeWidth={2} />
                      ) : (
                        <Circle className="w-5 h-5 text-surface-600 group-hover:text-surface-400 transition-colors" strokeWidth={1.8} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {usedLanes.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              {usedLanes.map((lane) => (
                <div key={lane} className="flex items-center gap-2">
                  <div className={cn("w-2.5 h-2.5 rounded-full", LANE_COLOURS[lane] ?? LANE_COLOURS.other)} />
                  <span className="text-xs text-surface-500">{LANE_LABELS[lane] ?? lane}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {noteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-900 rounded-2xl border border-white/10 p-6">
            <h3 className="text-base font-semibold text-white mb-4">Add Event Note</h3>
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your note here…"
              className="w-full px-3 py-2 text-sm text-white placeholder:text-surface-500 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              autoFocus
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setNoteOpen(false);
                  setNoteText("");
                }}
                className="px-4 py-2 text-sm text-surface-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoteOpen(false);
                  setNoteText("");
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
