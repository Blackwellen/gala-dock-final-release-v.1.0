"use client";

import { useState } from "react";
import { UserPlus, Trash2, ChevronDown } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

const MEMBERS = [
  { name: "Priya Chandran", email: "priya@thegrandaffair.co.uk", role: "Owner", joined: "1 Mar 2025", current: true },
  { name: "Tom Aldridge", email: "tom@bloomevents.co.uk", role: "Admin", joined: "14 Apr 2025", current: false },
  { name: "Elena Russo", email: "elena@luxecelebrations.co.uk", role: "Member", joined: "22 May 2025", current: false },
  { name: "Marcus Webb", email: "marcus@skylinevenues.com", role: "Member", joined: "5 Jun 2025", current: false },
  { name: "Sophie Hart", email: "sophie@petalandvine.co.uk", role: "Viewer", joined: "1 Jan 2026", current: false },
];

const PENDING = [
  { email: "lucas@milanevents.es", role: "Member", sentAt: "8 Jun 2026" },
];

const ROLES = ["Admin", "Member", "Viewer"];

export default function TeamSettingsPage() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");
  const [inviteSent, setInviteSent] = useState(false);

  function handleInvite() {
    if (!inviteEmail) return;
    setInviteSent(true);
    setInviteEmail("");
    setTimeout(() => setInviteSent(false), 3000);
  }

  return (
    <SettingsShell title="Team" description="Invite members and manage roles within your workspace.">
      <div className="max-w-2xl space-y-8">
        {/* Invite form */}
        <div>
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Invite a member</h2>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button
              onClick={handleInvite}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" strokeWidth={1.8} />
              Send invite
            </button>
          </div>
          {inviteSent && (
            <p className="mt-2 text-sm text-success-600 font-medium">Invite sent successfully!</p>
          )}
        </div>

        {/* Current members */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">
            Current members <span className="text-surface-400 font-normal">({MEMBERS.length})</span>
          </h2>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Joined</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {MEMBERS.map((m) => (
                    <tr key={m.email} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                            <span className="text-brand-700 text-[10px] font-semibold">
                              {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </span>
                          </div>
                          <span className="font-medium text-surface-900">{m.name}</span>
                          {m.current && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-surface-500 text-xs">{m.email}</td>
                      <td className="px-4 py-3">
                        {m.role === "Owner" ? (
                          <span className="text-sm text-surface-500">{m.role}</span>
                        ) : (
                          <div className="relative inline-block">
                            <select className="appearance-none pl-2 pr-6 py-1 text-xs font-medium bg-surface-50 border border-surface-200 rounded-lg text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
                              {ROLES.map((r) => (
                                <option key={r} selected={r === m.role}>{r}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-surface-500 text-xs">{m.joined}</td>
                      <td className="px-4 py-3 text-right">
                        {!m.current && m.role !== "Owner" && (
                          <button className="p-1.5 text-surface-400 hover:text-danger-600 hover:bg-danger-50 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pending invites */}
        {PENDING.length > 0 && (
          <div className="border-t border-surface-100 pt-6">
            <h2 className="text-sm font-semibold text-surface-900 mb-4">
              Pending invites <span className="text-surface-400 font-normal">({PENDING.length})</span>
            </h2>
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100 bg-surface-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Role</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Sent</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {PENDING.map((p) => (
                      <tr key={p.email} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-3 text-surface-600">{p.email}</td>
                        <td className="px-4 py-3 text-surface-500">{p.role}</td>
                        <td className="px-4 py-3 text-surface-500">{p.sentAt}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="text-xs font-medium text-danger-600 hover:underline">Revoke</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsShell>
  );
}
