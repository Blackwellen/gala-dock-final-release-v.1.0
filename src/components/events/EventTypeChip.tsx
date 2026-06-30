// Gala Dock — Event-type context chip (EB-B). Shows the event's type + layout mode on the event
// hero and (reused) across tabs so every surface is type-aware. Pure presentational.

import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  typeMeta,
  layoutModeFor,
  LAYOUT_MODE_LABEL,
  EVENT_CATEGORY_LABEL,
  type LayoutMode,
} from "@/lib/events/event-types";

const CATEGORY_TONE: Record<string, string> = {
  nightlife: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  public: "bg-brand-50 text-brand-700 border-brand-200",
  private: "bg-rose-50 text-rose-700 border-rose-200",
  corporate: "bg-sky-50 text-sky-700 border-sky-200",
  remote: "bg-emerald-50 text-emerald-700 border-emerald-200",
  hybrid: "bg-amber-50 text-amber-700 border-amber-200",
  structure: "bg-indigo-50 text-indigo-700 border-indigo-200",
  other: "bg-surface-100 text-surface-600 border-surface-200",
};

export function EventTypeChip({
  typeKey,
  layoutMode,
  className,
}: {
  typeKey?: string | null;
  layoutMode?: string | null;
  className?: string;
}) {
  const meta = typeMeta(typeKey);
  const layout: LayoutMode | undefined =
    (layoutMode as LayoutMode) || (typeKey ? layoutModeFor(typeKey) : undefined);

  if (!meta && !layout) return null;
  const tone = CATEGORY_TONE[meta?.category ?? "other"];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border", tone)}>
        <CalendarRange className="w-3 h-3" />
        {meta?.name ?? (typeKey ? typeKey.replace(/_/g, " ") : "Event")}
        {meta && <span className="opacity-60">· {EVENT_CATEGORY_LABEL[meta.category]}</span>}
      </span>
      {layout && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-100 text-surface-600 border border-surface-200">
          {LAYOUT_MODE_LABEL[layout]}
        </span>
      )}
    </span>
  );
}
