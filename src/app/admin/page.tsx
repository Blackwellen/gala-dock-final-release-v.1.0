"use client";

import {
  Building2, CreditCard, PoundSterling, Headphones,
  Activity, Cpu, AlertTriangle, Zap, TrendingUp,
} from "lucide-react";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";

const RECENT_SIGNUPS = [
  { workspace: "The Grand Affair", plan: "Pro", created: "9 Jun 2026", owner: "Priya Chandran" },
  { workspace: "Bloom Events Co.", plan: "Starter", created: "8 Jun 2026", owner: "Tom Aldridge" },
  { workspace: "Luxe Celebrations", plan: "Pro", created: "7 Jun 2026", owner: "Elena Russo" },
  { workspace: "Skyline Venues", plan: "Enterprise", created: "6 Jun 2026", owner: "Marcus Webb" },
  { workspace: "Petal & Vine", plan: "Starter", created: "5 Jun 2026", owner: "Sophie Hart" },
];

const RECENT_TICKETS = [
  { id: "TKT-0042", subject: "Invoice PDF not generating", workspace: "Bloom Events Co.", status: "open" as const, created: "10 Jun 2026" },
  { id: "TKT-0041", subject: "Stripe payment stuck on pending", workspace: "Luxe Celebrations", status: "pending" as const, created: "9 Jun 2026" },
  { id: "TKT-0040", subject: "Smart rule not triggering", workspace: "The Grand Affair", status: "active" as const, created: "8 Jun 2026" },
  { id: "TKT-0039", subject: "Cannot upload supplier contract", workspace: "Petal & Vine", status: "confirmed" as const, created: "7 Jun 2026" },
];

const ALERTS = [
  {
    level: "warning" as const,
    title: "Storage quota warning",
    body: "3 workspaces are above 90% of their storage limit.",
    time: "2h ago",
  },
  {
    level: "danger" as const,
    title: "Stripe webhook failure",
    body: "Webhook delivery failed at 02:14 — event payment_intent.succeeded not processed.",
    time: "8h ago",
  },
  {
    level: "info" as const,
    title: "Database maintenance window",
    body: "Scheduled maintenance on 15 Jun 2026 at 02:00 UTC. Expect ~5 min downtime.",
    time: "1d ago",
  },
];

const ALERT_STYLES = {
  warning: "bg-warning-50 border-warning-200 text-warning-700",
  danger: "bg-danger-50 border-danger-200 text-danger-700",
  info: "bg-brand-50 border-brand-200 text-brand-700",
};

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Admin Overview"
        description="Platform-level metrics, recent activity, and system alerts."
      />

      <div className="p-6 space-y-8">
        {/* KPIs */}
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Total Workspaces" value="247" icon={Building2} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Active Subscriptions" value="183" icon={CreditCard} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="MRR" value="£27,450" icon={PoundSterling} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Support Tickets Open" value="12" icon={Headphones} iconBg="bg-warning-50" iconColor="text-warning-600" />
          <MetricCard label="System Health" value="99.8%" icon={Activity} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="AI Calls Today" value="1,204" icon={Cpu} iconBg="bg-violet-50" iconColor="text-violet-600" />
        </KPIGrid>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent signups */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
                Recent Sign-ups
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Plan</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Created</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {RECENT_SIGNUPS.map((row) => (
                    <tr key={row.workspace} className="hover:bg-surface-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-surface-900">{row.workspace}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                          {row.plan}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-surface-500">{row.created}</td>
                      <td className="px-5 py-3 text-surface-600">{row.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* System Alerts */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-600" strokeWidth={1.8} />
              <h2 className="text-sm font-semibold text-surface-900">System Alerts</h2>
            </div>
            <div className="p-4 space-y-3">
              {ALERTS.map((alert) => (
                <div
                  key={alert.title}
                  className={`rounded-lg border p-3 ${ALERT_STYLES[alert.level]}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold">{alert.title}</p>
                    <span className="text-[10px] opacity-70 shrink-0">{alert.time}</span>
                  </div>
                  <p className="mt-1 text-xs opacity-80 leading-relaxed">{alert.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent support tickets */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
            <Headphones className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
            <h2 className="text-sm font-semibold text-surface-900">Recent Support Tickets</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Ticket</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {RECENT_TICKETS.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-surface-500">{t.id}</td>
                    <td className="px-5 py-3 font-medium text-surface-900">{t.subject}</td>
                    <td className="px-5 py-3 text-surface-600">{t.workspace}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-5 py-3 text-surface-500">{t.created}</td>
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
