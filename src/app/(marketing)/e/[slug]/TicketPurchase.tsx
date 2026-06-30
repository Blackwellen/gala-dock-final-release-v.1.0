"use client";

import { useState, useTransition } from "react";
import { Ticket } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { createTicketCheckout } from "./checkout";

interface TicketType {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity: number | null;
  sold: number;
}

export function TicketPurchase({ slug, tickets }: { slug: string; tickets: TicketType[] }) {
  const [email, setEmail] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!tickets.length) return null;

  function buy(t: TicketType) {
    setError(null);
    const quantity = qty[t.id] ?? 1;
    start(async () => {
      const res = await createTicketCheckout({ slug, ticketTypeId: t.id, quantity, email });
      if (res.ok && res.url) window.location.href = res.url;
      else setError(res.error ?? "Couldn't start checkout.");
    });
  }

  return (
    <div className="mt-6 border-t border-surface-100 pt-6">
      <h2 className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2">
        <Ticket className="w-4 h-4 text-brand-600" /> Tickets
      </h2>
      <div className="mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for your tickets"
          className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div className="space-y-2">
        {tickets.map((t) => {
          const remaining = t.quantity != null ? t.quantity - t.sold : null;
          const soldOut = remaining != null && remaining <= 0;
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-200 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">{t.name}</p>
                <p className="text-xs text-surface-500">
                  {formatCurrency(t.price_cents / 100, t.currency)}
                  {remaining != null && <span className="ml-2">· {remaining} left</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={qty[t.id] ?? 1}
                  onChange={(e) => setQty((q) => ({ ...q, [t.id]: Number(e.target.value) }))}
                  disabled={soldOut}
                  className="px-2 py-1.5 text-sm border border-surface-200 rounded-lg"
                >
                  {Array.from({ length: Math.min(10, remaining ?? 10) || 1 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  onClick={() => buy(t)}
                  disabled={pending || soldOut}
                  className="px-3 py-1.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {soldOut ? "Sold out" : pending ? "…" : "Buy"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
