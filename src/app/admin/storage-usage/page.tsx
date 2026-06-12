"use client";

import { HardDrive, AlertTriangle, BarChart2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { cn } from "@/lib/utils";

const ROWS = [
  { workspace: "Skyline Venues", used: "22.4 GB", limit: "50 GB", pct: 44.8, lastUpload: "10 Jun 2026 09:15" },
  { workspace: "Luxe Celebrations", used: "5.8 GB", limit: "10 GB", pct: 58, lastUpload: "10 Jun 2026 08:31" },
  { workspace: "The Grand Affair", used: "2.1 GB", limit: "10 GB", pct: 21, lastUpload: "10 Jun 2026 09:42" },
  { workspace: "Milan Events", used: "1.4 GB", limit: "10 GB", pct: 14, lastUpload: "9 Jun 2026 17:44" },
  { workspace: "Bloom Events Co.", used: "340 MB", limit: "5 GB", pct: 6.8, lastUpload: "9 Jun 2026 14:22" },
  { workspace: "Petal & Vine", used: "90 MB", limit: "5 GB", pct: 1.8, lastUpload: "9 Jun 2026 11:05" },
  { workspace: "Goldencrest Events", used: "210 MB", limit: "5 GB", pct: 4.2, lastUpload: "8 Jun 2026 10:00" },
  { workspace: "Horizon Gatherings", used: "780 MB", limit: "5 GB", pct: 15.6, lastUpload: "7 Jun 2026 16:30" },
];

function pctColor(pct: number) {
  if (pct > 80) return "bg-danger-500";
  if (pct > 50) return "bg-warning-500";
  return "bg-success-500";
}

function pctTextColor(pct: number) {
  if (pct > 80) return "text-danger-700";
  if (pct > 50) return "text-warning-700";
  return "text-success-700";
}

export default function StorageUsagePage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Storage Usage"
        description="Storage consumption across all workspaces."
      />

      <div className="p-6 space-y-6">
        <KPIGrid className="grid-cols-1 sm:grid-cols-3">
          <MetricCard label="Total Stored" value="4.2 GB" icon={HardDrive} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Avg per Workspace" value="17 MB" icon={BarChart2} iconBg="bg-surface-100" iconColor="text-surface-600" />
          <MetricCard label="Approaching Limit" value="3" icon={AlertTriangle} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Used</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Limit</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider w-48">% Used</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Last Upload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {ROWS.map((row) => (
                  <tr key={row.workspace} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-surface-900">{row.workspace}</td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{row.used}</td>
                    <td className="px-5 py-3 text-surface-500 tabular-nums">{row.limit}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", pctColor(row.pct))}
                            style={{ width: `${Math.min(row.pct, 100)}%` }}
                          />
                        </div>
                        <span className={cn("text-xs font-medium tabular-nums w-10 text-right", pctTextColor(row.pct))}>
                          {row.pct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-surface-500">{row.lastUpload}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
