"use client";

import { ArrowLeft, CreditCard, Calendar, Hash, TrendingUp } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";

const SUB = {
  workspace: "The Grand Affair",
  plan: "Pro",
  status: "active" as const,
  mrr: "£149",
  stripeSubscriptionId: "sub_1OcXtAB2eZvKYlo2K3G9mNk5",
  stripeCustomerId: "cus_Oc8XtAB2eZvKYlo2",
  currentPeriodStart: "1 Jun 2026",
  currentPeriodEnd: "1 Jul 2026",
  created: "1 Mar 2025",
  paymentMethod: "Visa ending in 4242",
  usage: {
    events: { used: 24, limit: "Unlimited" },
    seats: { used: 5, limit: 10 },
    storage: { used: "2.1 GB", limit: "10 GB" },
    aiCalls: { used: 847, limit: 5000 },
  },
};

export function SubscriptionDetailPageClient() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-surface-200 px-6 pt-5 pb-5">
        <Link
          href="/admin/subscriptions"
          className="inline-flex items-center gap-1.5 text-xs text-surface-500 hover:text-brand-600 mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Subscriptions
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-900">{SUB.workspace}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                {SUB.plan}
              </span>
              <StatusBadge status={SUB.status} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 text-sm font-medium text-surface-700 bg-white hover:bg-surface-50 border border-surface-200 rounded-lg transition-colors">
              Change Plan
            </button>
            <button className="px-3 py-2 text-sm font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 border border-danger-200 rounded-lg transition-colors">
              Cancel Subscription
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="MRR" value={SUB.mrr} icon={TrendingUp} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Events Used" value={SUB.usage.events.used} icon={Calendar} />
          <MetricCard label="Seats Used" value={`${SUB.usage.seats.used}/${SUB.usage.seats.limit}`} icon={CreditCard} />
          <MetricCard label="Storage Used" value={SUB.usage.storage.used} icon={Hash} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plan info */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Plan Details</p>
            <div className="space-y-3">
              {[
                { label: "Plan", value: SUB.plan },
                { label: "Status", value: <StatusBadge status={SUB.status} /> },
                { label: "MRR", value: SUB.mrr },
                { label: "Billing period", value: `${SUB.currentPeriodStart} – ${SUB.currentPeriodEnd}` },
                { label: "Customer since", value: SUB.created },
                { label: "Payment method", value: SUB.paymentMethod },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-sm text-surface-500 w-36 shrink-0">{label}</span>
                  <span className="text-sm text-surface-900">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stripe info */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Stripe IDs</p>
            <div className="space-y-3">
              {[
                { label: "Subscription ID", value: SUB.stripeSubscriptionId },
                { label: "Customer ID", value: SUB.stripeCustomerId },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-surface-500 mb-1">{label}</p>
                  <code className="text-xs font-mono bg-surface-50 border border-surface-200 rounded px-2 py-1 block text-surface-700 break-all">
                    {value}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Usage */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Usage This Period</p>
          <div className="space-y-4">
            {[
              { label: "Events", used: SUB.usage.events.used, limit: SUB.usage.events.limit, pct: null },
              { label: "Team seats", used: SUB.usage.seats.used, limit: SUB.usage.seats.limit, pct: 50 },
              { label: "Storage", used: SUB.usage.storage.used, limit: SUB.usage.storage.limit, pct: 21 },
              { label: "AI calls", used: SUB.usage.aiCalls.used, limit: SUB.usage.aiCalls.limit, pct: 17 },
            ].map(({ label, used, limit, pct }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-surface-700">{label}</span>
                  <span className="text-xs text-surface-500">{used} / {limit}</span>
                </div>
                {pct !== null && (
                  <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
