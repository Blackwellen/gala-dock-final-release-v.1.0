"use client";

import { Activity, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

type ServiceStatus = "operational" | "degraded" | "down";

const STATUS_CONFIG: Record<ServiceStatus, { label: string; icon: typeof CheckCircle2; classes: string; dotClass: string }> = {
  operational: { label: "Operational", icon: CheckCircle2, classes: "text-success-600 bg-success-50 border-success-200", dotClass: "bg-success-500" },
  degraded: { label: "Degraded", icon: AlertTriangle, classes: "text-warning-600 bg-warning-50 border-warning-200", dotClass: "bg-warning-500" },
  down: { label: "Down", icon: XCircle, classes: "text-danger-600 bg-danger-50 border-danger-200", dotClass: "bg-danger-500" },
};

const SERVICES = [
  { name: "API", status: "operational" as ServiceStatus, latency: "42 ms", checked: "10 Jun 2026 10:00:00" },
  { name: "Database", status: "operational" as ServiceStatus, latency: "8 ms", checked: "10 Jun 2026 10:00:00" },
  { name: "Storage", status: "degraded" as ServiceStatus, latency: "340 ms", checked: "10 Jun 2026 10:00:00" },
  { name: "Email", status: "operational" as ServiceStatus, latency: "98 ms", checked: "10 Jun 2026 10:00:00" },
  { name: "Stripe", status: "operational" as ServiceStatus, latency: "124 ms", checked: "10 Jun 2026 10:00:00" },
  { name: "AI Service", status: "operational" as ServiceStatus, latency: "611 ms", checked: "10 Jun 2026 10:00:00" },
];

const INCIDENTS = [
  { title: "Storage latency spike", status: "investigating", duration: "Ongoing since 09:45", date: "10 Jun 2026" },
  { title: "Stripe webhook delivery failure", status: "resolved", duration: "23 min", date: "9 Jun 2026" },
  { title: "API rate limiter misconfiguration", status: "resolved", duration: "8 min", date: "2 Jun 2026" },
];

const INC_STYLES: Record<string, string> = {
  investigating: "bg-warning-50 text-warning-700 border-warning-200",
  resolved: "bg-success-50 text-success-700 border-success-200",
};

export default function SystemHealthPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="System Health"
        description="Live status of all platform services and recent incidents."
        actions={
          <div className="flex items-center gap-1.5 text-sm text-success-600 bg-success-50 border border-success-200 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            All systems operational
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Service cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map((svc) => {
            const config = STATUS_CONFIG[svc.status];
            const Icon = config.icon;
            return (
              <div
                key={svc.name}
                className="bg-white rounded-xl border border-surface-200 shadow-card p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-surface-900">{svc.name}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
                      config.classes
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", config.dotClass)} />
                    {config.label}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-surface-500">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" strokeWidth={1.8} />
                    {svc.latency}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.8} />
                    {svc.checked.split(" ")[1]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Incident history */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning-600" strokeWidth={1.8} />
            <h2 className="text-sm font-semibold text-surface-900">Recent Incidents</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Incident</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Duration</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {INCIDENTS.map((inc) => (
                  <tr key={inc.title} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-surface-900">{inc.title}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
                          INC_STYLES[inc.status]
                        )}
                      >
                        {inc.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-500">{inc.duration}</td>
                    <td className="px-5 py-3 text-surface-500">{inc.date}</td>
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
