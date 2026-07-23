"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Award, Banknote, Clock, FileText, Inbox, PiggyBank, Send } from "lucide-react";
import type { RfqRecord, SupplierRecord } from "../suppliers/_data/types";
import {
  computeAwardRate,
  computeCategoryDemand,
  computeRecentSupplierResponses,
  computeResponseAnalytics,
  computeRfqKpis,
  formatGBP,
} from "../suppliers/_data/kpis";
import { formatDate, isOverdue, relativeFuture } from "../suppliers/_data/format";
import { SupplierKpiRow } from "../suppliers/_components/SupplierKpiRow";
import { SupplierToolbar } from "../suppliers/_components/SupplierToolbar";
import { SupplierPagination } from "../suppliers/_components/SupplierPagination";
import { InsightsRail, RailCard, ActivityList } from "../suppliers/_components/SupplierInsightsRail";
import { MiniDonut } from "../suppliers/_components/MiniDonut";
import { EmptyState } from "@/components/ui/EmptyState";
import { RfqStatusChip } from "../suppliers/_components/chips";
import { ProgressRing } from "../suppliers/_components/ProgressRing";
import { Th } from "../suppliers/_components/Th";
import { TabNav } from "@/components/ui/TabNav";
import { Eye, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { id: "all", label: "All RFQs" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "responses-received", label: "Responses Received" },
  { id: "under-review", label: "Under Review" },
  { id: "awarded", label: "Awarded" },
  { id: "closed", label: "Closed" },
] as const;

export function RfqsView({ rfqs, suppliers }: { rfqs: RfqRecord[]; suppliers: SupplierRecord[] }) {
  const [statusTab, setStatusTab] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const kpis = useMemo(() => computeRfqKpis(rfqs), [rfqs]);
  const responseAnalytics = useMemo(() => computeResponseAnalytics(rfqs), [rfqs]);
  const awardRate = useMemo(() => computeAwardRate(rfqs), [rfqs]);
  const recentResponses = useMemo(() => computeRecentSupplierResponses(rfqs, suppliers), [rfqs, suppliers]);
  const categoryDemand = useMemo(() => computeCategoryDemand(rfqs), [rfqs]);

  const categories = useMemo(() => [...new Set(rfqs.map((r) => r.category))].sort(), [rfqs]);
  const eventNames = useMemo(() => [...new Set(rfqs.map((r) => r.event.name))].sort(), [rfqs]);

  const tabsWithCounts = useMemo(
    () =>
      STATUS_TABS.map((t) => ({
        id: t.id,
        label: t.label,
        count: t.id === "all" ? rfqs.length : rfqs.filter((r) => r.status === t.id).length,
      })),
    [rfqs]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rfqs.filter((r) => {
      if (statusTab !== "all" && r.status !== statusTab) return false;
      if (eventType !== "all" && r.event.name !== eventType) return false;
      if (category !== "all" && r.category !== category) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.event.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rfqs, statusTab, eventType, category, query]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6 max-w-[1600px] space-y-6">
      <TabNav tabs={tabsWithCounts} active={statusTab} onChange={(id) => { setStatusTab(id); setPage(1); }} />

      <SupplierKpiRow
        items={[
          { label: "Total RFQs", value: kpis.total, icon: FileText, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Active RFQs", value: kpis.active, icon: Send, iconColor: "text-info-600", iconBg: "bg-info-50" },
          { label: "Responses Received", value: kpis.responsesReceived, icon: Inbox, iconColor: "text-violet-600", iconBg: "bg-violet-50" },
          { label: "Awarded RFQs", value: kpis.awarded, icon: Award, iconColor: "text-success-600", iconBg: "bg-success-50" },
          { label: "Avg Response Time", value: `${kpis.avgResponseTimeHrs}h`, icon: Clock, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "Projected Value", value: formatGBP(kpis.projectedValue), icon: Banknote, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Estimated Savings", value: formatGBP(kpis.estimatedSavings), icon: PiggyBank, iconColor: "text-success-600", iconBg: "bg-success-50" },
        ]}
      />

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <SupplierToolbar
            query={query}
            onQueryChange={(v) => { setQuery(v); setPage(1); }}
            searchPlaceholder="Search RFQs by title or event…"
            filters={[
              { label: "Event Type", value: eventType, options: eventNames, onChange: (v) => { setEventType(v); setPage(1); } },
              { label: "Category", value: category, options: categories, onChange: (v) => { setCategory(v); setPage(1); } },
            ]}
            moreFiltersCount={3}
          />

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No RFQs found"
                description="Send a request for quotes to your suppliers and compare their responses in one view."
                action={
                  <Link
                    href="/event-manager/rfqs/new"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                  >
                    New RFQ
                  </Link>
                }
                compact
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <Th>RFQ Title</Th>
                      <Th>Event</Th>
                      <Th>Category</Th>
                      <Th>Suppliers Invited</Th>
                      <Th>Responses</Th>
                      <Th>Quote Range</Th>
                      <Th>Due Date</Th>
                      <Th>Status</Th>
                      <Th>Awarded Supplier</Th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {paged.map((r) => {
                      const overdue = isOverdue(r.dueDate) && r.status !== "awarded" && r.status !== "closed";
                      return (
                        <tr key={r.id} className="hover:bg-surface-50 transition-colors group">
                          <td className="px-4 py-3.5">
                            <Link href={`/event-manager/rfqs/${r.id}`} className="flex items-start gap-2.5">
                              <FileText className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" strokeWidth={1.8} />
                              <div className="min-w-0">
                                <p className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors truncate">{r.title}</p>
                                <p className="text-xs text-surface-400">{r.code}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            <p className="text-surface-700 font-medium truncate max-w-[180px]">{r.event.name}</p>
                            <p className="text-surface-400">{formatDate(r.event.date)} · {r.event.location}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-600 border border-surface-200 whitespace-nowrap">
                              {r.category}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-semibold text-surface-700">{r.suppliersInvited}</p>
                            <p className="text-surface-400">suppliers</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <ProgressRing value={r.suppliersInvited > 0 ? (r.responses / r.suppliersInvited) * 100 : 0} size={32} />
                              <span className="text-xs text-surface-500 tabular-nums">
                                {r.responses}/{r.suppliersInvited}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-surface-700 whitespace-nowrap">
                            {formatGBP(r.quoteRangeLow)} – {formatGBP(r.quoteRangeHigh)}
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            <p className={cn("font-semibold", overdue ? "text-danger-600" : "text-surface-700")}>
                              {overdue ? "Overdue" : relativeFuture(r.dueDate)}
                            </p>
                            <p className="text-surface-400">{formatDate(r.dueDate)}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <RfqStatusChip status={r.status} />
                          </td>
                          <td className="px-4 py-3.5 text-xs text-surface-600">{r.awardedSupplierName ?? "—"}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                aria-label="View RFQ"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-surface-100 transition-colors"
                              >
                                <Eye className="w-4 h-4" strokeWidth={1.8} />
                              </button>
                              <button
                                type="button"
                                aria-label="More actions"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors"
                              >
                                <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="RFQs" />
        </div>

        <InsightsRail>
          <RailCard title="Response Analytics">
            <MiniDonut segments={responseAnalytics} centerLabel={String(responseAnalytics.reduce((s, r) => s + r.value, 0))} centerSubLabel="Invites" />
          </RailCard>
          <RailCard title="Award Rate" footer={<p className="text-[11px] text-surface-400">{awardRate.awarded} of {awardRate.total} RFQs awarded</p>}>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-surface-900 tabular-nums">{awardRate.rate}%</span>
            </div>
            <div className="flex items-end gap-1" style={{ height: 40 }}>
              {awardRate.trend.map((v, i) => (
                <div key={i} className="flex-1 bg-success-400 rounded-t min-h-[2px]" style={{ height: `${v}%` }} />
              ))}
            </div>
          </RailCard>
          <RailCard title="Recent Supplier Responses">
            <ActivityList items={recentResponses.map((r) => ({ name: r.name, initials: r.name.slice(0, 2).toUpperCase(), color: "bg-brand-500", text: r.text, timestamp: r.timestamp }))} />
          </RailCard>
          <RailCard title="Category Demand" footer={<p className="text-[11px] text-surface-400">This month</p>}>
            <ul className="space-y-2.5">
              {categoryDemand.map((c) => (
                <li key={c.label} className="flex items-center justify-between text-xs">
                  <span className="text-surface-600 truncate">{c.label}</span>
                  <span className="font-semibold text-surface-800 tabular-nums shrink-0">{c.sharePct}%</span>
                </li>
              ))}
            </ul>
          </RailCard>
        </InsightsRail>
      </div>
    </div>
  );
}
