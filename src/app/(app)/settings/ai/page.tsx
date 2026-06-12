"use client";

import { useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

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

export default function AISettingsPage() {
  const [copilot, setCopilot] = useState(true);
  const [briefGen, setBriefGen] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const pct = 12;

  return (
    <SettingsShell title="AI Settings" description="Manage Gala Copilot and AI-powered features in your workspace.">
      <div className="max-w-lg space-y-6">
        {/* Privacy notice */}
        <div className="flex items-start gap-3 bg-brand-50 border border-brand-200 rounded-lg p-4">
          <ShieldCheck className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" strokeWidth={1.8} />
          <p className="text-sm text-brand-700">
            AI uses your workspace data to answer queries and generate content. It never shares data outside your workspace.
          </p>
        </div>

        {/* Toggles */}
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

        {/* Usage meter */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">AI usage this month</h2>
          <div className="bg-white border border-surface-200 rounded-xl shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-surface-600">AI calls used</p>
              <p className="text-sm font-medium text-surface-900">1,204 / 10,000</p>
            </div>
            <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-surface-400">{pct}% of monthly allowance used</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            Save settings
          </button>
          {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
        </div>
      </div>
    </SettingsShell>
  );
}
