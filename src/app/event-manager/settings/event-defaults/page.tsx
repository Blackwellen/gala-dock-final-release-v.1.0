"use client";

import { useState } from "react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

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

export default function EventDefaultsPage() {
  const [defaultStatus, setDefaultStatus] = useState("New Enquiry");
  const [taskTemplate, setTaskTemplate] = useState("Wedding Standard");
  const [runSheetTemplate, setRunSheetTemplate] = useState("Standard Run Sheet");
  const [autoAssign, setAutoAssign] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SettingsShell title="Event Defaults" description="Set default values applied when creating new events.">
      <div className="max-w-lg space-y-6">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Default event status on create</label>
            <select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)} className={INPUT_CLS}>
              <option>New Enquiry</option>
              <option>Briefing</option>
              <option>Quoting</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Default task template</label>
            <select value={taskTemplate} onChange={(e) => setTaskTemplate(e.target.value)} className={INPUT_CLS}>
              <option>Wedding Standard</option>
              <option>Corporate Event</option>
              <option>Private Party</option>
              <option>None</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Default run sheet template</label>
            <select value={runSheetTemplate} onChange={(e) => setRunSheetTemplate(e.target.value)} className={INPUT_CLS}>
              <option>Standard Run Sheet</option>
              <option>Wedding Run Sheet</option>
              <option>Corporate Run Sheet</option>
              <option>None</option>
            </select>
          </div>
        </div>

        <div className="border-t border-surface-100 pt-6">
          <div className="flex items-center justify-between p-4 bg-surface-50 border border-surface-200 rounded-xl">
            <div>
              <p className="text-sm font-medium text-surface-900">Auto-assign to me</p>
              <p className="text-xs text-surface-400 mt-0.5">New events will be assigned to you automatically.</p>
            </div>
            <Toggle checked={autoAssign} onChange={() => setAutoAssign((v) => !v)} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            Save defaults
          </button>
          {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
        </div>
      </div>
    </SettingsShell>
  );
}
