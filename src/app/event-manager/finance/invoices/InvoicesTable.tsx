"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Receipt } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { invoiceBadgeStatus, daysUntil } from "../_lib/finance";

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  eventName: string | null;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
  totalCents: number;
  paidCents: number;
  currency: string;
  issuedOn: string | null;
  dueOn: string | null;
}

type AgingFilter = "all" | "0-30" | "31-60" | "61-90" | "90+";
type SortKey = "issued_desc" | "issued_asc" | "due_asc" | "due_desc" | "amount_desc" | "balance_desc";

function agingBucket(dueOn: string | null): AgingFilter {
  const days = daysUntil(dueOn);
  if (days === null) return "all";
  const overdueDays = Math.max(0, -days);
  if (overdueDays <= 30) return "0-30";
  if (overdueDays <= 60) return "31-60";
  if (overdueDays <= 90) return "61-90";
  return "90+";
}

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [event, setEvent] = useState<string>("all");
  const [client, setClient] = useState<string>("all");
  const [aging, setAging] = useState<AgingFilter>("all");
  const [sort, setSort] = useState<SortKey>("issued_desc");

  const events = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.eventName).filter((v): v is string => !!v))).sort(),
    [invoices]
  );
  const clients = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.clientName).filter((v): v is string => !!v))).sort(),
    [invoices]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = invoices.filter((inv) => {
      if (q) {
        const haystack = `${inv.invoiceNumber} ${inv.clientName ?? ""} ${inv.eventName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (status !== "all" && inv.status !== status) return false;
      if (event !== "all" && inv.eventName !== event) return false;
      if (client !== "all" && inv.clientName !== client) return false;
      if (aging !== "all") {
        const balance = inv.totalCents - inv.paidCents;
        if (balance <= 0) return false;
        if (agingBucket(inv.dueOn) !== aging) return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "issued_asc":
          return (a.issuedOn ?? "").localeCompare(b.issuedOn ?? "");
        case "issued_desc":
          return (b.issuedOn ?? "").localeCompare(a.issuedOn ?? "");
        case "due_asc":
          return (a.dueOn ?? "").localeCompare(b.dueOn ?? "");
        case "due_desc":
          return (b.dueOn ?? "").localeCompare(a.dueOn ?? "");
        case "amount_desc":
          return b.totalCents - a.totalCents;
        case "balance_desc":
          return b.totalCents - b.paidCents - (a.totalCents - a.paidCents);
        default:
          return 0;
      }
    });

    return rows;
  }, [invoices, query, status, event, client, aging, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search invoice, client or event…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="void">Void</option>
        </select>
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
          value={client}
          onChange={(e) => setClient(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={aging}
          onChange={(e) => setAging(e.target.value as AgingFilter)}
          className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">All aging</option>
          <option value="0-30">0–30 days</option>
          <option value="31-60">31–60 days</option>
          <option value="61-90">61–90 days</option>
          <option value="90+">90+ days</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="issued_desc">Newest issued</option>
          <option value="issued_asc">Oldest issued</option>
          <option value="due_asc">Due date (soonest)</option>
          <option value="due_desc">Due date (latest)</option>
          <option value="amount_desc">Amount (high–low)</option>
          <option value="balance_desc">Balance (high–low)</option>
        </select>
        <span className="text-xs text-surface-400 whitespace-nowrap">
          {filtered.length} {filtered.length === 1 ? "invoice" : "invoices"}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}
            description={
              invoices.length === 0
                ? "Create your first invoice to start billing clients."
                : "Try clearing search or filters to see more results."
            }
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm divide-y divide-surface-100">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client / Event</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Issued</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Paid</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-surface-500">
                      <Link href={`/event-manager/finance/invoices/${inv.id}`} className="flex items-center gap-2">
                        <Receipt className="w-3.5 h-3.5 text-surface-300" />
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <Link href={`/event-manager/finance/invoices/${inv.id}`} className="block">
                        <span className="font-medium text-surface-900">{inv.clientName ?? "—"}</span>
                        {inv.eventName && <span className="block text-xs text-surface-400">{inv.eventName}</span>}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-surface-500">{inv.issuedOn ? formatDate(inv.issuedOn) : "—"}</td>
                    <td className="px-6 py-3 text-surface-500">{inv.dueOn ? formatDate(inv.dueOn) : "—"}</td>
                    <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">
                      {formatCurrency(inv.totalCents / 100, inv.currency)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-surface-600">
                      {formatCurrency(inv.paidCents / 100, inv.currency)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-surface-600">
                      {formatCurrency((inv.totalCents - inv.paidCents) / 100, inv.currency)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={invoiceBadgeStatus(inv.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
