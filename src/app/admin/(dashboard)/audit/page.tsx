"use client";

import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const LOGS = [
  { timestamp: "10 Jun 2026 09:42:11", actor: "priya@thegrandaffair.co.uk", action: "workspace.created", resource: "The Grand Affair", workspace: "The Grand Affair", ip: "185.123.45.67" },
  { timestamp: "10 Jun 2026 09:15:03", actor: "james@gala-dock.com", action: "feature_flag.toggled", resource: "copilot_enabled", workspace: "— (admin)", ip: "10.0.0.1" },
  { timestamp: "9 Jun 2026 17:44:28", actor: "tom@bloomevents.co.uk", action: "event.deleted", resource: "Spring Ball 2026", workspace: "Bloom Events Co.", ip: "92.184.33.12" },
  { timestamp: "9 Jun 2026 14:11:05", actor: "priya@thegrandaffair.co.uk", action: "event.created", resource: "Midsummer Gala 2026", workspace: "The Grand Affair", ip: "185.123.45.67" },
  { timestamp: "8 Jun 2026 11:30:44", actor: "priya@thegrandaffair.co.uk", action: "invoice.sent", resource: "INV-0047", workspace: "The Grand Affair", ip: "185.123.45.67" },
  { timestamp: "7 Jun 2026 16:55:17", actor: "marcus@skylinevenues.com", action: "user.invited", resource: "sophie@petalandvine.co.uk", workspace: "Skyline Venues", ip: "78.45.201.88" },
  { timestamp: "6 Jun 2026 10:22:39", actor: "anaya@gala-dock.com", action: "user.role_changed", resource: "lucas@milanevents.es", workspace: "Milan Events", ip: "10.0.0.2" },
  { timestamp: "5 Jun 2026 08:07:54", actor: "elena@luxecelebrations.co.uk", action: "supplier.archived", resource: "Elite Catering Ltd", workspace: "Luxe Celebrations", ip: "217.34.122.9" },
];

export default function AuditPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Audit Log"
        description="Platform-wide audit trail of all significant actions."
        actions={
          <div className="flex items-center gap-2 text-sm text-surface-500 bg-surface-100 px-3 py-1.5 rounded-lg">
            <ClipboardList className="w-4 h-4" strokeWidth={1.8} />
            {LOGS.length} entries
          </div>
        }
      />

      <div className="p-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Timestamp</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Actor</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Resource</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {LOGS.map((log, i) => (
                  <tr key={i} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-surface-500 whitespace-nowrap">{log.timestamp}</td>
                    <td className="px-5 py-3 text-surface-600 text-xs">{log.actor}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs bg-surface-100 text-surface-700 px-1.5 py-0.5 rounded">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-600">{log.resource}</td>
                    <td className="px-5 py-3 text-surface-500">{log.workspace}</td>
                    <td className="px-5 py-3 font-mono text-xs text-surface-400">{log.ip}</td>
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
