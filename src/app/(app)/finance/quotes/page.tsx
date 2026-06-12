"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Filter, Download, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency } from "@/lib/utils";

type QuoteStatus = "draft" | "sent" | "approved" | "rejected";

interface Quote {
  id: string;
  num: string;
  event: string;
  client: string;
  amount: number;
  date: string;
  expiry: string;
  status: QuoteStatus;
}

const QUOTES: Quote[] = [
  { id: "1", num: "QUO-008", event: "Hartley Wedding", client: "Emma Hartley", amount: 18500, date: "2 Jun 2026", expiry: "16 Jun 2026", status: "approved" },
  { id: "2", num: "QUO-007", event: "TechSummit 2026", client: "Apex Corp", amount: 34200, date: "28 May 2026", expiry: "11 Jun 2026", status: "sent" },
  { id: "3", num: "QUO-006", event: "Gala Fundraiser", client: "Hope Foundation", amount: 22000, date: "25 May 2026", expiry: "8 Jun 2026", status: "draft" },
  { id: "4", num: "QUO-005", event: "Miller Birthday", client: "James Miller", amount: 8750, date: "20 May 2026", expiry: "3 Jun 2026", status: "rejected" },
  { id: "5", num: "QUO-004", event: "Clarke Conference", client: "Clarke & Sons", amount: 15600, date: "15 May 2026", expiry: "29 May 2026", status: "approved" },
  { id: "6", num: "QUO-003", event: "Spring Gala", client: "Riviera Hotels", amount: 27800, date: "5 May 2026", expiry: "19 May 2026", status: "sent" },
  { id: "7", num: "QUO-002", event: "Patel Anniversary", client: "Priya Patel", amount: 9800, date: "28 Apr 2026", expiry: "12 May 2026", status: "approved" },
  { id: "8", num: "QUO-001", event: "Thompson Charity Ball", client: "Thompson Trust", amount: 31000, date: "15 Apr 2026", expiry: "29 Apr 2026", status: "draft" },
];

const FILTER_OPTIONS: { label: string; value: QuoteStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export default function QuotesPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<QuoteStatus | "all">("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = activeFilter === "all" ? QUOTES : QUOTES.filter((q) => q.status === activeFilter);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Quotes"
        description="Create and manage event quotes"
        actions={
          <>
            <button
              onClick={() => router.push("/finance/quotes/new")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Quote
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" />
              Export PDF
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setActiveFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === opt.value
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-surface-600 border-surface-200 hover:border-surface-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-surface-400">{filtered.length} quotes</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm divide-y divide-surface-100">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">#</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Expiry</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((q) => (
                  <tr
                    key={q.id}
                    className="group hover:bg-surface-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/finance/quotes/${q.id}`)}
                  >
                    <td className="px-6 py-3 font-mono text-xs text-surface-500">{q.num}</td>
                    <td className="px-6 py-3 font-medium text-surface-900">{q.event}</td>
                    <td className="px-6 py-3 text-surface-600">{q.client}</td>
                    <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{formatCurrency(q.amount)}</td>
                    <td className="px-6 py-3 text-surface-500">{q.date}</td>
                    <td className="px-6 py-3"><StatusBadge status={q.status} /></td>
                    <td className="px-6 py-3 text-surface-500">{q.expiry}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenMenu(openMenu === q.id ? null : q.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openMenu === q.id && (
                          <div className="absolute right-0 top-8 z-20 w-44 bg-white rounded-xl border border-surface-200 shadow-lg py-1">
                            {["View", "Edit", "Send to Client", "Duplicate", "Archive"].map((action) => (
                              <button
                                key={action}
                                onClick={() => setOpenMenu(null)}
                                className="w-full text-left px-4 py-2 text-sm text-surface-700 hover:bg-surface-50"
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-surface-400 text-sm">No quotes found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
