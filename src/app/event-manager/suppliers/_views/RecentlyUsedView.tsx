"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Banknote, Repeat2, TrendingUp, Users2, Zap } from "lucide-react";
import type { SupplierRecord } from "../_data/types";
import {
  computePerformanceTrend,
  computeRecentActivity,
  computeRecentlyUsedKpis,
  computeTopBookedCategories,
  computeUpcomingEventAllocations,
  formatGBP,
} from "../_data/kpis";
import { formatDate, relativePast } from "../_data/format";
import { SupplierKpiRow } from "../_components/SupplierKpiRow";
import { SupplierToolbar } from "../_components/SupplierToolbar";
import { SupplierPagination } from "../_components/SupplierPagination";
import { InsightsRail, RailCard, ActivityList } from "../_components/SupplierInsightsRail";
import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupplierAvatar } from "../_components/SupplierAvatar";
import { ProgressRing } from "../_components/ProgressRing";
import { RowActions } from "../_components/RowActions";
import { Th } from "../_components/Th";

const PAGE_SIZE = 10;

export function RecentlyUsedView({ suppliers }: { suppliers: SupplierRecord[] }) {
  const recentlyUsed = useMemo(
    () => [...suppliers.filter((s) => s.recentlyUsedAt !== null)].sort((a, b) => (a.lastBookedDate ?? "").localeCompare(b.lastBookedDate ?? "") * -1),
    [suppliers]
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const kpis = useMemo(() => computeRecentlyUsedKpis(suppliers), [suppliers]);
  const activity = useMemo(() => computeRecentActivity(recentlyUsed), [recentlyUsed]);
  const topCategories = useMemo(() => computeTopBookedCategories(suppliers), [suppliers]);
  const allocations = useMemo(() => computeUpcomingEventAllocations(suppliers), [suppliers]);
  const performance = useMemo(() => computePerformanceTrend(suppliers), [suppliers]);

  const categories = useMemo(() => [...new Set(recentlyUsed.map((s) => s.category))].sort(), [recentlyUsed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recentlyUsed.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [recentlyUsed, query, category]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <SupplierKpiRow
        items={[
          { label: "Total Suppliers", value: kpis.total, icon: Users2, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Active Suppliers", value: kpis.active, icon: TrendingUp, iconColor: "text-success-600", iconBg: "bg-success-50" },
          { label: "Recently Used This Month", value: kpis.recentlyUsedThisMonth, icon: Zap, iconColor: "text-violet-600", iconBg: "bg-violet-50" },
          { label: "Avg Response Rate", value: `${kpis.avgResponseRate}%`, icon: ArrowUpDown, iconColor: "text-info-600", iconBg: "bg-info-50" },
          { label: "Last-Booked Velocity", value: `${kpis.lastBookedVelocityDays}d`, icon: Banknote, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "Repeat Booking Rate", value: `${kpis.repeatBookingRate}%`, icon: Repeat2, iconColor: "text-success-600", iconBg: "bg-success-50" },
        ]}
      />

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <SupplierToolbar
            query={query}
            onQueryChange={(v) => { setQuery(v); setPage(1); }}
            searchPlaceholder="Search recently used suppliers…"
            filters={[
              { label: "Category", value: category, options: categories, onChange: (v) => { setCategory(v); setPage(1); } },
            ]}
            moreFiltersCount={1}
          />

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState icon={Zap} title="No recently used suppliers" description="Suppliers booked in the last 90 days will appear here." compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1150px]">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          Supplier <ArrowUpDown className="w-3 h-3" strokeWidth={2} />
                        </span>
                      </th>
                      <Th>Last Event Used</Th>
                      <Th>Upcoming Bookings</Th>
                      <Th>Recent Spend (90 Days)</Th>
                      <Th>Performance Score</Th>
                      <Th>Last Booked</Th>
                      <Th>Event Categories</Th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {paged.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-50 transition-colors group">
                        <td className="px-4 py-3.5">
                          <Link href={`/event-manager/suppliers/${s.id}`} className="flex items-center gap-3">
                            <SupplierAvatar initials={s.logoInitials} color={s.logoColor} />
                            <p className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors truncate">{s.name}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="text-surface-700 font-medium truncate max-w-[200px]">{s.lastEventUsed?.name}</p>
                          <p className="text-surface-400">{s.lastEventUsed?.location} · {formatDate(s.lastEventUsed?.date)}</p>
                          <p className="text-surface-400">{s.lastEventUsed?.category}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="font-semibold text-surface-700">{s.upcomingBookingsCount}</p>
                          {s.nextBookingDate && <p className="text-surface-400">Next: {formatDate(s.nextBookingDate)}</p>}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-surface-800 tabular-nums">{formatGBP(s.recentSpend90d)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <ProgressRing value={s.performanceScore} size={32} />
                            <span className="text-xs text-surface-500">{s.performanceLabel}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="text-surface-700">{formatDate(s.lastBookedDate)}</p>
                          <p className="text-surface-400">{relativePast(s.lastBookedDate)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {s.eventCategories.slice(0, 2).map((c) => (
                              <span key={c} className="text-[11px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                                {c}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <RowActions supplierId={s.id} status={s.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="recently used suppliers" />
        </div>

        <InsightsRail>
          <RailCard title="Recent Supplier Activity">
            <ActivityList items={activity} />
          </RailCard>
          <RailCard title="Top Booked Categories">
            <CSSBarChart data={topCategories} orientation="horizontal" />
          </RailCard>
          <RailCard title="Upcoming Event Allocations">
            <ul className="space-y-2.5">
              {allocations.map((a) => (
                <li key={a.name} className="text-xs">
                  <p className="font-medium text-surface-800 truncate">{a.name}</p>
                  <p className="text-surface-400">{formatDate(a.date)} · {a.count} suppliers allocated</p>
                </li>
              ))}
            </ul>
          </RailCard>
          <RailCard title="Performance Trends (90 Days)">
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-surface-900 tabular-nums">{performance.avgScore}</span>
              <span className="text-xs text-surface-400">Avg score</span>
            </div>
            <CSSBarChart
              data={performance.trend.map((v, i) => ({ label: String(i + 1), value: v, color: "bg-violet-400" }))}
              orientation="vertical"
              height={48}
              showValues={false}
            />
          </RailCard>
        </InsightsRail>
      </div>
    </div>
  );
}
