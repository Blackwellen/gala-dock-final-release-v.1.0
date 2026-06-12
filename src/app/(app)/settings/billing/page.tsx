"use client";

import { CreditCard, Download, ExternalLink } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { StatusBadge } from "@/components/ui/StatusBadge";

const INVOICES = [
  { id: "INV-2026-006", period: "1 Jun – 30 Jun 2026", amount: "£149.00", status: "unpaid" as const, date: "1 Jun 2026" },
  { id: "INV-2026-005", period: "1 May – 31 May 2026", amount: "£149.00", status: "paid" as const, date: "1 May 2026" },
  { id: "INV-2026-004", period: "1 Apr – 30 Apr 2026", amount: "£149.00", status: "paid" as const, date: "1 Apr 2026" },
];

export default function BillingSettingsPage() {
  return (
    <SettingsShell title="Billing" description="Manage your subscription, payment method, and invoices.">
      <div className="max-w-2xl space-y-6">
        {/* Current plan */}
        <div className="bg-white border border-surface-200 rounded-xl shadow-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Current plan</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-lg font-bold text-surface-900">Pro</p>
                <StatusBadge status="active" />
              </div>
              <p className="text-sm text-surface-500">£149 / month · renews on 1 Jul 2026</p>
              <ul className="mt-3 space-y-1 text-sm text-surface-600">
                <li>• Unlimited events</li>
                <li>• 10 team seats</li>
                <li>• 10 GB storage</li>
                <li>• Gala Copilot included</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button className="px-3 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors whitespace-nowrap">
                Upgrade plan
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-700 bg-surface-50 hover:bg-surface-100 border border-surface-200 rounded-lg transition-colors whitespace-nowrap">
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />
                Manage billing
              </button>
            </div>
          </div>
        </div>

        {/* Payment method */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Payment method</h2>
          <div className="bg-white border border-surface-200 rounded-xl shadow-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-surface-100 border border-surface-200 rounded flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-medium text-surface-900">Visa ending in 4242</p>
                <p className="text-xs text-surface-400">Expires 12/28</p>
              </div>
            </div>
            <button className="px-3 py-1.5 text-xs font-medium text-surface-700 bg-surface-50 hover:bg-surface-100 border border-surface-200 rounded-lg transition-colors">
              Update card
            </button>
          </div>
        </div>

        {/* Invoices */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Invoice history</h2>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Invoice</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Period</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {INVOICES.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-surface-600">{inv.id}</td>
                      <td className="px-4 py-3 text-surface-600">{inv.period}</td>
                      <td className="px-4 py-3 font-medium text-surface-900">{inv.amount}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium ml-auto">
                          <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
