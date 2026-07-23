"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Shield, TrendingUp, Timer, Users2, PauseCircle, FileWarning, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SupplierRecord } from "../_data/types";
import { SupplierCard, type SupplierCardData } from "@/components/workspace-cards/SupplierCard";
import {
  computeAllSuppliersKpis,
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

/**
 * Map a `SupplierRecord` (already resolved server-side in `_data/queries.ts`)
 * onto the shared `SupplierCardData` shape used by the reusable `SupplierCard`.
 * There's no `logo_path` -> URL resolution wired up anywhere in this codebase
 * yet, so `logoUrl` is left null rather than fabricated — `SupplierCard`
 * already falls back to initials when it's absent.
 */
function toSupplierCardData(s: SupplierRecord): SupplierCardData {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    category: s.category,
    ratingInternal: s.rating,
    logoUrl: null,
    insuranceExpiry: s.insuranceExpiryDate,
    responseTimeLabel: s.responseRatePct ? `${s.responseRatePct}% response rate` : null,
  };
}

export function AllSuppliersView({ suppliers }: { suppliers: SupplierRecord[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"table" | "grid">("table");

  const kpis = useMemo(() => computeAllSuppliersKpis(suppliers), [suppliers]);
  const health = useMemo(() => computeSupplierHealth(suppliers), [suppliers]);
  const categoryMix = useMemo(() => computeCategoryMix(suppliers), [suppliers]);
  const activity = useMemo(() => computeRecentActivity(suppliers), [suppliers]);
  const compliance = useMemo(() => computeComplianceSnapshot(suppliers), [suppliers]);

  const categories = useMemo(() => [...new Set(suppliers.map((s) => s.category))].sort(), [suppliers]);
  const regions = useMemo(() => [...new Set(suppliers.flatMap((s) => s.coverageRegions))].sort(), [suppliers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (location !== "all" && !s.coverageRegions.includes(location)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [suppliers, query, category, location]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <SupplierKpiRow
        items={[
          { label: "Total Suppliers", value: kpis.total, icon: Users2, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Active Suppliers", value: kpis.active, icon: TrendingUp, iconColor: "text-success-600", iconBg: "bg-success-50" },
          { label: "Paused", value: kpis.paused, icon: PauseCircle, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "Missing Documents", value: kpis.missingDocs, icon: FileWarning, iconColor: "text-danger-600", iconBg: "bg-danger-50" },
          { label: "Insurance Expiring Soon", value: kpis.insuranceExpiringSoon, icon: Shield, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "Avg Response Rate", value: `${kpis.avgResponseRate}%`, icon: AlertTriangle, iconColor: "text-info-600", iconBg: "bg-info-50" },
          { label: "Avg Lead Time", value: `${kpis.avgLeadTimeDays}d`, icon: Timer, iconColor: "text-violet-600", iconBg: "bg-violet-50" },
        ]}
      />

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SupplierToolbar
                query={query}
                onQueryChange={(v) => { setQuery(v); setPage(1); }}
                searchPlaceholder="Search suppliers…"
                filters={[
                  { label: "Category", value: category, options: categories, onChange: (v) => { setCategory(v); setPage(1); } },
                  { label: "Location", value: location, options: regions, onChange: (v) => { setLocation(v); setPage(1); } },
                  { label: "Compliance", value: "all", options: ["Compliant", "At Risk", "Non-Compliant"], onChange: () => {} },
                ]}
                moreFiltersCount={2}
              />
            </div>
            <div className="hidden sm:flex items-center rounded-lg border border-surface-200 overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setView("table")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                  view === "table" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:bg-surface-50"
                )}
                aria-label="Table view"
                aria-pressed={view === "table"}
              >
                <List className="w-4 h-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-surface-200",
                  view === "grid" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:bg-surface-50"
                )}
                aria-label="Grid view"
                aria-pressed={view === "grid"}
              >
                <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {view === "grid" ? (
            filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <EmptyState icon={Users2} title="No suppliers found" description="Try a different filter or search term." compact />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {paged.map((s) => (
                    <SupplierCard key={s.id} supplier={toSupplierCardData(s)} />
                  ))}
                </div>
                <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="suppliers" />
              </>
            )
          ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState icon={Users2} title="No suppliers found" description="Try a different filter or search term." compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1100px]">
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
                          <p>{s.primaryContact.phone}</p>
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
                          <p className={relativeFuture(s.insuranceExpiryDate) === "Overdue" ? "text-danger-600" : "text-surface-400"}>
                            {s.insuranceExpiryDate ? (relativeFuture(s.insuranceExpiryDate) === "Overdue" ? "Expired" : relativeFuture(s.insuranceExpiryDate)) : "—"}
                          </p>
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
          )}

          {view === "table" && (
            <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="suppliers" />
          )}
        </div>

        <InsightsRail>
          <RailCard title="Supplier Health" viewAllHref="/event-manager/suppliers?view=all">
            <MiniDonut segments={health} centerLabel={String(health.reduce((s, h) => s + h.value, 0))} centerSubLabel="Suppliers" />
          </RailCard>
          <RailCard title="Top Categories" viewAllHref="/event-manager/suppliers?view=all">
            <CSSBarChart data={categoryMix} orientation="horizontal" />
          </RailCard>
          <RailCard title="Recent Activity" viewAllHref="/event-manager/suppliers?view=all">
            <ActivityList items={activity} />
          </RailCard>
          <RailCard title="Compliance Snapshot">
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-surface-900 tabular-nums">{compliance.avgScore}%</span>
              <span className="text-xs text-surface-400">Avg across workspace</span>
            </div>
            <CSSBarChart
              data={compliance.trend.map((v, i) => ({ label: String(i + 1), value: v, color: "bg-brand-400" }))}
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
