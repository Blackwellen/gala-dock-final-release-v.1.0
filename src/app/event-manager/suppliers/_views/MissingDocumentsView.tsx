"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertOctagon, Banknote, CalendarX2, FileWarning, Gauge, ShieldAlert } from "lucide-react";
import type { SupplierRecord } from "../_data/types";
import {
  computeComplianceRiskOverview,
  computeMissingDocumentsKpis,
  computeOverdueByDocType,
  computeRecentChaserActivity,
  computeSupplierHealth,
  formatGBP,
  hasMissingDocs,
} from "../_data/kpis";
import { formatDate, isOverdue, relativeFuture, relativePast } from "../_data/format";
import { SupplierKpiRow } from "../_components/SupplierKpiRow";
import { SupplierToolbar } from "../_components/SupplierToolbar";
import { SupplierPagination } from "../_components/SupplierPagination";
import { InsightsRail, RailCard, ActivityList } from "../_components/SupplierInsightsRail";
import { MiniDonut } from "../_components/MiniDonut";
import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupplierAvatar } from "../_components/SupplierAvatar";
import { MissingDocChip, OutreachStatusChip, RiskLevelChip } from "../_components/chips";
import { ProgressRing } from "../_components/ProgressRing";
import { DocumentChaseAction } from "../_components/RowActions";
import { Th } from "../_components/Th";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

export function MissingDocumentsView({ suppliers }: { suppliers: SupplierRecord[] }) {
  const flagged = useMemo(() => suppliers.filter(hasMissingDocs), [suppliers]);
  const [query, setQuery] = useState("");
  const [docType, setDocType] = useState("all");
  const [riskLevel, setRiskLevel] = useState("all");
  const [page, setPage] = useState(1);

  const kpis = useMemo(() => computeMissingDocumentsKpis(suppliers), [suppliers]);
  const riskOverview = useMemo(() => computeComplianceRiskOverview(suppliers), [suppliers]);
  const overdueByType = useMemo(() => computeOverdueByDocType(suppliers), [suppliers]);
  const chaserActivity = useMemo(() => computeRecentChaserActivity(suppliers), [suppliers]);
  const health = useMemo(() => computeSupplierHealth(suppliers), [suppliers]);

  const docTypes = useMemo(() => [...new Set(flagged.flatMap((s) => s.documents.missingTypes))].sort(), [flagged]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flagged.filter((s) => {
      if (docType !== "all" && !s.documents.missingTypes.includes(docType)) return false;
      if (riskLevel !== "all" && s.riskLevel !== riskLevel) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [flagged, query, docType, riskLevel]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <SupplierKpiRow
        items={[
          { label: "High Risk Suppliers", value: kpis.highRiskSuppliers, icon: ShieldAlert, iconColor: "text-danger-600", iconBg: "bg-danger-50" },
          { label: "Overdue Documents", value: kpis.overdueDocuments, icon: AlertOctagon, iconColor: "text-danger-600", iconBg: "bg-danger-50" },
          { label: "Expiring in 30 Days", value: kpis.expiring30Days, icon: CalendarX2, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "Total Missing Documents", value: kpis.totalMissingDocuments, icon: FileWarning, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "At-Risk Contract Value", value: formatGBP(kpis.atRiskContractValue), icon: Banknote, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Compliance Score", value: `${kpis.complianceScore}%`, icon: Gauge, iconColor: "text-info-600", iconBg: "bg-info-50" },
        ]}
      />

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <SupplierToolbar
            query={query}
            onQueryChange={(v) => { setQuery(v); setPage(1); }}
            searchPlaceholder="Search suppliers with missing documents…"
            filters={[
              { label: "Document Type", value: docType, options: docTypes, onChange: (v) => { setDocType(v); setPage(1); } },
              { label: "Risk Level", value: riskLevel, options: ["high", "medium", "low"], onChange: (v) => { setRiskLevel(v); setPage(1); } },
            ]}
            moreFiltersCount={3}
          />

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState icon={FileWarning} title="No missing documents" description="Every supplier in this filter is fully compliant." compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1150px]">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <Th>Supplier</Th>
                      <Th>Missing Documents</Th>
                      <Th>Highest Risk</Th>
                      <Th>Due Date</Th>
                      <Th>Progress</Th>
                      <Th>Outreach Status</Th>
                      <Th>Last Contact</Th>
                      <th className="px-4 py-3 w-44" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {paged.map((s) => {
                      const nextDue = s.missingDocuments[0]?.dueDate ?? null;
                      const overdue = isOverdue(nextDue);
                      return (
                        <tr key={s.id} className="hover:bg-surface-50 transition-colors group">
                          <td className="px-4 py-3.5">
                            <Link href={`/event-manager/suppliers/${s.id}`} className="flex items-center gap-3">
                              <SupplierAvatar initials={s.logoInitials} color={s.logoColor} />
                              <div className="min-w-0">
                                <p className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors truncate">{s.name}</p>
                                <p className="text-xs text-surface-400">{s.coverageRegions.join(", ")}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {s.documents.missingTypes.slice(0, 2).map((t) => (
                                <MissingDocChip key={t} label={t} />
                              ))}
                              {s.documents.missingTypes.length > 2 && (
                                <span className="text-[11px] text-surface-400">+{s.documents.missingTypes.length - 2} more</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <RiskLevelChip level={s.riskLevel} />
                            <p className="text-[11px] text-surface-400 mt-1">Compliance risk</p>
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            <p className={cn("font-semibold", overdue ? "text-danger-600" : "text-surface-700")}>
                              {overdue ? "Overdue" : relativeFuture(nextDue)}
                            </p>
                            <p className="text-surface-400">{formatDate(nextDue)}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <ProgressRing value={(s.documents.approved / s.documents.required) * 100} size={32} />
                          </td>
                          <td className="px-4 py-3.5">
                            <OutreachStatusChip status={s.outreachStatus} />
                            <p className="text-[11px] text-surface-400 mt-1">Last chased {relativePast(s.lastContactAt)}</p>
                          </td>
                          <td className="px-4 py-3.5 text-surface-500 text-xs whitespace-nowrap">{formatDate(s.lastContactAt)}</td>
                          <td className="px-4 py-3.5">
                            <DocumentChaseAction
                              supplierId={s.id}
                              state={s.outreachStatus === "not-contacted" ? "request" : "remind"}
                              missingTypes={s.documents.missingTypes}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="suppliers" />
        </div>

        <InsightsRail>
          <RailCard title="Compliance Risk Overview" footer={<p className="text-[11px] text-surface-400">{riskOverview.atRiskCount} suppliers at risk of non-compliance</p>}>
            <MiniDonut segments={riskOverview.segments} centerLabel={String(riskOverview.atRiskCount)} centerSubLabel="At risk" />
          </RailCard>
          <RailCard title="Overdue by Document Type">
            <CSSBarChart data={overdueByType} orientation="horizontal" />
          </RailCard>
          <RailCard title="Recent Chaser Activity">
            <ActivityList items={chaserActivity.map((a) => ({ text: a.text, timestamp: a.timestamp, color: "bg-warning-500" }))} />
          </RailCard>
          <RailCard title="Supplier Health">
            <MiniDonut segments={health} size={100} showLegend={false} centerLabel={`${Math.round((health.find((h) => h.label === "Healthy")?.pct ?? 0))}%`} centerSubLabel="Healthy" />
          </RailCard>
        </InsightsRail>
      </div>
    </div>
  );
}
