"use client";

import { Link2, PoundSterling, Users, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

const AFFILIATES = [
  { id: "aff1", name: "James Okafor", email: "james@gala-dock.com", status: "active" as const, clicks: 342, conversions: 8, earnings: "£1,240", joined: "1 Feb 2025" },
  { id: "aff2", name: "Priya Chandran", email: "priya@thegrandaffair.co.uk", status: "active" as const, clicks: 187, conversions: 4, earnings: "£596", joined: "15 Mar 2025" },
  { id: "aff3", name: "Tom Aldridge", email: "tom@bloomevents.co.uk", status: "active" as const, clicks: 95, conversions: 2, earnings: "£298", joined: "20 Apr 2025" },
  { id: "aff4", name: "Elena Russo", email: "elena@luxecelebrations.co.uk", status: "pending" as const, clicks: 12, conversions: 0, earnings: "£0", joined: "1 Jun 2025" },
];

export function AffiliatesPageClient() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Affiliates"
        description="All active affiliate partners and their performance metrics."
      />

      <div className="p-6 space-y-6">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Affiliates" value={AFFILIATES.length} icon={Link2} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Total Earned (All)" value="£2,134" icon={PoundSterling} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Total Conversions" value="14" icon={Users} iconBg="bg-violet-50" iconColor="text-violet-600" />
          <MetricCard label="Total Clicks" value="636" icon={MousePointerClick} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Affiliate</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Clicks</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Conversions</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Total Earned</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {AFFILIATES.map((aff) => (
                  <tr key={aff.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-[10px] font-semibold">
                            {aff.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <a
                            href={`/admin/affiliates/${aff.id}`}
                            className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors block"
                          >
                            {aff.name}
                          </a>
                          <p className="text-xs text-surface-400">{aff.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={aff.status} /></td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{aff.clicks}</td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{aff.conversions}</td>
                    <td className="px-5 py-3 font-medium text-surface-900">{aff.earnings}</td>
                    <td className="px-5 py-3 text-surface-500">{aff.joined}</td>
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
