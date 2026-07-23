"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, CalendarClock, RotateCcw, ShieldOff, Timer, Users2 } from "lucide-react";
import type { SupplierRecord } from "../_data/types";
import {
  computeArchiveReasons,
  computeArchivedOverTime,
  computeArchivedSuppliersKpis,
  computeRetentionPolicy,
} from "../_data/kpis";
import { daysFromToday, formatDate, relativePast } from "../_data/format";
import { SupplierKpiRow } from "../_components/SupplierKpiRow";
import { SupplierToolbar } from "../_components/SupplierToolbar";
import { SupplierPagination } from "../_components/SupplierPagination";
import { InsightsRail, RailCard, ActivityList } from "../_components/SupplierInsightsRail";
import { MiniDonut } from "../_components/MiniDonut";
import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupplierAvatar } from "../_components/SupplierAvatar";
import { CanBeRestoredChip, CoverageTierChip } from "../_components/chips";
import { RestoreAction } from "../_components/RowActions";
import { Th } from "../_components/Th";

const PAGE_SIZE = 10;

export function ArchivedSuppliersView({ suppliers }: { suppliers: SupplierRecord[] }) {
  const archived = useMemo(() => suppliers.filter((s) => s.status === "archived"), [suppliers]);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("all");
  const [canRestore, setCanRestore] = useState("all");
  const [page, setPage] = useState(1);

  const kpis = useMemo(() => computeArchivedSuppliersKpis(suppliers), [suppliers]);
  const reasonsChart = useMemo(() => computeArchiveReasons(suppliers), [suppliers]);
  const overTime = useMemo(() => computeArchivedOverTime(suppliers), [suppliers]);
  const retention = useMemo(() => computeRetentionPolicy(suppliers), [suppliers]);
  const recentActivity = useMemo(
    () =>
      [...archived]
        .sort((a, b) => (new Date(b.archive?.archivedAt ?? 0).getTime()) - (new Date(a.archive?.archivedAt ?? 0).getTime()))
        .slice(0, 6)
        .map((s) => ({
          initials: s.archive?.archivedBy.name.split(" ").map((n) => n[0]).join("") ?? "?",
          color: "bg-surface-500",
          text: `${s.archive?.archivedBy.name} archived ${s.name}`,
          timestamp: relativePast(s.archive?.archivedAt),
        })),
    [archived]
  );

  const reasons = useMemo(() => [...new Set(archived.map((s) => s.archive?.reason ?? "Other"))].sort(), [archived]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archived.filter((s) => {
      if (reason !== "all" && s.archive?.reason !== reason) return false;
      if (canRestore !== "all" && String(s.archive?.canBeRestored) !== canRestore) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [archived, query, reason, canRestore]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <SupplierKpiRow
        items={[
          { label: "Total Archived", value: kpis.totalArchived, icon: Archive, iconColor: "text-surface-600", iconBg: "bg-surface-100" },
          { label: "Archived This Month", value: kpis.archivedThisMonth, icon: CalendarClock, iconColor: "text-brand-600", iconBg: "bg-brand-50" },
          { label: "Avg Time to Archive", value: `${kpis.avgTimeToArchiveDays}d`, icon: Timer, iconColor: "text-violet-600", iconBg: "bg-violet-50" },
          { label: "Can Be Restored", value: kpis.canBeRestored, icon: RotateCcw, iconColor: "text-success-600", iconBg: "bg-success-50" },
          { label: "Permanently Expired", value: kpis.permanentlyExpired, icon: ShieldOff, iconColor: "text-danger-600", iconBg: "bg-danger-50" },
          { label: "Data Retention", value: `${kpis.dataRetentionYears}y`, icon: Users2, iconColor: "text-info-600", iconBg: "bg-info-50" },
        ]}
      />

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <SupplierToolbar
            query={query}
            onQueryChange={(v) => { setQuery(v); setPage(1); }}
            searchPlaceholder="Search archived suppliers…"
            filters={[
              { label: "Reason", value: reason, options: reasons, onChange: (v) => { setReason(v); setPage(1); } },
              { label: "Can Be Restored", value: canRestore, options: ["true", "false"], onChange: (v) => { setCanRestore(v); setPage(1); } },
            ]}
          />

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState icon={Archive} title="No archived suppliers" description="Archived suppliers will appear here." compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <Th>Supplier</Th>
                      <Th>Previous Category</Th>
                      <Th>Archived Date</Th>
                      <Th>Reason</Th>
                      <Th>Archived By</Th>
                      <Th className="text-center">Can Be Restored</Th>
                      <Th>Retention Until</Th>
                      <Th>Last Activity</Th>
                      <th className="px-4 py-3 w-36" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {paged.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-50 transition-colors group">
                        <td className="px-4 py-3.5">
                          <Link href={`/event-manager/suppliers/${s.id}`} className="flex items-center gap-3">
                            <SupplierAvatar initials={s.logoInitials} color="bg-surface-400" />
                            <p className="font-medium text-surface-700 group-hover:text-brand-600 transition-colors truncate">{s.name}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-surface-600 mb-1">{s.category}</p>
                          <CoverageTierChip tier={s.tier} />
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="text-surface-700">{formatDate(s.archive?.archivedAt)}</p>
                          <p className="text-surface-400">{relativePast(s.archive?.archivedAt)}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs max-w-[200px]">
                          <p className="font-semibold text-surface-700">{s.archive?.reason}</p>
                          <p className="text-surface-400">{s.archive?.reasonDetail}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <div className="flex items-center gap-2">
                            <SupplierAvatar initials={(s.archive?.archivedBy.name ?? "??").split(" ").map((n) => n[0]).join("")} color="bg-violet-500" size={24} />
                            <div>
                              <p className="text-surface-700">{s.archive?.archivedBy.name}</p>
                              <p className="text-surface-400">{s.archive?.archivedBy.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <CanBeRestoredChip can={!!s.archive?.canBeRestored} />
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <p className="text-surface-700">{formatDate(s.archive?.retentionUntil)}</p>
                          <p className="text-surface-400">
                            {Math.max(0, Math.round((daysFromToday(s.archive?.retentionUntil) ?? 0) / 365))}y left
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-surface-500 text-xs whitespace-nowrap">{formatDate(s.archive?.lastActivityAt)}</td>
                        <td className="px-4 py-3.5">
                          <RestoreAction supplierId={s.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <SupplierPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="archived suppliers" />
        </div>

        <InsightsRail>
          <RailCard title="Archive Reasons">
            <MiniDonut segments={reasonsChart} centerLabel={String(reasonsChart.reduce((s, r) => s + r.value, 0))} centerSubLabel="Archived" />
          </RailCard>
          <RailCard title="Archived Over Time">
            <CSSBarChart data={overTime} orientation="vertical" height={120} showValues={false} />
          </RailCard>
          <RailCard title="Retention & Deletion">
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-surface-500">Retention policy</dt>
                <dd className="font-semibold text-surface-800">{retention.retentionYears} years</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-surface-500">Auto-delete</dt>
                <dd className="font-semibold text-success-600">{retention.autoDeleteEnabled ? "Enabled" : "Disabled"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-surface-500">Deletions (12mo)</dt>
                <dd className="font-semibold text-surface-800">{retention.deletionsLast12mo}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-surface-500">Next scheduled</dt>
                <dd className="font-semibold text-surface-800">{formatDate(retention.nextScheduledDeletion)}</dd>
              </div>
            </dl>
          </RailCard>
          <RailCard title="Recent Archive Activity">
            <ActivityList items={recentActivity} />
          </RailCard>
        </InsightsRail>
      </div>
    </div>
  );
}
