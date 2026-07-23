"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Star, X, Bookmark } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, TEAM_TABS } from "@/components/ui/SectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { TeamDirectoryMember, TeamAssignmentRow } from "../_data/queries";
import { classifyWorkload, WORKLOAD_STYLES, STANDARD_WEEKLY_HOURS, assignmentSpansDay, assignmentHoursOnDay, buildWeekDays, getWeekStart } from "../_lib/workload";
import { Users2 } from "lucide-react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function FindTeamClient({ directory, assignments }: { directory: TeamDirectoryMember[]; assignments: TeamAssignmentRow[] }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [shortlist, setShortlist] = useState<string[]>([]);

  const days = useMemo(() => buildWeekDays(getWeekStart(new Date()), 7), []);
  const roles = useMemo(() => Array.from(new Set(directory.map((m) => m.role).filter(Boolean))) as string[], [directory]);
  const locations = useMemo(() => Array.from(new Set(directory.map((m) => m.location).filter(Boolean))) as string[], [directory]);

  const enriched = useMemo(() => {
    return directory.map((m) => {
      const mine = assignments.filter((a) => a.userId === m.userId && a.status !== "declined");
      let scheduledHours = 0;
      for (const day of days) {
        const dayAssignments = mine.filter((a) => assignmentSpansDay(a, day.iso));
        scheduledHours += Math.min(dayAssignments.reduce((sum, a) => sum + assignmentHoursOnDay(a), 0), 24);
      }
      const status = classifyWorkload(scheduledHours, false);
      return { ...m, scheduledHours, status, utilisationPct: Math.round((scheduledHours / STANDARD_WEEKLY_HOURS) * 100) };
    });
  }, [directory, assignments, days]);

  const results = useMemo(() => {
    return enriched
      .filter((m) => {
        if (search.trim() && !m.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (roleFilter !== "all" && m.role !== roleFilter) return false;
        if (locationFilter !== "all" && m.location !== locationFilter) return false;
        return true;
      })
      .sort((a, b) => a.utilisationPct - b.utilisationPct);
  }, [enriched, search, roleFilter, locationFilter]);

  function toggleShortlist(userId: string) {
    setShortlist((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  const shortlistedMembers = enriched.filter((m) => shortlist.includes(m.userId));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Find Team Members"
        description="Search by role, skills, area, and availability to find the right people for your events."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
              <Bookmark className="w-4 h-4" /> Saved Searches
            </button>
            <button type="button" className="px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-brand">
              Save Search
            </button>
          </div>
        }
        tabs={<SectionTabs tabs={TEAM_TABS} />}
      />

      <div className="p-6 space-y-6 max-w-[1600px]">
        <div className="flex flex-col xl:flex-row gap-6">
          <aside className="w-full xl:w-64 shrink-0 space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Search</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, skill, keyword…" className="w-full pl-8 pr-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Role</label>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white">
                  <option value="all">All Roles</option>
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Location / Area</label>
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white">
                  <option value="all">All Locations</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </aside>

          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-900">Results ({results.length})</h2>
            </div>

            {results.length === 0 ? (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <EmptyState icon={Users2} title="No matches" description="Try widening your filters." compact />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Team Member</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Coverage Area</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Core Skills</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Availability</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Rating</th>
                      <th className="px-4 py-3 w-56" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {results.map((m) => {
                      const style = WORKLOAD_STYLES[m.status];
                      return (
                        <tr key={m.userId} className="hover:bg-surface-50">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">{initials(m.name)}</span>
                              <div className="min-w-0">
                                <p className="font-medium text-surface-900 text-sm truncate">{m.name}</p>
                                <p className="text-xs text-surface-400 truncate">{m.role ?? "—"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-surface-600 hidden md:table-cell">{m.location ?? "—"}</td>
                          <td className="px-4 py-3.5 hidden lg:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {m.skills.slice(0, 3).map((s) => <span key={s} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-surface-100 text-surface-600">{s}</span>)}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border", style.bg, style.text, style.border)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
                              {m.utilisationPct}% booked
                            </span>
                          </td>
                          <td className="px-4 py-3.5 hidden lg:table-cell">
                            {m.rating ? (
                              <span className="flex items-center gap-1 text-surface-700"><Star className="w-3.5 h-3.5 fill-warning-400 text-warning-400" /> {m.rating.toFixed(1)}</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 justify-end">
                              <Link href={`/event-manager/team/members/${m.userId}/overview`} className="px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">View Profile</Link>
                              <button
                                type="button"
                                onClick={() => toggleShortlist(m.userId)}
                                className={cn(
                                  "px-2.5 py-1.5 text-xs font-medium rounded-lg border",
                                  shortlist.includes(m.userId) ? "bg-brand-600 text-white border-brand-600" : "text-surface-600 border-surface-200 hover:bg-surface-50",
                                )}
                              >
                                {shortlist.includes(m.userId) ? "Shortlisted" : "Shortlist"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="w-full xl:w-[280px] shrink-0">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-surface-900">Shortlist ({shortlist.length})</h3>
                {shortlist.length > 0 && (
                  <button type="button" onClick={() => setShortlist([])} className="text-xs text-surface-400 hover:text-danger-600">Clear all</button>
                )}
              </div>
              {shortlistedMembers.length === 0 ? (
                <p className="text-xs text-surface-400">Add people to your shortlist to compare and assign them together.</p>
              ) : (
                <ul className="space-y-2.5">
                  {shortlistedMembers.map((m) => (
                    <li key={m.userId} className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold flex items-center justify-center shrink-0">{initials(m.name)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-surface-800 truncate">{m.name}</p>
                        <p className="text-[11px] text-surface-400 truncate">{m.role ?? "—"}</p>
                      </div>
                      <button type="button" onClick={() => toggleShortlist(m.userId)} aria-label="Remove" className="p-1 text-surface-400 hover:text-danger-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
