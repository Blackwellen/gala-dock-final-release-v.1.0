"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileCheck, ShieldCheck, Timer, TrendingUp, Users2 } from "lucide-react";
import type { SupplierRecord } from "../_data/types";
import {
  computeActiveSuppliersKpis,
  computeCategoryMix,
  computeComplianceSnapshot,
  computeRecentActivity,
  computeSupplierHealth,
} from "../_data/kpis";
import { formatDate, relativeFuture } from "../_data/format";
import { SupplierKpiRow } from "../_components/SupplierKpiRow";
import { SupplierToolbar } from "../_components/SupplierToolbar";
import { SupplierPagination } from "../_components/SupplierPagination";
import { InsightsRail, RailCard, ActivityList } from "../_components/SupplierInsightsRail";
import { MiniDonut } from "../_components/MiniDonut";
import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupplierAvatar, RatingStars } from "../_components/SupplierAvatar";
import { CoverageTierChip, DocsCompleteChip } from "../_components/chips";
import { ProgressRing } from "../_components/ProgressRing";
import { ResponseSparkline } from "../_components/ResponseSparkline";
import { RowActions, StarToggle } from "../_components/RowActions";
import { Th } from "../_components/Th";

const PAGE_SIZE = 10;

export function ActiveSuppliersView({ suppliers }: { suppliers: SupplierRecord[] }) {
  const active = useMemo(() => suppliers.filter((s) => s.status === "active"), [suppliers]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [page, setPage] = useState(1);

  const kpis = useMemo(() => computeActiveSuppliersKpis(suppliers), [suppliers]);
  const health = useMemo(() => computeSupplierHealth(active), [active]);
  const categoryMix = useMemo(() => computeCategoryMix(suppliers, "active"), [suppliers]);
  const activity = useMemo(() => computeRecentActivity(active), [active]);
  const compliance = useMemo(() => computeComplianceSnapshot(active), [active]);

  const categories = useMemo(() => [...new Set(active.map((s) => s.category))].sort(), [active]);
  const regions = useMemo(() => [...new Set(active.flatMap((s) => s.coverageRegions))].sort(), [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (coverage !== "all" && !s.coverageRegions.includes(coverage)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [active, query, category, coverage]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <SupplierKpiRow
        items={[
          { label: "Active Suppliers", value: kpis.active, icon: Users2, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Fully Onboarded", value: kpis.fullyOnboarded, icon: CheckCircle2, iconColor: "text-success-600", iconBg: "bg-success-50" },
          { label: "Complete Documents", value: kpis.completeDocs, icon: FileCheck, iconColor: "text-info-600", iconBg: "bg-info-50" },
          { label: "Insurance Current", value: kpis.insuranceCurrent, icon: ShieldCheck, iconColor: "text-success-600", iconBg: "bg-success-50" },
          { label: "Avg Response Rate", value: `${kpis.avgResponseRate}%`, icon: TrendingUp, iconColor: "text-violet-600", iconBg: "bg-violet-50" },
          { label: "Avg Lead Time", value: `${kpis.avgLeadTimeDays}d`, icon: Timer, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        ]}
      />

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <SupplierToolbar
            query={query}
            onQueryChange={(v) => { setQuery(v); setPage(1); }}
            searchPlaceholder="Search active suppliers…"
            filters={[
              { label: "Category", value: category, options: categories, onChange: (v) => { setCategory(v); setPage(1); } },
              { label: "Coverage", value: coverage, options: regions, onChange: (v) => { setCoverage(v); setPage(1); } },
            ]}
            moreFiltersCount={1}
          />

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState icon={Users2} title="No active suppliers found" description="Try a different filter or search term." compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1050px]">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <Th>Supplier</Th>
                      <Th>Primary Contact</Th>
                      <Th>Category</Th>
                      <Th>Coverage</Th>
                      <Th>Onboarding</Th>
                      <Th>Documents</Th>
                      <Th>Insurance Expiry</Th>
                      <Th>Response Rate</Th>
                      <Th className="text-center">Recently Used</Th>
                      <Th>Last Booked</Th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {paged.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-50 transition-colors group">
                        <td className="px-4 py-3.5">
                          <Link href={`/event-manager/suppliers/${s.id}`} className="flex items-center gap-3">
                            <SupplierAvatar initials={s.logoInitials} color={s.logoColor} />
                            <div className="min-w-0">
                              <p className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors truncate">{s.name}</p>
                              <RatingStars value={s.rating} />
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-surface-500">
                          <p className="font-medium text-surface-700">{s.primaryContact.name}</p>
                          <p>{s.primaryContact.email}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-surface-700 mb-1">{s.category}</p>
                          <CoverageTierChip tier={s.tier} />
                        </td>
                        <td className="px-4 py-3.5 text-surface-500 text-xs">{s.coverageRegions.join(", ")}</td>
                        <td className="px-4 py-3.5">
                          <ProgressRing value={s.onboardingPct} />
                        </td>
                        <td className="px-4 py-3.5">
                          <DocsCompleteChip approved={s.documents.approved} required={s.documents.required} />
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="text-surface-700">{formatDate(s.insuranceExpiryDate)}</p>
                          <p className="text-surface-400">{relativeFuture(s.insuranceExpiryDate)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-surface-700 tabular-nums">{s.responseRatePct}%</span>
                            <ResponseSparkline points={s.responseTrend} />
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <StarToggle supplierId={s.id} starred={s.isStarred} />
                        </td>
                        <td className="px-4 py-3.5 text-surface-500 text-xs whitespace-nowrap">{formatDate(s.lastBookedDate)}</td>
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

          <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="active suppliers" />
        </div>

        <InsightsRail>
          <RailCard title="Supplier Health">
            <MiniDonut segments={health} centerLabel={String(health.reduce((s, h) => s + h.value, 0))} centerSubLabel="Active" />
          </RailCard>
          <RailCard title="Category Mix">
            <CSSBarChart data={categoryMix} orientation="horizontal" />
          </RailCard>
          <RailCard title="Recent Activity">
            <ActivityList items={activity} />
          </RailCard>
          <RailCard title="Compliance Snapshot">
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-surface-900 tabular-nums">{compliance.avgScore}%</span>
              <span className="text-xs text-surface-400">Avg across active</span>
            </div>
            <CSSBarChart
              data={compliance.trend.map((v, i) => ({ label: String(i + 1), value: v, color: "bg-success-400" }))}
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
