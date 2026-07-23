import { cn } from "@/lib/utils";

export interface SeatingSection {
  id: string;
  name: string;
  remaining: number | null;
  capacity: number | null;
  priceCents: number | null;
}

/**
 * Section-level availability visual. This is deliberately NOT a per-seat map — Gala Dock's
 * ticket_types table tracks inventory at tier/section granularity (quantity - sold), so this
 * component renders real fill-level shading per section rather than fabricating individual
 * seat numbers that don't exist in the schema. A true per-seat map is tracked as a follow-up
 * (see docs/release-gated/user-fixes/public-event-commerce.md).
 */
export function SeatingPreview({
  sections,
  compact = false,
  className,
}: {
  sections: SeatingSection[];
  compact?: boolean;
  className?: string;
}) {
  if (!sections.length) {
    return (
      <div className={cn("rounded-xl border border-surface-200 bg-surface-50 p-6 text-center text-xs text-surface-400", className)}>
        No seating layout published for this event.
      </div>
    );
  }

  function fillPct(s: SeatingSection): number {
    if (s.capacity == null || s.remaining == null || s.capacity === 0) return 0.5;
    return Math.min(1, Math.max(0, 1 - s.remaining / s.capacity));
  }

  return (
    <div className={cn("rounded-xl border border-surface-200 bg-surface-50 p-4", className)}>
      <div className="rounded-lg bg-surface-800 py-2 text-center text-[11px] font-semibold uppercase tracking-widest text-white">
        Stage
      </div>
      <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {sections.map((s) => {
          const pct = fillPct(s);
          const soldOut = s.remaining === 0;
          return (
            <div
              key={s.id}
              className={cn(
                "relative overflow-hidden rounded-lg border p-2.5 text-center",
                soldOut ? "border-surface-200 bg-surface-100" : "border-brand-200 bg-white"
              )}
            >
              <div
                className="absolute inset-x-0 bottom-0 bg-brand-100"
                style={{ height: `${Math.round(pct * 100)}%` }}
                aria-hidden
              />
              <div className="relative">
                <p className="text-[11px] font-semibold text-surface-800 truncate">{s.name}</p>
                <p className={cn("text-[10px]", soldOut ? "text-surface-400" : "text-surface-500")}>
                  {soldOut ? "Sold out" : s.remaining != null ? `${s.remaining} left` : "Available"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-surface-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-white border border-brand-200" /> Available</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-100" /> Filling up</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-surface-100 border border-surface-200" /> Sold out</span>
        </div>
      )}
    </div>
  );
}
