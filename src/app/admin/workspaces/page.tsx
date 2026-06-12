"use client";

import { useState } from "react";
import { Search, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

const TABS = ["All", "Active", "Trialing", "Suspended"];

const WORKSPACES = [
  { id: "ws1", name: "The Grand Affair", plan: "Pro", members: 5, events: 24, storage: "2.1 GB", created: "1 Mar 2025", status: "active" as const },
  { id: "ws2", name: "Bloom Events Co.", plan: "Starter", members: 2, events: 8, storage: "340 MB", created: "12 Jan 2025", status: "active" as const },
  { id: "ws3", name: "Luxe Celebrations", plan: "Pro", members: 7, events: 41, storage: "5.8 GB", created: "22 Feb 2025", status: "active" as const },
  { id: "ws4", name: "Skyline Venues", plan: "Enterprise", members: 18, events: 112, storage: "22.4 GB", created: "5 Nov 2024", status: "active" as const },
  { id: "ws5", name: "Petal & Vine", plan: "Starter", members: 1, events: 3, storage: "90 MB", created: "18 Apr 2025", status: "pending" as const },
  { id: "ws6", name: "Milan Events", plan: "Pro", members: 4, events: 19, storage: "1.4 GB", created: "14 Dec 2024", status: "pending" as const },
  { id: "ws7", name: "Goldencrest Events", plan: "Starter", members: 2, events: 6, storage: "210 MB", created: "3 Feb 2026", status: "inactive" as const },
  { id: "ws8", name: "Horizon Gatherings", plan: "Pro", members: 3, events: 11, storage: "780 MB", created: "20 Oct 2024", status: "active" as const },
];

const STATUS_TAB_MAP: Record<string, string[]> = {
  All: ["active", "pending", "inactive"],
  Active: ["active"],
  Trialing: ["pending"],
  Suspended: ["inactive"],
};

export default function WorkspacesPage() {
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = WORKSPACES.filter((ws) => {
    const matchesStatus = STATUS_TAB_MAP[activeTab].includes(ws.status);
    const matchesSearch = ws.name.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Workspaces"
        description="All workspaces registered on the platform."
        actions={
          <div className="text-sm text-surface-500 bg-surface-100 px-3 py-1.5 rounded-lg">
            {WORKSPACES.length} total
          </div>
        }
        tabs={
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-all",
                  activeTab === t
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-surface-500 hover:text-surface-900"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        }
      />

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" strokeWidth={1.8} />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Members</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Events</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Storage Used</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Created</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {filtered.map((ws) => (
                  <tr key={ws.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.8} />
                        </div>
                        <a
                          href={`/admin/workspaces/${ws.id}`}
                          className="font-medium text-surface-900 group-hover:text-brand-600 transition-colors"
                        >
                          {ws.name}
                        </a>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                        {ws.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{ws.members}</td>
                    <td className="px-5 py-3 text-surface-600 tabular-nums">{ws.events}</td>
                    <td className="px-5 py-3 text-surface-600">{ws.storage}</td>
                    <td className="px-5 py-3 text-surface-500">{ws.created}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={ws.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-surface-400 text-sm">No workspaces found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
