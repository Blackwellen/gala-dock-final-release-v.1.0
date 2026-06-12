"use client";

import { ShieldCheck, LogIn, Users, Flag, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";

const EVENTS = [
  { type: "Failed login", workspace: "The Grand Affair", ip: "185.123.45.67", timestamp: "10 Jun 2026 09:22" },
  { type: "Failed login", workspace: "Skyline Venues", ip: "78.45.201.88", timestamp: "10 Jun 2026 08:55" },
  { type: "Flagged content", workspace: "Bloom Events Co.", ip: "92.184.33.12", timestamp: "9 Jun 2026 17:30" },
  { type: "Failed login (5 attempts)", workspace: "Luxe Celebrations", ip: "217.34.122.9", timestamp: "9 Jun 2026 14:45" },
  { type: "Suspicious IP access", workspace: "Milan Events", ip: "45.89.203.11", timestamp: "8 Jun 2026 11:22" },
];

const EVENT_TYPE_STYLES: Record<string, string> = {
  "Failed login": "bg-warning-50 text-warning-700 border-warning-200",
  "Failed login (5 attempts)": "bg-danger-50 text-danger-700 border-danger-200",
  "Flagged content": "bg-orange-50 text-orange-700 border-orange-200",
  "Suspicious IP access": "bg-danger-50 text-danger-700 border-danger-200",
};

export default function SecurityPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Security"
        description="Platform security overview — login failures, active sessions, and flagged content."
      />

      <div className="p-6 space-y-6">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Failed Logins (24h)" value="7" icon={LogIn} iconBg="bg-danger-50" iconColor="text-danger-600" />
          <MetricCard label="Active Sessions" value="342" icon={Users} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Flagged Content" value="2" icon={Flag} iconBg="bg-warning-50" iconColor="text-warning-600" />
          <MetricCard label="MFA Adoption" value="67%" icon={ShieldCheck} iconBg="bg-success-50" iconColor="text-success-600" />
        </KPIGrid>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
            <Lock className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
            <h2 className="text-sm font-semibold text-surface-900">Recent Security Events</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">IP</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {EVENTS.map((e, i) => (
                  <tr key={i} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${EVENT_TYPE_STYLES[e.type] || "bg-surface-100 text-surface-600 border-surface-200"}`}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-600">{e.workspace}</td>
                    <td className="px-5 py-3 font-mono text-xs text-surface-500">{e.ip}</td>
                    <td className="px-5 py-3 text-surface-500">{e.timestamp}</td>
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
