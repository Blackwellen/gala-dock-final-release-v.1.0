"use client";

import { CreditCard, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

const SUBSCRIPTIONS = [
  { id: "sub1", workspace: "The Grand Affair", plan: "Pro", status: "active" as const, mrr: "£149", nextRenewal: "1 Jul 2026", stripeId: "sub_1OcXtAB2eZvKYlo2K3G9mNk5" },
  { id: "sub2", workspace: "Skyline Venues", plan: "Enterprise", status: "active" as const, mrr: "£499", nextRenewal: "1 Jul 2026", stripeId: "sub_1OcYuBC3fAwLZmp3L4H0nOl6" },
  { id: "sub3", workspace: "Bloom Events Co.", plan: "Starter", status: "pending" as const, mrr: "£49", nextRenewal: "14 Jun 2026", stripeId: "sub_1OcZvCD4gBxMAnq4M5I1oPlm" },
  { id: "sub4", workspace: "Luxe Celebrations", plan: "Pro", status: "active" as const, mrr: "£149", nextRenewal: "22 Jun 2026", stripeId: "sub_1OdAwDE5hCyNBor5N6J2pQmn" },
  { id: "sub5", workspace: "Milan Events", plan: "Pro", status: "overdue" as const, mrr: "£149", nextRenewal: "14 May 2026", stripeId: "sub_1OdBxEF6iDzOCps6O7K3qRno" },
  { id: "sub6", workspace: "Petal & Vine", plan: "Starter", status: "inactive" as const, mrr: "£0", nextRenewal: "—", stripeId: "sub_1OdCyFG7jEAP Dqt7P8L4rSop" },
];

export default function SubscriptionsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Subscriptions"
        description="All workspace subscriptions and billing status."
      />

      <div className="p-6 space-y-6">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total MRR" value="£27,450" icon={TrendingUp} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Active" value="183" icon={CreditCard} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Trialing" value="24" icon={Clock} iconBg="bg-warning-50" iconColor="text-warning-600" />
          <MetricCard label="Past Due" value="7" icon={AlertCircle} iconBg="bg-danger-50" iconColor="text-danger-600" />
        </KPIGrid>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">MRR</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Next Renewal</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Stripe ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {SUBSCRIPTIONS.map((sub) => (
                  <tr key={sub.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-5 py-3">
                      <a
                        href={`/admin/subscriptions/${sub.id}`}
                        className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors"
                      >
                        {sub.workspace}
                      </a>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                        {sub.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-5 py-3 font-medium text-surface-900 tabular-nums">{sub.mrr}</td>
                    <td className="px-5 py-3 text-surface-500">{sub.nextRenewal}</td>
                    <td className="px-5 py-3 font-mono text-xs text-surface-400 truncate max-w-[200px]">{sub.stripeId}</td>
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
