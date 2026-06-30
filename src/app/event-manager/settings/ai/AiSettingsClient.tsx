"use client";

import { useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { AiUsageSummary } from "./data";

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
        checked ? "bg-brand-600" : "bg-surface-300"
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

export function AiSettingsClient({ usage, copilotEnabled }: { usage: AiUsageSummary | null; copilotEnabled: boolean }) {
  const [copilot, setCopilot] = useState(copilotEnabled);
  const [briefGen, setBriefGen] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const cap = usage ? usage.capCents / 100 : 0;
  const spent = usage ? usage.spentCents / 100 : 0;
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-start gap-3 bg-brand-50 border border-brand-200 rounded-lg p-4">
        <ShieldCheck className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" strokeWidth={1.8} />
        <p className="text-sm text-brand-700">
          AI uses your workspace data to answer queries and generate content. It never shares data outside your workspace, and runs on GDPR-safe infrastructure.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-white border border-surface-200 rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-brand-600 shrink-0" strokeWidth={1.8} />
            <div>
              <p className="text-sm font-medium text-surface-900">Gala Copilot</p>
              <p className="text-xs text-surface-400 mt-0.5">AI assistant for event planning, supplier queries, and insights.</p>
            </div>
          </div>
          <Toggle checked={copilot} onChange={() => setCopilot((v) => !v)} />
        </div>

        <div className="flex items-center justify-between p-4 bg-white border border-surface-200 rounded-xl shadow-card">
          <div>
            <p className="text-sm font-medium text-surface-900">AI brief generation</p>
            <p className="text-xs text-surface-400 mt-0.5">Automatically generate event briefs from your notes and details.</p>
          </div>
          <Toggle checked={briefGen} onChange={() => setBriefGen((v) => !v)} />
        </div>
      </div>

      {/* Live usage */}
      <div className="border-t border-surface-100 pt-6">
        <h2 className="text-sm font-semibold text-surface-900 mb-3">
          AI usage{usage ? ` — ${usage.periodLabel}` : " this month"}
        </h2>
        <div className="bg-white border border-surface-200 rounded-xl shadow-card p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-surface-600">Spend vs monthly cap</p>
              <p className="text-sm font-medium text-surface-900">
                {formatCurrency(spent)} {cap > 0 ? `/ ${formatCurrency(cap)}` : ""}
              </p>
            </div>
            <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", pct >= 90 ? "bg-danger-500" : pct >= 70 ? "bg-warning-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-surface-400">{cap > 0 ? `${pct}% of monthly cap used` : "No cap configured"}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            <Stat label="AI calls" value={formatNumber(usage?.calls ?? 0)} />
            <Stat label="Input tokens" value={formatNumber(usage?.inputTokens ?? 0)} />
            <Stat label="Output tokens" value={formatNumber(usage?.outputTokens ?? 0)} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors">
          Save settings
        </button>
        {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-base font-semibold text-surface-900">{value}</p>
      <p className="text-[11px] text-surface-400">{label}</p>
    </div>
  );
}
