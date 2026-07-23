"use client";

import { Download } from "lucide-react";
import type { UsageDayPoint } from "./UsageChartClient";

export interface UsageExportSummary {
  planCode: string;
  subscriptionStatus: string;
  runsUsed: number;
  runsCap: number;
  aiCreditsUsed: number;
  aiCreditsCap: number;
  webhookEventsUsed: number;
  webhookEventsCap: number;
  approvalTasksUsed: number;
  approvalTasksCap: number;
  storageUsedGb: number;
  storageGbCap: number;
  connectedIntegrations: number;
  activeIntegrationsCap: number;
  activeSeatsUsed: number;
  activeSeatsCap: number;
  generatedAt: string;
}

function toCsv(summary: UsageExportSummary, daily: UsageDayPoint[]): string {
  const lines: string[] = [];
  lines.push("Gala Dock — Automations Usage & Limits Report");
  lines.push(`Generated,${summary.generatedAt}`);
  lines.push(`Plan,${summary.planCode}`);
  lines.push(`Subscription status,${summary.subscriptionStatus}`);
  lines.push("");
  lines.push("Metric,Used,Cap");
  lines.push(`Automation runs (this month),${summary.runsUsed},${summary.runsCap}`);
  lines.push(`AI credits (this month),${summary.aiCreditsUsed},${summary.aiCreditsCap}`);
  lines.push(`Webhook events (this month),${summary.webhookEventsUsed},${summary.webhookEventsCap}`);
  lines.push(`Approval tasks (this month),${summary.approvalTasksUsed},${summary.approvalTasksCap}`);
  lines.push(`Storage (GB),${summary.storageUsedGb},${summary.storageGbCap}`);
  lines.push(`Connected integrations,${summary.connectedIntegrations},${summary.activeIntegrationsCap}`);
  lines.push(`Active seats,${summary.activeSeatsUsed},${summary.activeSeatsCap}`);
  lines.push("");
  lines.push("Date,Runs,AI Credits,Webhook Events");
  for (const d of daily) {
    lines.push(`${d.date},${d.runs},${d.aiCredits},${d.webhookEvents}`);
  }
  return lines.join("\n");
}

export function ExportUsageButton({ summary, daily }: { summary: UsageExportSummary; daily: UsageDayPoint[] }) {
  function handleExport() {
    const csv = toCsv(summary, daily);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `automations-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
    >
      <Download className="w-4 h-4" />
      Export report
    </button>
  );
}
