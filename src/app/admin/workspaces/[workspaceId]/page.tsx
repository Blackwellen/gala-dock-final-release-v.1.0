"use client";

import { useState } from "react";
import { ArrowLeft, CalendarDays, Users, HardDrive, PoundSterling } from "lucide-react";
import Link from "next/link";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Members", "Events", "Finance", "Billing", "Audit"];

const WS = {
  name: "The Grand Affair",
  plan: "Pro",
  status: "active" as const,
  slug: "the-grand-affair",
  created: "1 Mar 2025",
  members: [
    { name: "Priya Chandran", email: "priya@thegrandaffair.co.uk", role: "Owner", joined: "1 Mar 2025" },
    { name: "Tom Aldridge", email: "tom@bloomevents.co.uk", role: "Member", joined: "14 Apr 2025" },
    { name: "Elena Russo", email: "elena@luxecelebrations.co.uk", role: "Member", joined: "22 May 2025" },
    { name: "Marcus Webb", email: "marcus@skylinevenues.com", role: "Admin", joined: "5 Jun 2025" },
    { name: "Sophie Hart", email: "sophie@petalandvine.co.uk", role: "Viewer", joined: "1 Jan 2026" },
  ],
  events: [
    { name: "Midsummer Gala 2026", status: "confirmed" as const, date: "21 Jun 2026", budget: "£24,500" },
    { name: "Henderson Wedding", status: "in-delivery" as const, date: "28 Jun 2026", budget: "£18,000" },
    { name: "Corporate Dinner — TechCorp", status: "quoting" as const, date: "12 Jul 2026", budget: "£8,200" },
    { name: "Charity Ball 2026", status: "new-enquiry" as const, date: "5 Sep 2026", budget: "£32,000" },
  ],
  billing: {
    plan: "Pro",
    status: "active" as const,
    mrr: "£149",
    stripeId: "sub_1OcXtAB2eZvKYlo2K3G9mNk5",
    nextRenewal: "1 Jul 2026",
    paymentMethod: "Visa ending in 4242",
  },
  audit: [
    { action: "workspace.created", actor: "Priya Chandran", time: "1 Mar 2025", ip: "185.123.45.67" },
    { action: "member.invited", actor: "Priya Chandran", time: "14 Apr 2025", ip: "185.123.45.67" },
    { action: "event.created", actor: "Priya Chandran", time: "10 May 2025", ip: "185.123.45.67" },
    { action: "subscription.upgraded", actor: "Priya Chandran", time: "1 Jun 2025", ip: "185.123.45.67" },
  ],
};

export default function WorkspaceDetailPage() {
  const [tab, setTab] = useState("Overview");

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-surface-200 px-6 pt-5 pb-0">
        <Link
          href="/admin/workspaces"
          className="inline-flex items-center gap-1.5 text-xs text-surface-500 hover:text-brand-600 mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Workspaces
        </Link>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-surface-900">{WS.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                {WS.plan}
              </span>
              <StatusBadge status={WS.status} />
            </div>
          </div>
        </div>

        <div className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
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
          <KPIGrid className="grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Events" value={WS.events.length} icon={CalendarDays} />
            <MetricCard label="Members" value={WS.members.length} icon={Users} />
            <MetricCard label="Storage Used" value="2.1 GB" icon={HardDrive} iconBg="bg-warning-50" iconColor="text-warning-600" />
            <MetricCard label="MRR" value={WS.billing.mrr} icon={PoundSterling} iconBg="bg-success-50" iconColor="text-success-600" />
          </KPIGrid>
        )}

        {tab === "Members" && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Name</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Email</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Role</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {WS.members.map((m) => (
                      <tr key={m.email} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                              <span className="text-brand-700 text-[10px] font-semibold">
                                {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                              </span>
                            </div>
                            <span className="font-medium text-surface-900">{m.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-surface-500">{m.email}</td>
                        <td className="px-5 py-3 text-surface-600">{m.role}</td>
                        <td className="px-5 py-3 text-surface-500">{m.joined}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "Events" && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Event</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Budget</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {WS.events.map((e) => (
                      <tr key={e.name} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-surface-900">{e.name}</td>
                        <td className="px-5 py-3"><StatusBadge status={e.status} /></td>
                        <td className="px-5 py-3 text-surface-500">{e.date}</td>
                        <td className="px-5 py-3 text-surface-600">{e.budget}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "Finance" && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Finance Summary</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Total invoiced", value: "£142,800" },
                  { label: "Total paid", value: "£128,500" },
                  { label: "Outstanding", value: "£14,300" },
                  { label: "Overdue", value: "£3,200" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-surface-50 rounded-lg p-4">
                    <p className="text-xs text-surface-500">{label}</p>
                    <p className="text-xl font-bold text-surface-900 mt-1">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "Billing" && (
          <div className="max-w-2xl space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Subscription</p>
              <div className="space-y-3">
                {[
                  { label: "Plan", value: WS.billing.plan },
                  { label: "Status", value: <StatusBadge status={WS.billing.status} /> },
                  { label: "MRR", value: WS.billing.mrr },
                  { label: "Next renewal", value: WS.billing.nextRenewal },
                  { label: "Payment method", value: WS.billing.paymentMethod },
                  { label: "Stripe ID", value: <span className="font-mono text-xs text-surface-500">{WS.billing.stripeId}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm text-surface-500 w-36 shrink-0">{label}</span>
                    <span className="text-sm text-surface-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "Audit" && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Action</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Actor</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Time</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {WS.audit.map((a, i) => (
                      <tr key={i} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-surface-700">{a.action}</td>
                        <td className="px-5 py-3 text-surface-600">{a.actor}</td>
                        <td className="px-5 py-3 text-surface-500">{a.time}</td>
                        <td className="px-5 py-3 font-mono text-xs text-surface-400">{a.ip}</td>
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
