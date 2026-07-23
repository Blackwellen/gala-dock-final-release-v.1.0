"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, X, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { TicketTierList, type TicketTier } from "@/components/public-commerce/TicketTierList";
import { SeatingPreview, type SeatingSection } from "@/components/public-commerce/SeatingPreview";

export function TicketSeatSelector({
  slug,
  tiers,
  sections,
}: {
  slug: string;
  tiers: TicketTier[];
  sections: SeatingSection[];
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});

  const basket = useMemo(
    () => tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ ...t, qty: qty[t.id] })),
    [tiers, qty]
  );
  const subtotalCents = basket.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const currency = tiers[0]?.currency ?? "GBP";
  const itemCount = basket.reduce((sum, l) => sum + l.qty, 0);

  function goToReview() {
    const params = new URLSearchParams();
    for (const l of basket) params.append("t", `${l.id}:${l.qty}`);
    router.push(`/e/${slug}/checkout?${params.toString()}`);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1fr_320px] gap-6 items-start">
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-surface-900">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-100 text-[11px] text-brand-700">1</span>
          Choose your tickets
        </h2>
        <TicketTierList tiers={tiers} qty={qty} onChange={(id, n) => setQty((q) => ({ ...q, [id]: n }))} />
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-surface-900">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-100 text-[11px] text-brand-700">2</span>
          Section availability
        </h2>
        <SeatingPreview sections={sections} />
      </div>

      {/* Basket */}
      <div className="lg:sticky lg:top-6 rounded-xl border border-surface-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-900">
          <ShoppingBag className="w-4 h-4 text-brand-600" /> Your basket
          {itemCount > 0 && <span className="ml-auto text-xs text-surface-400">{itemCount} item{itemCount > 1 ? "s" : ""}</span>}
        </h3>

        {basket.length === 0 ? (
          <p className="mt-4 text-sm text-surface-400">Select tickets to build your order.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {basket.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-surface-900 truncate">{l.name}</p>
                  <p className="text-xs text-surface-400">{l.qty} × {formatCurrency(l.priceCents / 100, l.currency)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-surface-900">{formatCurrency((l.priceCents * l.qty) / 100, l.currency)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${l.name}`}
                    onClick={() => setQty((q) => ({ ...q, [l.id]: 0 }))}
                    className="text-surface-300 hover:text-danger-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-surface-100 pt-3 flex items-center justify-between text-sm">
          <span className="text-surface-500">Subtotal</span>
          <span className="font-semibold text-surface-900">{formatCurrency(subtotalCents / 100, currency)}</span>
        </div>
        <p className="mt-1 text-[11px] text-surface-400">Fees are calculated at checkout.</p>

        <button
          type="button"
          disabled={basket.length === 0}
          onClick={goToReview}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Continue to review <ArrowRight className="w-4 h-4" />
        </button>
        <p className="mt-2 text-center text-[11px] text-surface-400">You won&apos;t be charged yet</p>
      </div>
    </div>
  );
}
