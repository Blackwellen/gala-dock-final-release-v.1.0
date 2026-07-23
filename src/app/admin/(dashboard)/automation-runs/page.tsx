"use client";

import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

type RunStatus = "success" | "failed" | "skipped";

const STATUS_STYLES: Record<RunStatus, string> = {
  success: "bg-success-50 text-success-700 border-success-200",
  failed: "bg-danger-50 text-danger-700 border-danger-200",
  skipped: "bg-surface-100 text-surface-500 border-surface-200",
};

const RUNS = [
  { rule: "Send confirmation email on event status → confirmed", workspace: "The Grand Affair", trigger: "event.status_changed", status: "success" as RunStatus, duration: "1.2s", ranAt: "10 Jun 2026 09:42" },
  { rule: "Assign task when new supplier added", workspace: "Skyline Venues", trigger: "supplier.created", status: "success" as RunStatus, duration: "0.8s", ranAt: "10 Jun 2026 09:15" },
  { rule: "Alert owner when invoice overdue > 14 days", workspace: "Luxe Celebrations", trigger: "invoice.overdue", status: "failed" as RunStatus, duration: "—", ranAt: "9 Jun 2026 23:00" },
  { rule: "Create run sheet on event confirmed", workspace: "Milan Events", trigger: "event.status_changed", status: "success" as RunStatus, duration: "2.1s", ranAt: "9 Jun 2026 17:22" },
  { rule: "Send supplier payment reminder", workspace: "Bloom Events Co.", trigger: "payment.due_soon", status: "skipped" as RunStatus, duration: "—", ranAt: "9 Jun 2026 10:00" },
  { rule: "Notify team when task overdue", workspace: "The Grand Affair", trigger: "task.overdue", status: "success" as RunStatus, duration: "0.5s", ranAt: "8 Jun 2026 16:30" },
];

export default function AutomationRunsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Smart Rule Runs"
        description="Automation execution log across all workspaces."
        actions={
          <div className="flex items-center gap-2 text-sm text-surface-500 bg-surface-100 px-3 py-1.5 rounded-lg">
            <Workflow className="w-4 h-4" strokeWidth={1.8} />
            {RUNS.length} recent runs
          </div>
        }
      />

      <div className="p-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Rule Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Trigger</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Duration</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Ran At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {RUNS.map((run, i) => (
                  <tr key={i} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 text-surface-900 max-w-xs truncate" title={run.rule}>{run.rule}</td>
                    <td className="px-5 py-3 text-surface-600">{run.workspace}</td>
                    <td className="px-5 py-3">
                      <code className="text-xs font-mono text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded">
                        {run.trigger}
                      </code>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
                          STATUS_STYLES[run.status]
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {run.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-500 tabular-nums">{run.duration}</td>
                    <td className="px-5 py-3 text-surface-500">{run.ranAt}</td>
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
