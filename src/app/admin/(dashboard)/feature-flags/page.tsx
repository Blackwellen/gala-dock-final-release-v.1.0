"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

const INITIAL_FLAGS = [
  { key: "copilot_enabled", name: "Gala Copilot", description: "AI-powered event planning assistant available to all workspaces.", enabled: true, overrides: 3 },
  { key: "smart_rules_v2", name: "Smart Rules V2", description: "Next-generation automation rule engine with advanced conditions.", enabled: false, overrides: 1 },
  { key: "portal_v2", name: "Client Portal V2", description: "New client-facing portal experience with improved branding controls.", enabled: false, overrides: 5 },
  { key: "bulk_export", name: "Bulk Export", description: "Allow workspaces to export all data as a zip file on demand.", enabled: true, overrides: 0 },
  { key: "stripe_connect", name: "Stripe Connect", description: "Enable direct Stripe Connect payments for marketplace suppliers.", enabled: false, overrides: 2 },
  { key: "mfa_enforced", name: "MFA Enforced", description: "Require two-factor authentication for all admin and owner accounts.", enabled: true, overrides: 0 },
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
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState(INITIAL_FLAGS);

  function toggle(key: string) {
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, enabled: !f.enabled } : f));
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Feature Flags"
        description="Control which features are available across the platform."
        actions={
          <div className="flex items-center gap-2 text-sm text-surface-500 bg-surface-100 px-3 py-1.5 rounded-lg">
            <Flag className="w-4 h-4" strokeWidth={1.8} />
            {flags.filter((f) => f.enabled).length} enabled
          </div>
        }
      />

      <div className="p-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Flag</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Description</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Enabled</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace Overrides</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {flags.map((flag) => (
                  <tr key={flag.key} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-surface-900">{flag.name}</p>
                        <code className="text-[11px] font-mono text-surface-400">{flag.key}</code>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-surface-500 max-w-xs">{flag.description}</td>
                    <td className="px-5 py-4">
                      <Toggle checked={flag.enabled} onChange={() => toggle(flag.key)} />
                    </td>
                    <td className="px-5 py-4">
                      {flag.overrides > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-50 text-warning-700 border border-warning-200">
                          {flag.overrides} workspace{flag.overrides > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-surface-400 text-xs">None</span>
                      )}
                    </td>
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
