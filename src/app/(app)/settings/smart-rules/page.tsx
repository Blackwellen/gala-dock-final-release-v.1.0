"use client";

import { useState } from "react";
import { Plus, Zap } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

const INITIAL_RULES = [
  { id: "r1", name: "Send confirmation email on event confirmed", trigger: "event.status_changed", action: "send_email", enabled: true, lastFired: "10 Jun 2026 09:42" },
  { id: "r2", name: "Assign task when new supplier added", trigger: "supplier.created", action: "create_task", enabled: true, lastFired: "10 Jun 2026 09:15" },
  { id: "r3", name: "Alert owner when invoice overdue > 14 days", trigger: "invoice.overdue", action: "send_notification", enabled: false, lastFired: "—" },
  { id: "r4", name: "Create run sheet on event confirmed", trigger: "event.status_changed", action: "create_document", enabled: true, lastFired: "9 Jun 2026 17:22" },
];

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

export default function SmartRulesPage() {
  const [rules, setRules] = useState(INITIAL_RULES);

  function toggle(id: string) {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  }

  return (
    <SettingsShell
      title="Smart Rules"
      description="Smart Rules allow you to automate actions based on triggers in your workspace."
    >
      <div className="max-w-3xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-surface-500 max-w-md">
            Create rules that automatically fire actions when specific events occur — such as sending an email when an event is confirmed, or creating a task when a supplier is added.
          </p>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors whitespace-nowrap shrink-0">
            <Plus className="w-4 h-4" strokeWidth={2} />
            New Rule
          </button>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Rule Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Trigger</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Enabled</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Last Fired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Zap className={cn("w-3.5 h-3.5 shrink-0", rule.enabled ? "text-brand-500" : "text-surface-300")} strokeWidth={2} />
                        <span className="font-medium text-surface-900">{rule.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <code className="text-xs font-mono text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded">{rule.trigger}</code>
                    </td>
                    <td className="px-5 py-3">
                      <code className="text-xs font-mono text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded">{rule.action}</code>
                    </td>
                    <td className="px-5 py-3">
                      <Toggle checked={rule.enabled} onChange={() => toggle(rule.id)} />
                    </td>
                    <td className="px-5 py-3 text-surface-500 text-xs">{rule.lastFired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
