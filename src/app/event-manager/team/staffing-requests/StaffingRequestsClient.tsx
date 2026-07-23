"use client";

import { useMemo, useState } from "react";
import { UserPlus, AlertTriangle, CheckCircle2, Clock, Timer, ListFilter, Bookmark } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightsRail, RailCard } from "@/app/event-manager/suppliers/_components/SupplierInsightsRail";
import { MiniDonut } from "@/app/event-manager/suppliers/_components/MiniDonut";
import { cn } from "@/lib/utils";

export interface StaffingRequestRow {
  id: string;
  eventName: string;
  roleLabel: string;
  quantityRequired: number;
  quantityFilled: number;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  urgency: string;
  status: string;
  assignedLeadName: string | null;
}

const TABS = [
  { id: "open", label: "Open Roles" },
  { id: "sourcing", label: "Staffing Requests" },
  { id: "filled", label: "Filled Roles" },
  { id: "all", label: "All Roles" },
];

const URGENCY_STYLES: Record<string, string> = {
  urgent: "bg-danger-50 text-danger-600 border-danger-200",
  high: "bg-warning-50 text-warning-700 border-warning-200",
  medium: "bg-info-50 text-info-600 border-info-200",
  normal: "bg-surface-100 text-surface-600 border-surface-200",
};

export function StaffingRequestsClient({ requests }: { requests: StaffingRequestRow[] }) {
  const [tab, setTab] = useState("open");

  const filtered = useMemo(() => {
    if (tab === "all") return requests;
    if (tab === "filled") return requests.filter((r) => r.status === "filled");
    if (tab === "sourcing") return requests.filter((r) => ["sourcing", "shortlisting", "offered", "pending_confirmation"].includes(r.status));
    return requests.filter((r) => !["filled", "cancelled"].includes(r.status));
  }, [requests, tab]);

  const kpis = useMemo(() => {
    const open = requests.filter((r) => !["filled", "cancelled"].includes(r.status)).length;
    const urgent = requests.filter((r) => r.urgency === "urgent").length;
    const filled = requests.filter((r) => r.status === "filled").length;
    const pending = requests.filter((r) => r.status === "pending_confirmation").length;
    return { open, urgent, filled, pending };
  }, [requests]);

  const fillRateSegments = [
    { label: "Filled", value: requests.filter((r) => r.status === "filled").length, color: "bg-success-500" },
    { label: "In Progress", value: requests.filter((r) => ["sourcing", "shortlisting", "offered", "pending_confirmation"].includes(r.status)).length, color: "bg-info-500" },
    { label: "Open", value: requests.filter((r) => r.status === "open" || r.status === "draft").length, color: "bg-warning-500" },
    { label: "Cancelled", value: requests.filter((r) => r.status === "cancelled").length, color: "bg-surface-300" },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Open Roles & Staffing Requests"
        description="Identify, review, and fill event staffing gaps to keep every event fully covered."
        actions={
          <button type="button" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
            <UserPlus className="w-4 h-4" /> New Staffing Request
          </button>
        }
        tabs={
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                  tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-700",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        }
      />

      <div className="p-6 space-y-6 max-w-[1600px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Open Roles" value={String(kpis.open)} icon={UserPlus} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Urgent Requests" value={String(kpis.urgent)} icon={AlertTriangle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Filled" value={String(kpis.filled)} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Pending Confirmations" value={String(kpis.pending)} icon={Timer} iconColor="text-warning-600" iconBg="bg-warning-50" />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 bg-white border border-surface-200 rounded-xl px-3 py-2.5">
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <ListFilter className="w-3.5 h-3.5" /> More filters
              </button>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 ml-auto">
                <Bookmark className="w-3.5 h-3.5" /> Saved views
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <EmptyState
                  icon={UserPlus}
                  title="No staffing requests yet"
                  description="Open a role from an event's Staffing tab, or create a request here to start sourcing candidates."
                  compact
                />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Role Needed</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Urgency</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Lead</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {filtered.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-50">
                        <td className="px-4 py-3.5 text-surface-800">{r.eventName}</td>
                        <td className="px-4 py-3.5">
                          <p className="text-surface-800">{r.roleLabel}</p>
                          <p className="text-xs text-surface-400">{r.quantityFilled}/{r.quantityRequired} filled</p>
                        </td>
                        <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{r.startAt ? new Date(r.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</td>
                        <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{r.location ?? "—"}</td>
                        <td className="px-4 py-3.5 text-surface-700 tabular-nums">{r.quantityRequired}</td>
                        <td className="px-4 py-3.5">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize", URGENCY_STYLES[r.urgency])}>{r.urgency}</span>
                        </td>
                        <td className="px-4 py-3.5 text-surface-500 hidden xl:table-cell">{r.assignedLeadName ?? "Unassigned"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <InsightsRail>
            <RailCard title="Fill Rate">
              <MiniDonut segments={fillRateSegments} centerLabel={requests.length ? `${Math.round((fillRateSegments[0].value / requests.length) * 100)}%` : "0%"} centerSubLabel="Fill Rate" />
            </RailCard>
            <RailCard title="Candidate Pipeline">
              <p className="text-xs text-surface-400">Pipeline counts populate once candidates are added to staffing requests.</p>
            </RailCard>
            <RailCard title="Upcoming High-Risk Events">
              <p className="text-xs text-surface-400">Events with unfilled urgent roles will surface here.</p>
            </RailCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
