"use client";

import { Mail } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

type EmailStatus = "sent" | "bounced" | "failed";

const STATUS_STYLES: Record<EmailStatus, string> = {
  sent: "bg-success-50 text-success-700 border-success-200",
  bounced: "bg-warning-50 text-warning-700 border-warning-200",
  failed: "bg-danger-50 text-danger-700 border-danger-200",
};

const LOGS = [
  { to: "priya@thegrandaffair.co.uk", subject: "Invoice INV-0047 is ready", template: "invoice_ready", status: "sent" as EmailStatus, sentAt: "10 Jun 2026 09:42" },
  { to: "tom@bloomevents.co.uk", subject: "Your trial is ending in 3 days", template: "trial_ending", status: "sent" as EmailStatus, sentAt: "9 Jun 2026 10:00" },
  { to: "nouser@invalid-domain.xyz", subject: "Workspace invite: Bloom Events Co.", template: "member_invite", status: "bounced" as EmailStatus, sentAt: "8 Jun 2026 14:33" },
  { to: "marcus@skylinevenues.com", subject: "Smart rule triggered: Event confirmed", template: "smart_rule_notification", status: "sent" as EmailStatus, sentAt: "7 Jun 2026 17:22" },
  { to: "elena@luxecelebrations.co.uk", subject: "Payment received — £3,500", template: "payment_received", status: "sent" as EmailStatus, sentAt: "6 Jun 2026 11:15" },
  { to: "sophie@petalandvine.co.uk", subject: "Password reset request", template: "password_reset", status: "failed" as EmailStatus, sentAt: "5 Jun 2026 08:50" },
];

export default function EmailLogsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Email Logs"
        description="All outbound email deliveries and their delivery status."
        actions={
          <div className="flex items-center gap-2 text-sm text-surface-500 bg-surface-100 px-3 py-1.5 rounded-lg">
            <Mail className="w-4 h-4" strokeWidth={1.8} />
            {LOGS.length} recent emails
          </div>
        }
      />

      <div className="p-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">To</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Template</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {LOGS.map((log, i) => (
                  <tr key={i} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3 text-surface-600 text-xs">{log.to}</td>
                    <td className="px-5 py-3 font-medium text-surface-900">{log.subject}</td>
                    <td className="px-5 py-3">
                      <code className="text-xs font-mono text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded">
                        {log.template}
                      </code>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
                          STATUS_STYLES[log.status]
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-500">{log.sentAt}</td>
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
