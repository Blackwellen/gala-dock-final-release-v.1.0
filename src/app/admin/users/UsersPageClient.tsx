"use client";

import { useState } from "react";
import { Search, Users, UserCog, Shield, User } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

type Role = "platform_admin" | "support" | "member";

const ROLE_STYLES: Record<Role, string> = {
  platform_admin: "bg-danger-50 text-danger-700 border-danger-200",
  support: "bg-warning-50 text-warning-700 border-warning-200",
  member: "bg-surface-100 text-surface-600 border-surface-200",
};

const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "Platform Admin",
  support: "Support",
  member: "Member",
};

const USERS = [
  { id: "u1", name: "Priya Chandran", email: "priya@thegrandaffair.co.uk", workspaces: 1, role: "member" as Role, lastActive: "10 Jun 2026", created: "1 Mar 2025" },
  { id: "u2", name: "Tom Aldridge", email: "tom@bloomevents.co.uk", workspaces: 2, role: "member" as Role, lastActive: "9 Jun 2026", created: "12 Jan 2025" },
  { id: "u3", name: "Elena Russo", email: "elena@luxecelebrations.co.uk", workspaces: 1, role: "member" as Role, lastActive: "8 Jun 2026", created: "22 Feb 2025" },
  { id: "u4", name: "Marcus Webb", email: "marcus@skylinevenues.com", workspaces: 3, role: "member" as Role, lastActive: "7 Jun 2026", created: "5 Nov 2024" },
  { id: "u5", name: "Sophie Hart", email: "sophie@petalandvine.co.uk", workspaces: 1, role: "member" as Role, lastActive: "6 Jun 2026", created: "18 Apr 2025" },
  { id: "u6", name: "James Okafor", email: "james@gala-dock.com", workspaces: 0, role: "platform_admin" as Role, lastActive: "10 Jun 2026", created: "1 Jan 2024" },
  { id: "u7", name: "Anaya Patel", email: "anaya@gala-dock.com", workspaces: 0, role: "support" as Role, lastActive: "10 Jun 2026", created: "3 Sep 2024" },
  { id: "u8", name: "Lucas Fernandez", email: "lucas@milanevents.es", workspaces: 2, role: "member" as Role, lastActive: "4 Jun 2026", created: "14 Dec 2024" },
];

export function UsersPageClient() {
  const [search, setSearch] = useState("");

  const filtered = USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Users"
        description="All platform users across every workspace."
        actions={
          <div className="text-sm text-surface-500 bg-surface-100 px-3 py-1.5 rounded-lg">
            {USERS.length} total users
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Search toolbar */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" strokeWidth={1.8} />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspaces</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Last Active</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-xs font-semibold">
                            {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </span>
                        </div>
                        <a href={`/admin/users/${user.id}`} className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                          {user.name}
                        </a>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-surface-500">{user.email}</td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{user.workspaces}</td>
                    <td className="px-5 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", ROLE_STYLES[user.role])}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-500">{user.lastActive}</td>
                    <td className="px-5 py-3 text-surface-500">{user.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-surface-400 text-sm">No users match your search.</div>
          )}
        </div>
      </div>
    </div>
  );
}
