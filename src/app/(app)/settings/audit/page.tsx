"use client";

import { SettingsShell } from "@/components/settings/SettingsShell";

const LOGS = [
  { timestamp: "10 Jun 2026 09:42", user: "Priya Chandran", action: "event.created", resource: "Midsummer Gala 2026", ip: "185.123.45.67" },
  { timestamp: "10 Jun 2026 09:15", user: "Priya Chandran", action: "session.login", resource: "—", ip: "185.123.45.67" },
  { timestamp: "9 Jun 2026 14:11", user: "Tom Aldridge", action: "invoice.sent", resource: "INV-0047", ip: "92.184.33.12" },
  { timestamp: "8 Jun 2026 11:30", user: "Priya Chandran", action: "supplier.invited", resource: "Floral Dreams Ltd", ip: "185.123.45.67" },
  { timestamp: "7 Jun 2026 16:55", user: "Elena Russo", action: "event.status_changed", resource: "Henderson Wedding → confirmed", ip: "217.34.122.9" },
  { timestamp: "6 Jun 2026 10:22", user: "Tom Aldridge", action: "file.uploaded", resource: "venue-contract.pdf", ip: "92.184.33.12" },
  { timestamp: "5 Jun 2026 08:07", user: "Priya Chandran", action: "member.invited", resource: "sophie@petalandvine.co.uk", ip: "185.123.45.67" },
  { timestamp: "4 Jun 2026 17:33", user: "Tom Aldridge", action: "quote.approved", resource: "QT-0018", ip: "92.184.33.12" },
];

export default function AuditSettingsPage() {
  return (
    <SettingsShell title="Audit Log" description="A record of all significant actions taken in your workspace.">
      <div className="max-w-4xl">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Timestamp</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Resource</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {LOGS.map((log, i) => (
                  <tr key={i} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-surface-500 whitespace-nowrap">{log.timestamp}</td>
                    <td className="px-5 py-3 text-surface-700 font-medium">{log.user}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs bg-surface-100 text-surface-700 px-1.5 py-0.5 rounded">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-600">{log.resource}</td>
                    <td className="px-5 py-3 font-mono text-xs text-surface-400">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-surface-400">
          Showing the 8 most recent events. Full export available on the{" "}
          <a href="/settings/data-export" className="text-brand-600 hover:underline">Data Export</a> page.
        </p>
      </div>
    </SettingsShell>
  );
}
