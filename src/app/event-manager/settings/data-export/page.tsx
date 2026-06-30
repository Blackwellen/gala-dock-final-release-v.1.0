"use client";

import { useState } from "react";
import { Download, CheckCircle2, CalendarDays, Users, PoundSterling, FileText, HardDrive } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";

const INCLUDED = [
  { icon: CalendarDays, label: "Events", description: "All events, run sheets, and briefing documents" },
  { icon: Users, label: "Suppliers", description: "Supplier profiles, contacts, and documents" },
  { icon: CheckCircle2, label: "Tasks", description: "All task lists and completion history" },
  { icon: PoundSterling, label: "Finance", description: "Invoices, quotes, and payment records" },
  { icon: HardDrive, label: "Files", description: "Uploaded attachments and media" },
];

export default function DataExportPage() {
  const [requested, setRequested] = useState(false);

  return (
    <SettingsShell title="Data Export" description="Export all your workspace data as a zip file.">
      <div className="max-w-lg space-y-6">
        {/* What's included */}
        <div>
          <h2 className="text-sm font-semibold text-surface-900 mb-3">What's included</h2>
          <div className="space-y-2">
            {INCLUDED.map(({ icon: Icon, label, description }) => (
              <div key={label} className="flex items-center gap-3 p-3 bg-surface-50 border border-surface-200 rounded-lg">
                <Icon className="w-4 h-4 text-brand-600 shrink-0" strokeWidth={1.8} />
                <div>
                  <p className="text-sm font-medium text-surface-900">{label}</p>
                  <p className="text-xs text-surface-400">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Export button */}
        <div className="border-t border-surface-100 pt-6">
          {!requested ? (
            <div>
              <p className="text-sm text-surface-600 mb-4">
                Your export will be prepared as a <code className="text-xs font-mono bg-surface-100 px-1 rounded">.zip</code> file.
                Large workspaces may take a few minutes. We'll email you a download link when it's ready.
              </p>
              <button
                onClick={() => setRequested(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" strokeWidth={1.8} />
                Request export
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-3 bg-success-50 border border-success-200 rounded-xl p-4">
              <CheckCircle2 className="w-5 h-5 text-success-600 shrink-0 mt-0.5" strokeWidth={2} />
              <div>
                <p className="text-sm font-semibold text-success-700">Export requested!</p>
                <p className="text-sm text-success-600 mt-0.5">
                  We'll email you when your export is ready — usually under 5 minutes.
                </p>
                <button
                  onClick={() => setRequested(false)}
                  className="mt-3 text-xs text-success-600 hover:underline"
                >
                  Request another export
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 bg-surface-50 border border-surface-200 rounded-lg p-4">
          <FileText className="w-4 h-4 text-surface-400 shrink-0 mt-0.5" strokeWidth={1.8} />
          <p className="text-xs text-surface-500">
            Exports are available to workspace Owners and Admins only.
            Data is exported in JSON and CSV formats. Download links expire after 24 hours.
          </p>
        </div>
      </div>
    </SettingsShell>
  );
}
