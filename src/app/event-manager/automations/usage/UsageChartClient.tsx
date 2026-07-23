"use client";

import { useMemo, useState } from "react";
import { AreaLineChart, type SeriesDatum } from "@/components/ui/FinanceCharts";
import { cn } from "@/lib/utils";

export interface UsageDayPoint {
  date: string;
  runs: number;
  aiCredits: number;
  webhookEvents: number;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function toWeekly(points: UsageDayPoint[]): UsageDayPoint[] {
  const weeks: UsageDayPoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    if (chunk.length === 0) continue;
    weeks.push({
      date: chunk[0].date,
      runs: chunk.reduce((s, p) => s + p.runs, 0),
      aiCredits: chunk.reduce((s, p) => s + p.aiCredits, 0),
      webhookEvents: chunk.reduce((s, p) => s + p.webhookEvents, 0),
    });
  }
  return weeks;
}

export function UsageChartClient({ points }: { points: UsageDayPoint[] }) {
  const [granularity, setGranularity] = useState<"daily" | "weekly">("daily");

  const sliced = useMemo(() => (granularity === "daily" ? points : toWeekly(points)), [points, granularity]);

  const data: SeriesDatum[] = sliced.map((p) => ({
    label: formatDayLabel(p.date),
    runs: p.runs,
    aiCredits: p.aiCredits,
    webhookEvents: p.webhookEvents,
  }));

  if (points.length === 0) {
    return (
      <p className="text-sm text-surface-500 py-10 text-center">
        No usage recorded yet in the last 30 days. Once automations run, credits are spent or webhook events fire, activity will appear here.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-3">
        {(["daily", "weekly"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGranularity(g)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md border transition-colors capitalize",
              granularity === g
                ? "bg-brand-50 text-brand-700 border-brand-200"
                : "bg-white text-surface-500 border-surface-200 hover:bg-surface-50"
            )}
          >
            {g}
          </button>
        ))}
      </div>
      <AreaLineChart
        data={data}
        height={220}
        formatValue={(v) => v.toLocaleString("en-GB")}
        series={[
          { key: "runs", color: "#7c3aed", label: "Runs", area: true },
          { key: "aiCredits", color: "#0ea5e9", label: "AI credits" },
          { key: "webhookEvents", color: "#22c55e", label: "Webhook events" },
        ]}
      />
      <div className="flex items-center gap-4 mt-3 justify-center">
        <Legend color="#7c3aed" label="Runs" />
        <Legend color="#0ea5e9" label="AI credits" />
        <Legend color="#22c55e" label="Webhook events" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-surface-500">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
