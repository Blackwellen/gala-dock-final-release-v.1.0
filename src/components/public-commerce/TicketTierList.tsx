"use client";

import { Minus, Plus, Info } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export interface TicketTier {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  remaining: number | null;
  soldOut: boolean;
}

/**
 * Ticket tier selector — real inventory (quantity - sold from ticket_types), no fabricated
 * seat-level numbers. Used on both the event profile preview and the /tickets purchase step.
 */
export function TicketTierList({
  tiers,
  qty,
  onChange,
  selectedId,
  onSelect,
  dense = false,
}: {
  tiers: TicketTier[];
  qty: Record<string, number>;
  onChange: (id: string, qty: number) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  dense?: boolean;
}) {
  if (!tiers.length) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-50 p-6 text-center text-sm text-surface-500">
        Tickets aren&apos;t on sale for this event yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {tiers.map((t) => {
        const q = qty[t.id] ?? 0;
        const selected = selectedId === t.id || q > 0;
        const max = Math.min(10, t.remaining ?? 10) || 0;
        return (
          <div
            key={t.id}
            onClick={() => !t.soldOut && onSelect?.(t.id)}
            className={cn(
              "rounded-xl border p-3.5 transition-colors",
              onSelect && "cursor-pointer",
              selected ? "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500" : "border-surface-200 bg-white",
              t.soldOut && "opacity-60"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-surface-900 text-sm">{t.name}</p>
                {t.description && !dense && (
                  <p className="mt-0.5 text-xs text-surface-500 line-clamp-2">{t.description}</p>
                )}
                {t.remaining != null && (
                  <p className={cn("mt-1 text-[11px] font-medium", t.remaining <= 10 ? "text-danger-600" : "text-surface-400")}>
                    {t.soldOut ? "Sold out" : `${t.remaining} left`}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-surface-900 text-sm">
                  {formatCurrency(t.priceCents / 100, t.currency)}
                </p>
                <p className="text-[10px] text-surface-400">+ fees</p>
              </div>
            </div>

            {!t.soldOut && (
              <div className="mt-2.5 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-label={`Decrease ${t.name} quantity`}
                  disabled={q <= 0}
                  onClick={() => onChange(t.id, Math.max(0, q - 1))}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-40"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">{q}</span>
                <button
                  type="button"
                  aria-label={`Increase ${t.name} quantity`}
                  disabled={q >= max}
                  onClick={() => onChange(t.id, Math.min(max, q + 1))}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p className="flex items-start gap-1.5 pt-1 text-[11px] text-surface-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Prices include GST/VAT where applicable. Booking and service fees are calculated at checkout.
      </p>
    </div>
  );
}
