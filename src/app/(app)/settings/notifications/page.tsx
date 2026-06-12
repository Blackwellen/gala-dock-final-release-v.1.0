"use client";

import { useState } from "react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

const GROUPS = [
  { key: "events", label: "Events", description: "Status changes, new enquiries, confirmations" },
  { key: "tasks", label: "Tasks", description: "Assignments, due dates, completions" },
  { key: "finance", label: "Finance", description: "Invoice sent, payment received, overdue reminders" },
  { key: "suppliers", label: "Suppliers", description: "Quote responses, contract updates" },
  { key: "team", label: "Team", description: "New members, role changes, mentions" },
  { key: "system", label: "System", description: "Billing alerts, storage warnings, security events" },
];

type Prefs = Record<string, { inApp: boolean; email: boolean }>;

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

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(() =>
    Object.fromEntries(
      GROUPS.map((g) => [g.key, { inApp: true, email: g.key !== "system" }])
    )
  );
  const [saved, setSaved] = useState(false);

  function toggle(key: string, channel: "inApp" | "email") {
    setPrefs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [channel]: !prev[key][channel] },
    }));
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SettingsShell title="Notifications" description="Choose which notifications you receive in-app and by email.">
      <div className="max-w-2xl space-y-4">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-3 border-b border-surface-100 bg-surface-50 gap-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-surface-500">Category</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-surface-500 w-16 text-center">In-app</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-surface-500 w-16 text-center">Email</p>
          </div>
          <div className="divide-y divide-surface-50">
            {GROUPS.map((group) => (
              <div
                key={group.key}
                className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-4 gap-8 hover:bg-surface-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-surface-900">{group.label}</p>
                  <p className="text-xs text-surface-400 mt-0.5">{group.description}</p>
                </div>
                <div className="w-16 flex justify-center">
                  <Toggle
                    checked={prefs[group.key].inApp}
                    onChange={() => toggle(group.key, "inApp")}
                  />
                </div>
                <div className="w-16 flex justify-center">
                  <Toggle
                    checked={prefs[group.key].email}
                    onChange={() => toggle(group.key, "email")}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            Save preferences
          </button>
          {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
        </div>
      </div>
    </SettingsShell>
  );
}
