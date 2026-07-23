"use client";

import { useMemo, useState } from "react";
import { Search, Ticket } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ticketOrderBadgeStatus } from "../_lib/finance";

export interface TicketOrderRow {
  id: string;
  orderCode: string;
  eventName: string;
  buyerName: string;
  tierName: string;
  quantity: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  channel: string;
  status: string;
  createdAt: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  website: "Website",
  mobile_app: "Mobile App",
  partner_sites: "Partner Sites",
  box_office: "Box Office",
};

export function TicketOrdersTable({ orders }: { orders: TicketOrderRow[] }) {
  const [query, setQuery] = useState("");
  const [event, setEvent] = useState("all");
  const [channel, setChannel] = useState("all");
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const events = useMemo(() => Array.from(new Set(orders.map((o) => o.eventName))).sort(), [orders]);
  const channels = useMemo(() => Array.from(new Set(orders.map((o) => o.channel))).sort(), [orders]);
  const tiers = useMemo(() => Array.from(new Set(orders.map((o) => o.tierName))).sort(), [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (q) {
        const haystack = `${o.orderCode} ${o.buyerName} ${o.eventName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (event !== "all" && o.eventName !== event) return false;
      if (channel !== "all" && o.channel !== channel) return false;
      if (tier !== "all" && o.tierName !== tier) return false;
      if (status !== "all" && o.status !== status) return false;
      if (from && o.createdAt < from) return false;
      if (to && o.createdAt > `${to}T23:59:59`) return false;
      return true;
    });
  }, [orders, query, event, channel, tier, status, from, to]);

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-surface-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-surface-900">Recent Orders</h2>
          <span className="text-xs text-surface-400 whitespace-nowrap">
            {filtered.length} {filtered.length === 1 ? "order" : "orders"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order, buyer or event…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
            />
          </div>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="all">All events</option>
            {events.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="all">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABELS[c] ?? c}</option>
            ))}
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="all">All ticket tiers</option>
            {tiers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label="From date"
          />
          <span className="text-xs text-surface-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label="To date"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={orders.length === 0 ? "No ticket orders yet" : "No orders match your filters"}
          description={
            orders.length === 0
              ? "Ticket orders will appear here once tickets go on sale and customers start buying."
              : "Try clearing search or filters to see more results."
          }
          compact
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm divide-y divide-surface-100">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Buyer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Ticket Tier</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Qty</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Gross</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Fees</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Net</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-3 font-mono text-xs text-surface-500">{o.orderCode}</td>
                  <td className="px-6 py-3">
                    <span className="font-medium text-surface-900">{o.eventName}</span>
                    <span className="block text-xs text-surface-400">{formatDate(o.createdAt)}</span>
                  </td>
                  <td className="px-6 py-3 text-surface-700">{o.buyerName}</td>
                  <td className="px-6 py-3 text-surface-600">{o.tierName}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-surface-700">{o.quantity}</td>
                  <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">
                    {formatCurrency(o.grossCents / 100, o.currency)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-surface-500">
                    {formatCurrency(o.feeCents / 100, o.currency)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-medium text-surface-800">
                    {formatCurrency(o.netCents / 100, o.currency)}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={ticketOrderBadgeStatus(o.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
