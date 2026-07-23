"use client";

import { useState } from "react";
import { ArrowLeft, ShieldCheck, ShieldOff, LogOut, Building2, Clock, Calendar, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Workspaces", "Activity", "Security"];

const USER = {
  name: "Priya Chandran",
  email: "priya@thegrandaffair.co.uk",
  phone: "+44 7700 900123",
  role: "member",
  created: "1 Mar 2025",
  lastLogin: "10 Jun 2026 at 09:42",
  mfaEnabled: true,
  activeSessions: 2,
  workspaces: [
    { name: "The Grand Affair", role: "Owner", plan: "Pro", joined: "1 Mar 2025" },
    { name: "Bloom Events Co.", role: "Member", plan: "Starter", joined: "14 Apr 2025" },
  ],
  activity: [
    { action: "session.login", resource: "—", time: "10 Jun 2026 09:42", ip: "185.123.45.67" },
    { action: "event.created", resource: "Midsummer Gala 2026", time: "9 Jun 2026 14:11", ip: "185.123.45.67" },
    { action: "invoice.sent", resource: "INV-0047", time: "8 Jun 2026 11:30", ip: "185.123.45.67" },
    { action: "supplier.invited", resource: "Floral Dreams Ltd", time: "7 Jun 2026 16:55", ip: "185.123.45.67" },
  ],
};

export function UserDetailPageClient() {
  const [tab, setTab] = useState("Overview");

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-surface-200 px-6 pt-5 pb-0">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs text-surface-500 hover:text-brand-600 mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Users
        </Link>
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
            <span className="text-brand-700 text-base font-bold">
              {USER.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-surface-900">{USER.name}</h1>
            <p className="text-sm text-surface-500 mt-0.5">{USER.email}</p>
            <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200 capitalize">
              {USER.role}
            </span>
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
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Account Info</p>
              <div className="space-y-3">
                {[
                  { icon: Mail, label: "Email", value: USER.email },
                  { icon: Phone, label: "Phone", value: USER.phone },
                  { icon: Calendar, label: "Created", value: USER.created },
                  { icon: Clock, label: "Last login", value: USER.lastLogin },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                    <span className="text-sm text-surface-500 w-24 shrink-0">{label}</span>
                    <span className="text-sm text-surface-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "Workspaces" && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Role</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Plan</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {USER.workspaces.map((ws) => (
                      <tr key={ws.name} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 font-medium text-surface-900">
                            <Building2 className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                            {ws.name}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-surface-600">{ws.role}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                            {ws.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-surface-500">{ws.joined}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "Activity" && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Action</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Resource</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Time</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {USER.activity.map((a, i) => (
                      <tr key={i} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-surface-700">{a.action}</td>
                        <td className="px-5 py-3 text-surface-600">{a.resource}</td>
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

        {tab === "Security" && (
          <div className="max-w-2xl space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {USER.mfaEnabled ? (
                  <ShieldCheck className="w-5 h-5 text-success-600" strokeWidth={1.8} />
                ) : (
                  <ShieldOff className="w-5 h-5 text-warning-600" strokeWidth={1.8} />
                )}
                <div>
                  <p className="text-sm font-medium text-surface-900">Two-factor authentication</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {USER.mfaEnabled ? "MFA is enabled on this account." : "MFA is not enabled."}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border",
                  USER.mfaEnabled
                    ? "bg-success-50 text-success-700 border-success-200"
                    : "bg-warning-50 text-warning-700 border-warning-200"
                )}
              >
                {USER.mfaEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-surface-400" strokeWidth={1.8} />
                <div>
                  <p className="text-sm font-medium text-surface-900">Active sessions</p>
                  <p className="text-xs text-surface-500 mt-0.5">{USER.activeSessions} sessions currently active.</p>
                </div>
              </div>
              <button className="px-3 py-1.5 text-xs font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 border border-danger-200 rounded-lg transition-colors">
                Revoke all sessions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
