"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

const USAGE_ITEMS = [
  { label: "Events", used: 12, limit: null, limitLabel: "Unlimited", pct: null, unit: "" },
  { label: "Team seats", used: 3, limit: 10, limitLabel: "10", pct: 30, unit: "" },
  { label: "Storage", used: 240, limit: 5120, limitLabel: "5 GB", pct: 4.7, unit: "MB", usedLabel: "240 MB" },
  { label: "AI calls", used: 1204, limit: 10000, limitLabel: "10,000", pct: 12, unit: "", usedLabel: "1,204" },
];

function barColor(pct: number) {
  if (pct > 80) return "bg-danger-500";
  if (pct > 50) return "bg-warning-500";
  return "bg-brand-500";
}

export default function UsagePage() {
  return (
    <SettingsShell title="Usage" description="Your current usage for this billing period.">
      <div className="max-w-lg space-y-6">
        <div className="bg-surface-50 border border-surface-200 rounded-lg px-4 py-2.5">
          <p className="text-sm text-surface-600">
            Current billing period: <strong className="text-surface-900">1 Jun – 30 Jun 2026</strong>
          </p>
        </div>

        <div className="space-y-5">
          {USAGE_ITEMS.map((item) => (
            <div key={item.label} className="bg-white border border-surface-200 rounded-xl shadow-card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-surface-900">{item.label}</p>
                <p className="text-sm text-surface-500">
                  <span className="font-medium text-surface-900">
                    {item.usedLabel ?? item.used}
                  </span>
                  {" / "}
                  {item.limitLabel}
                </p>
              </div>
              {item.pct !== null ? (
                <>
                  <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", barColor(item.pct))}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-surface-400">{item.pct.toFixed(0)}% used</p>
                </>
              ) : (
                <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-brand-200 w-0" />
                </div>
              )}
              {item.pct !== null && item.pct > 80 && (
                <p className="mt-2 text-xs text-danger-600 font-medium">
                  Approaching limit — consider upgrading your plan.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-surface-100 pt-6">
          <p className="text-sm text-surface-500">
            Need more capacity?{" "}
            <a href="/settings/billing" className="text-brand-600 hover:underline font-medium">
              Upgrade your plan
            </a>
          </p>
        </div>
      </div>
    </SettingsShell>
  );
}
