"use client";

import { useState, useTransition } from "react";
import { Plus, Zap, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SMART_RULE_TRIGGERS, SMART_RULE_ACTIONS, TRIGGER_LABEL, ACTION_LABEL } from "@/lib/automations/smart-rules";
import { createSmartRule, toggleSmartRule, deleteSmartRule } from "./actions";

export interface SmartRuleRow {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  dryRun: boolean;
  lastFired: string | null;
  fireCount: number;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-surface-300"
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

export function SmartRulesClient({ initialRules }: { initialRules: SmartRuleRow[] }) {
  const [rules, setRules] = useState(initialRules);
  const [showNew, setShowNew] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onToggle(id: string, next: boolean) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)));
    startTransition(() => void toggleSmartRule(id, next));
  }

  function onDelete(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    startTransition(() => void deleteSmartRule(id));
  }

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createSmartRule(formData);
      if (!res.ok) {
        setError(res.error ?? "Could not create rule");
        return;
      }
      // Optimistically add; server revalidate will reconcile.
      setRules((prev) => [
        {
          id: `tmp-${Date.now()}`,
          name: String(formData.get("name") ?? ""),
          trigger: String(formData.get("trigger") ?? ""),
          action: String(formData.get("action") ?? ""),
          enabled: false,
          dryRun: true,
          lastFired: null,
          fireCount: 0,
        },
        ...prev,
      ]);
      setShowNew(false);
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-surface-500 max-w-md">
          Smart Rules fire an action when a trigger occurs. New rules install <strong>disabled and in
          dry-run</strong> so you can review them before they go live.
        </p>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" strokeWidth={2} /> New Rule
        </button>
      </div>

      {showNew && (
        <form
          action={onCreate}
          className="bg-white rounded-xl border border-surface-200 shadow-card p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-900">New smart rule</h3>
            <button type="button" onClick={() => setShowNew(false)} className="text-surface-400 hover:text-surface-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            name="name"
            required
            placeholder="Rule name (e.g. Chase overdue invoices)"
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-surface-500">When (trigger)</span>
              <select name="trigger" required className="mt-1 w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                {SMART_RULE_TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-surface-500">Then (action)</span>
              <select name="action" required className="mt-1 w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                {SMART_RULE_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="text-xs text-danger-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create draft rule"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-10 text-center">
            <Zap className="w-7 h-7 text-surface-300 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-surface-500">No smart rules yet. Create one to automate your workflow.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Rule</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">When</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Then</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Enabled</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Fired</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Zap className={cn("w-3.5 h-3.5 shrink-0", rule.enabled ? "text-brand-500" : "text-surface-300")} strokeWidth={2} />
                        <span className="font-medium text-surface-900">{rule.name}</span>
                        {rule.dryRun && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning-50 text-warning-700">dry-run</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-surface-600">{TRIGGER_LABEL[rule.trigger] ?? rule.trigger}</td>
                    <td className="px-5 py-3 text-surface-600">{ACTION_LABEL[rule.action] ?? rule.action}</td>
                    <td className="px-5 py-3">
                      <Toggle checked={rule.enabled} disabled={pending} onChange={() => onToggle(rule.id, !rule.enabled)} />
                    </td>
                    <td className="px-5 py-3 text-surface-500 text-xs tabular-nums">{rule.fireCount}×</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => onDelete(rule.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-all"
                        aria-label="Delete rule"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
