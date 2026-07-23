"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, PauseCircle, Shield, TrendingUp, Users2, FileWarning } from "lucide-react";
import type { SupplierRecord } from "../_data/types";
import {
  computeDormantSuppliers,
  computePausedSuppliersKpis,
  computePauseReasons,
  computeReactivationOpportunities,
  computeRecentAdminActions,
} from "../_data/kpis";
import { formatDate, relativePast } from "../_data/format";
import { SupplierKpiRow } from "../_components/SupplierKpiRow";
import { SupplierToolbar } from "../_components/SupplierToolbar";
import { SupplierPagination } from "../_components/SupplierPagination";
import { InsightsRail, RailCard, ActivityList } from "../_components/SupplierInsightsRail";
import { MiniDonut } from "../_components/MiniDonut";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupplierAvatar } from "../_components/SupplierAvatar";
import { FitBadge, PauseReasonChip } from "../_components/chips";
import { ProgressRing } from "../_components/ProgressRing";
import { ReactivateAction } from "../_components/RowActions";
import { Th } from "../_components/Th";
import { AlertCircle } from "lucide-react";

const PAGE_SIZE = 10;

export function PausedSuppliersView({ suppliers }: { suppliers: SupplierRecord[] }) {
  const paused = useMemo(() => suppliers.filter((s) => s.status === "paused"), [suppliers]);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("all");
  const [page, setPage] = useState(1);

  const kpis = useMemo(() => computePausedSuppliersKpis(suppliers), [suppliers]);
  const pauseReasons = useMemo(() => computePauseReasons(suppliers), [suppliers]);
  const dormant = useMemo(() => computeDormantSuppliers(suppliers), [suppliers]);
  const reactivation = useMemo(() => computeReactivationOpportunities(suppliers), [suppliers]);
  const adminActions = useMemo(() => computeRecentAdminActions(suppliers), [suppliers]);

  const reasons = useMemo(() => [...new Set(paused.map((s) => s.pause?.reason ?? "Other"))].sort(), [paused]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return paused.filter((s) => {
      if (reason !== "all" && s.pause?.reason !== reason) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [paused, query, reason]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <SupplierKpiRow
        items={[
          { label: "Total Suppliers", value: kpis.total, icon: Users2, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Active Suppliers", value: kpis.active, icon: TrendingUp, iconColor: "text-success-600", iconBg: "bg-success-50" },
          { label: "Paused Suppliers", value: kpis.paused, icon: PauseCircle, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "Missing Documents", value: kpis.missingDocs, icon: FileWarning, iconColor: "text-danger-600", iconBg: "bg-danger-50" },
          { label: "Insurance Expiring Soon", value: kpis.insuranceExpiringSoon, icon: Shield, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
          { label: "Avg Response Rate", value: `${kpis.avgResponseRate}%`, icon: AlertTriangle, iconColor: "text-info-600", iconBg: "bg-info-50" },
        ]}
      />

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <SupplierToolbar
            query={query}
            onQueryChange={(v) => { setQuery(v); setPage(1); }}
            searchPlaceholder="Search paused suppliers…"
            filters={[
              { label: "Pause Reason", value: reason, options: reasons, onChange: (v) => { setReason(v); setPage(1); } },
            ]}
          />

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState icon={PauseCircle} title="No paused suppliers" description="Nothing is currently paused — try a different filter." compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <Th>Supplier</Th>
                      <Th>Primary Contact</Th>
                      <Th>Pause Reason</Th>
                      <Th>Paused On</Th>
                      <Th>Last Used</Th>
                      <Th>Compliance</Th>
                      <Th>Notes / Alerts</Th>
                      <th className="px-4 py-3 w-40" />
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
                        <td className="px-4 py-3.5 text-xs text-surface-500">
                          <p className="font-medium text-surface-700">{s.primaryContact.name}</p>
                          <p>{s.primaryContact.email}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <PauseReasonChip reason={s.pause?.reason ?? "Other"} />
                          <p className="text-[11px] text-surface-400 mt-1 max-w-[220px]">{s.pause?.reasonDetail}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="text-surface-700">{formatDate(s.pause?.pausedAt)}</p>
                          <p className="text-surface-400">{relativePast(s.pause?.pausedAt)}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="text-surface-700">{formatDate(s.lastBookedDate)}</p>
                          <p className="text-surface-400">{relativePast(s.lastBookedDate)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <ProgressRing value={s.complianceScore} size={32} />
                            <span className="text-xs text-surface-500">
                              {s.documents.approved}/{s.documents.required}
                            </span>
                          </div>
                          {s.documents.missingTypes.length > 0 && (
                            <span className="inline-block mt-1 text-[10px] font-medium text-danger-600 bg-danger-50 px-1.5 py-0.5 rounded">
                              Missing Docs
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-surface-500 max-w-[200px]">
                          <span className="flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-warning-500 shrink-0 mt-0.5" strokeWidth={1.8} />
                            {s.pause?.notes}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <ReactivateAction supplierId={s.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="paused suppliers" />
        </div>

        <InsightsRail>
          <RailCard title="Pause Reasons">
            <MiniDonut segments={pauseReasons} centerLabel={String(pauseReasons.reduce((s, r) => s + r.value, 0))} centerSubLabel="Paused" />
          </RailCard>
          <RailCard title="Dormant Suppliers">
            <ul className="space-y-2.5">
              {dormant.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-xs">
                  <span className="text-surface-700 truncate">{d.name}</span>
                  <span className="font-semibold text-warning-600 tabular-nums shrink-0">{d.days}d</span>
                </li>
              ))}
            </ul>
          </RailCard>
          <RailCard title="Reactivation Opportunities">
            <ul className="space-y-3">
              {reactivation.map((r) => (
                <li key={r.name}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-surface-800 truncate">{r.name}</span>
                    <FitBadge fit={r.fit} />
                  </div>
                  <p className="text-[11px] text-surface-400 mt-0.5">{r.note}</p>
                </li>
              ))}
            </ul>
          </RailCard>
          <RailCard title="Recent Admin Actions">
            <ActivityList
              items={adminActions.map((a) => ({ initials: a.admin.split(" ").map((n) => n[0]).join(""), color: "bg-violet-500", text: a.text, timestamp: a.timestamp }))}
            />
          </RailCard>
        </InsightsRail>
      </div>
    </div>
  );
}
