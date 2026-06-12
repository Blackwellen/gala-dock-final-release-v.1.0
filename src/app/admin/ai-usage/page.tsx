"use client";

import { Cpu, Hash, PoundSterling, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";

const ROWS = [
  { workspace: "Skyline Venues", calls: 312, tokens: "648,400", cost: "£3.24", lastCall: "10 Jun 2026 09:58" },
  { workspace: "The Grand Affair", calls: 247, tokens: "514,960", cost: "£2.57", lastCall: "10 Jun 2026 09:42" },
  { workspace: "Luxe Celebrations", calls: 198, tokens: "412,560", cost: "£2.06", lastCall: "10 Jun 2026 08:31" },
  { workspace: "Milan Events", calls: 184, tokens: "383,520", cost: "£1.92", lastCall: "9 Jun 2026 17:44" },
  { workspace: "Bloom Events Co.", calls: 141, tokens: "293,280", cost: "£1.47", lastCall: "9 Jun 2026 14:22" },
  { workspace: "Petal & Vine", calls: 122, tokens: "253,760", cost: "£1.27", lastCall: "9 Jun 2026 11:05" },
];

export default function AIUsagePage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="AI Usage"
        description="Platform-wide AI call volume, token consumption, and estimated costs."
      />

      <div className="p-6 space-y-6">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Calls Today" value="1,204" icon={Cpu} iconBg="bg-violet-50" iconColor="text-violet-600" />
          <MetricCard label="Tokens Today" value="2.4M" icon={Hash} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Cost Today" value="£12.40" icon={PoundSterling} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Top Workspace" value="Skyline Venues" icon={Trophy} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Calls</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Tokens</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Est. Cost</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Last Call</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {ROWS.map((row) => (
                  <tr key={row.workspace} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-surface-900">{row.workspace}</td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{row.calls}</td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{row.tokens}</td>
                    <td className="px-5 py-3 text-surface-900 font-medium tabular-nums">{row.cost}</td>
                    <td className="px-5 py-3 text-surface-500">{row.lastCall}</td>
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
