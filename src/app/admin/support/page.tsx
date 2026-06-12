"use client";

import { Headphones } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-surface-100 text-surface-500 border-surface-200",
  medium: "bg-warning-50 text-warning-600 border-warning-200",
  high: "bg-orange-50 text-orange-600 border-orange-200",
  urgent: "bg-danger-50 text-danger-600 border-danger-200",
};

const TICKETS = [
  { id: "TKT-0042", subject: "Invoice PDF not generating", workspace: "Bloom Events Co.", status: "active" as const, priority: "medium" as Priority, created: "10 Jun 2026" },
  { id: "TKT-0041", subject: "Stripe payment stuck on pending", workspace: "Luxe Celebrations", status: "pending" as const, priority: "high" as Priority, created: "9 Jun 2026" },
  { id: "TKT-0040", subject: "Smart rule not triggering", workspace: "The Grand Affair", status: "active" as const, priority: "medium" as Priority, created: "8 Jun 2026" },
  { id: "TKT-0039", subject: "Cannot upload supplier contract", workspace: "Petal & Vine", status: "pending" as const, priority: "low" as Priority, created: "7 Jun 2026" },
  { id: "TKT-0038", subject: "2FA setup loop — user locked out", workspace: "Skyline Venues", status: "active" as const, priority: "urgent" as Priority, created: "6 Jun 2026" },
  { id: "TKT-0037", subject: "Event export missing supplier data", workspace: "Milan Events", status: "confirmed" as const, priority: "low" as Priority, created: "5 Jun 2026" },
];

export default function SupportPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Support Tickets"
        description="All open and recent support requests from workspaces."
        actions={
          <div className="flex items-center gap-2 text-sm text-surface-500 bg-surface-100 px-3 py-1.5 rounded-lg">
            <Headphones className="w-4 h-4" strokeWidth={1.8} />
            {TICKETS.length} tickets
          </div>
        }
      />

      <div className="p-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Ticket ID</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Priority</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {TICKETS.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-surface-500">{t.id}</td>
                    <td className="px-5 py-3 font-medium text-surface-900">{t.subject}</td>
                    <td className="px-5 py-3 text-surface-600">{t.workspace}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
                          PRIORITY_STYLES[t.priority]
                        )}
                      >
                        {t.priority}
                      </span>
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
