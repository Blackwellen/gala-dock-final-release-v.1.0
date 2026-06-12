"use client";

import { useState } from "react";
import { ArrowLeft, Link2, PoundSterling, MousePointerClick, Users } from "lucide-react";
import Link from "next/link";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Conversions", "Payouts"];

const AFFILIATE = {
  name: "James Okafor",
  email: "james@gala-dock.com",
  status: "active" as const,
  totalEarnings: "£1,240.00",
  conversions: 8,
  clicks: 342,
  joinedDate: "1 Feb 2025",
  referralCode: "JAMES-GD2025",
  conversionsData: [
    { workspace: "Bloom Events Co.", plan: "Starter", date: "12 Jan 2025", commission: "£29.40" },
    { workspace: "Petal & Vine", plan: "Starter", date: "18 Apr 2025", commission: "£29.40" },
    { workspace: "Milan Events", plan: "Pro", date: "14 Dec 2024", commission: "£89.40" },
    { workspace: "Goldencrest Events", plan: "Starter", date: "3 Feb 2026", commission: "£29.40" },
  ],
  payouts: [
    { period: "Q1 2025", amount: "£310.00", status: "paid" as const, paidDate: "1 Apr 2025" },
    { period: "Q2 2025", amount: "£480.00", status: "paid" as const, paidDate: "1 Jul 2025" },
    { period: "Q3 2025", amount: "£270.00", status: "paid" as const, paidDate: "1 Oct 2025" },
    { period: "Q4 2025–Q1 2026", amount: "£180.00", status: "pending" as const, paidDate: "—" },
  ],
};

export default function AffiliateDetailPage() {
  const [tab, setTab] = useState("Overview");

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-surface-200 px-6 pt-5 pb-0">
        <Link
          href="/admin/affiliates"
          className="inline-flex items-center gap-1.5 text-xs text-surface-500 hover:text-brand-600 mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Affiliates
        </Link>
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
            <span className="text-brand-700 text-base font-bold">
              {AFFILIATE.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-surface-900">{AFFILIATE.name}</h1>
            <p className="text-sm text-surface-500 mt-0.5">{AFFILIATE.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <StatusBadge status={AFFILIATE.status} />
              <code className="text-xs font-mono bg-surface-100 text-surface-600 px-2 py-0.5 rounded border border-surface-200">
                {AFFILIATE.referralCode}
              </code>
            </div>
          </div>
        </div>

        <div className="flex gap-1 -mb-px">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-all",
                tab === t
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-surface-500 hover:text-surface-900"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === "Overview" && (
          <div className="space-y-6">
            <KPIGrid className="grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Earnings" value={AFFILIATE.totalEarnings} icon={PoundSterling} iconBg="bg-success-50" iconColor="text-success-600" />
              <MetricCard label="Conversions" value={AFFILIATE.conversions} icon={Users} iconBg="bg-brand-50" iconColor="text-brand-600" />
              <MetricCard label="Clicks" value={AFFILIATE.clicks} icon={MousePointerClick} iconBg="bg-violet-50" iconColor="text-violet-600" />
              <MetricCard label="Member Since" value={AFFILIATE.joinedDate} icon={Link2} iconBg="bg-surface-100" iconColor="text-surface-500" />
            </KPIGrid>
          </div>
        )}

        {tab === "Conversions" && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Plan</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {AFFILIATE.conversionsData.map((c) => (
                      <tr key={c.workspace} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-surface-900">{c.workspace}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                            {c.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-surface-500">{c.date}</td>
                        <td className="px-5 py-3 font-medium text-success-600">{c.commission}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "Payouts" && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Period</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Paid Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {AFFILIATE.payouts.map((p) => (
                      <tr key={p.period} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-surface-900">{p.period}</td>
                        <td className="px-5 py-3 font-medium text-surface-900">{p.amount}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-5 py-3 text-surface-500">{p.paidDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
