"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Send,
  Inbox,
  Award,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, SUPPLIERS_TABS } from "@/components/ui/SectionTabs";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RFQ_STATUSES, RFQ_STATUS_LABELS, rfqBadgeStatus, formatDateShort } from "./lib";

export interface RfqRow {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  eventName: string | null;
  recipientCount: number;
  responseCount: number;
}

export interface RfqsKpis {
  total: number;
  active: number;
  responses: number;
  awarded: number;
}

export function RfqsClient({ rfqs, kpis }: { rfqs: RfqRow[]; kpis: RfqsKpis }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rfqs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q) {
        return (
          r.title.toLowerCase().includes(q) ||
          (r.eventName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rfqs, query, statusFilter]);

  const selectCls =
    "px-3 py-2 text-sm text-surface-700 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Suppliers"
        description="Request quotes from multiple suppliers and compare responses side by side"
        tabs={<SectionTabs tabs={SUPPLIERS_TABS} />}
        actions={
          <Link
            href="/event-manager/rfqs/new"
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New RFQ
          </Link>
        }
      />

      <div className="p-6 space-y-6 max-w-[1400px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total RFQs" value={String(kpis.total)} icon={FileText} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Active" value={String(kpis.active)} icon={Send} iconColor="text-info-600" iconBg="bg-info-50" />
          <MetricCard label="Responses Received" value={String(kpis.responses)} icon={Inbox} iconColor="text-violet-600" iconBg="bg-violet-50" />
          <MetricCard label="Awarded" value={String(kpis.awarded)} icon={Award} iconColor="text-success-600" iconBg="bg-success-50" />
        </KPIGrid>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or event…"
              className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            {RFQ_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RFQ_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No RFQs found"
              description={
                rfqs.length === 0
                  ? "Send a request for quotes to your suppliers and compare their responses in one view."
                  : "Try a different filter or search term."
              }
              action={
                <Link
                  href="/event-manager/rfqs/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  New RFQ
                </Link>
              }
              compact
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <Th>RFQ</Th>
                  <Th className="hidden md:table-cell">Event</Th>
                  <Th className="hidden lg:table-cell">Sent To</Th>
                  <Th className="hidden lg:table-cell">Responses</Th>
                  <Th className="hidden md:table-cell">Deadline</Th>
                  <Th>Status</Th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/event-manager/rfqs/${r.id}`)}
                    className="hover:bg-surface-50 transition-colors group cursor-pointer"
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                        {r.title}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">
                      {r.eventName ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-surface-700 hidden lg:table-cell tabular-nums">
                      {r.recipientCount}
                    </td>
                    <td className="px-4 py-3.5 text-surface-700 hidden lg:table-cell tabular-nums">
                      {r.responseCount} / {r.recipientCount}
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell whitespace-nowrap">
                      {formatDateShort(r.dueDate)}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={rfqBadgeStatus(r.status) as never} />
                    </td>
                    <td className="px-4 py-3.5">
                      <MoreHorizontal
                        className="w-4 h-4 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        strokeWidth={1.8}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-surface-400">
          Showing {filtered.length} of {rfqs.length} RFQs
        </p>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider " +
        (className ?? "")
      }
    >
      {children}
    </th>
  );
}
