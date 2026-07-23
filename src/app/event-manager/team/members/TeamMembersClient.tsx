"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users2,
  UserCheck,
  ShieldAlert,
  TrendingUp,
  CalendarClock,
  LayoutGrid,
  List as ListIcon,
  Search,
  ListFilter,
  Bookmark,
  Download,
  Plus,
  MoreVertical,
  MessageSquare,
  CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { SectionTabs, TEAM_TABS } from "@/components/ui/SectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightsRail, RailCard } from "@/app/event-manager/suppliers/_components/SupplierInsightsRail";
import { MiniDonut } from "@/app/event-manager/suppliers/_components/MiniDonut";
import { SupplierPagination } from "@/app/event-manager/suppliers/_components/SupplierPagination";
import { cn } from "@/lib/utils";
import type { TeamDirectoryMember, TeamAssignmentRow, TeamAvailabilityRow } from "../_data/queries";
import { classifyWorkload, WORKLOAD_STYLES, STANDARD_WEEKLY_HOURS, assignmentSpansDay, assignmentHoursOnDay, buildWeekDays, getWeekStart } from "../_lib/workload";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMoney(cents: number | null, currency: string): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

const COMPLIANCE_STYLES: Record<string, { label: string; classes: string }> = {
  compliant: { label: "Compliant", classes: "bg-success-50 text-success-700 border-success-200" },
  expiring_soon: { label: "Expiring Soon", classes: "bg-warning-50 text-warning-600 border-warning-200" },
  expired: { label: "Expired", classes: "bg-danger-50 text-danger-600 border-danger-200" },
  unknown: { label: "Not tracked", classes: "bg-surface-100 text-surface-500 border-surface-200" },
};

interface EnrichedMember extends TeamDirectoryMember {
  status: ReturnType<typeof classifyWorkload>;
  scheduledHours: number;
  nextAssignment: { name: string; date: string | null } | null;
}

export function TeamMembersClient({
  directory,
  assignments,
  availability,
}: {
  directory: TeamDirectoryMember[];
  assignments: TeamAssignmentRow[];
  availability: TeamAvailabilityRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "cards" ? "cards" : "list";
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(view === "cards" ? 12 : 10);

  function setView(v: "list" | "cards") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", v);
    router.replace(`/event-manager/team/members?${params.toString()}`, { scroll: false });
    setPageSize(v === "cards" ? 12 : 10);
    setPage(1);
  }

  const days = useMemo(() => buildWeekDays(getWeekStart(new Date()), 7), []);

  const enriched: EnrichedMember[] = useMemo(() => {
    return directory.map((m) => {
      const mine = assignments.filter((a) => a.userId === m.userId && a.status !== "declined");
      let scheduledHours = 0;
      for (const day of days) {
        const dayAssignments = mine.filter((a) => assignmentSpansDay(a, day.iso));
        scheduledHours += Math.min(dayAssignments.reduce((sum, a) => sum + assignmentHoursOnDay(a), 0), 24);
      }
      const myBlocks = availability.filter((b) => b.userId === m.userId);
      const weeklyBlocked = myBlocks.some((b) => days.every((d) => d.iso >= b.startAt.slice(0, 10) && d.iso <= b.endAt.slice(0, 10)));
      const status = classifyWorkload(scheduledHours, weeklyBlocked);

      const upcoming = mine
        .filter((a) => a.startAt && new Date(a.startAt).getTime() >= Date.now())
        .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())[0];

      return {
        ...m,
        status,
        scheduledHours,
        nextAssignment: upcoming ? { name: upcoming.eventName, date: upcoming.startAt } : null,
      };
    });
  }, [directory, assignments, availability, days]);

  const roles = useMemo(() => Array.from(new Set(directory.map((m) => m.role).filter(Boolean))) as string[], [directory]);
  const depts = useMemo(() => Array.from(new Set(directory.map((m) => m.department).filter(Boolean))) as string[], [directory]);

  const filtered = useMemo(() => {
    return enriched.filter((m) => {
      if (search.trim() && !m.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (deptFilter !== "all" && m.department !== deptFilter) return false;
      return true;
    });
  }, [enriched, search, roleFilter, deptFilter]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const kpis = useMemo(() => {
    const activeThisWeek = enriched.filter((m) => m.scheduledHours > 0).length;
    const availableNow = enriched.filter((m) => m.status === "light" || m.status === "balanced").length;
    const pendingCompliance = enriched.filter((m) => m.complianceStatus === "expiring_soon" || m.complianceStatus === "expired").length;
    const avgUtilisation = enriched.length
      ? Math.round((enriched.reduce((sum, m) => sum + m.scheduledHours, 0) / (enriched.length * STANDARD_WEEKLY_HOURS)) * 100)
      : 0;
    return { total: directory.length, activeThisWeek, availableNow, pendingCompliance, avgUtilisation };
  }, [enriched, directory.length]);

  const roleMixSegments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of directory) {
      const key = m.department ?? "Other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const palette = ["bg-brand-500", "bg-info-500", "bg-success-500", "bg-warning-500", "bg-danger-500", "bg-violet-500"];
    return Array.from(counts.entries()).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
  }, [directory]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Team Members"
        description="Manage your staffing network, roles, skills and availability"
        actions={
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Add Team Member
          </button>
        }
        tabs={<SectionTabs tabs={TEAM_TABS} />}
      />

      <div className="p-6 space-y-6 max-w-[1600px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Total Team Members" value={String(kpis.total)} icon={Users2} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Active This Week" value={String(kpis.activeThisWeek)} icon={UserCheck} iconColor="text-info-600" iconBg="bg-info-50" />
          <MetricCard label="Available Now" value={String(kpis.availableNow)} icon={CalendarClock} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Pending Compliance" value={String(kpis.pendingCompliance)} icon={ShieldAlert} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Average Utilisation" value={`${kpis.avgUtilisation}%`} icon={TrendingUp} iconColor="text-brand-600" iconBg="bg-brand-50" />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 bg-white border border-surface-200 rounded-xl px-3 py-2.5">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search team members…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-surface-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg bg-white">
                <option value="all">All Roles</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }} className="px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg bg-white">
                <option value="all">All Departments</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <ListFilter className="w-3.5 h-3.5" /> More filters
              </button>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <Bookmark className="w-3.5 h-3.5" /> Saved views
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  aria-label="List view"
                  className={cn("p-1.5 rounded-lg border", view === "list" ? "bg-brand-50 border-brand-200 text-brand-700" : "border-surface-200 text-surface-400 hover:bg-surface-50")}
                >
                  <ListIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("cards")}
                  aria-label="Card view"
                  className={cn("p-1.5 rounded-lg border", view === "cards" ? "bg-brand-50 border-brand-200 text-brand-700" : "border-surface-200 text-surface-400 hover:bg-surface-50")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button type="button" aria-label="Export" className="p-1.5 rounded-lg border border-surface-200 text-surface-400 hover:bg-surface-50">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <EmptyState icon={Users2} title="No team members match your filters" description="Try clearing filters or search terms." compact />
              </div>
            ) : view === "list" ? (
              <ListView members={paged} />
            ) : (
              <CardView members={paged} />
            )}

            {filtered.length > 0 && (
              <SupplierPagination
                total={filtered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                pageSizeOptions={view === "cards" ? [12, 24, 48] : [10, 25, 50]}
                itemLabel="members"
              />
            )}
          </div>

          <InsightsRail>
            <RailCard title="Team by Role">
              <MiniDonut segments={roleMixSegments} centerLabel={String(directory.length)} centerSubLabel="Total" />
            </RailCard>
            <RailCard title="Recently Updated Profiles">
              <p className="text-xs text-surface-400">Profile change history will appear here once audit logging is wired.</p>
            </RailCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}

function MemberIdentity({ m }: { m: EnrichedMember }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
        {initials(m.name)}
      </span>
      <div className="min-w-0">
        <Link href={`/event-manager/team/members/${m.userId}/overview`} className="font-medium text-surface-900 truncate text-sm hover:text-brand-700 block">
          {m.name}
        </Link>
        <p className="text-xs text-surface-400 truncate">{m.location ?? "—"}</p>
      </div>
    </div>
  );
}

function ListView({ members }: { members: EnrichedMember[] }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="w-10 px-4 py-3"><input type="checkbox" className="rounded border-surface-300" aria-label="Select all" /></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Team Member</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Department</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Utilisation</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Next Assignment</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Compliance</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {members.map((m) => {
              const workStyle = WORKLOAD_STYLES[m.status];
              const compliance = COMPLIANCE_STYLES[m.complianceStatus];
              const pct = Math.round((m.scheduledHours / STANDARD_WEEKLY_HOURS) * 100);
              return (
                <tr key={m.userId} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3.5"><input type="checkbox" className="rounded border-surface-300" aria-label={`Select ${m.name}`} /></td>
                  <td className="px-4 py-3.5"><MemberIdentity m={m} /></td>
                  <td className="px-4 py-3.5">
                    <p className="text-surface-800">{m.role ?? "—"}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {m.skills.slice(0, 2).map((s) => (
                        <span key={s} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-surface-100 text-surface-600">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-surface-600 hidden md:table-cell">{m.department ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border", workStyle.bg, workStyle.text, workStyle.border)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", workStyle.dot)} />
                      {workStyle.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 hidden lg:table-cell w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                        <div className={cn("h-full rounded-full", workStyle.dot)} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="text-xs text-surface-500 tabular-nums w-9 text-right">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-surface-500 hidden xl:table-cell whitespace-nowrap">
                    {m.nextAssignment ? `${m.nextAssignment.name} · ${m.nextAssignment.date ? new Date(m.nextAssignment.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "TBC"}` : "—"}
                  </td>
                  <td className="px-4 py-3.5 hidden xl:table-cell">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", compliance.classes)}>{compliance.label}</span>
                  </td>
                  <td className="px-4 py-3.5 text-surface-300">
                    <button type="button" aria-label="Row actions" className="p-1 rounded hover:bg-surface-100">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardView({ members }: { members: EnrichedMember[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {members.map((m) => {
        const workStyle = WORKLOAD_STYLES[m.status];
        const compliance = COMPLIANCE_STYLES[m.complianceStatus];
        const pct = Math.round((m.scheduledHours / STANDARD_WEEKLY_HOURS) * 100);
        return (
          <div key={m.userId} className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative w-10 h-10 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold flex items-center justify-center shrink-0">
                  {initials(m.name)}
                  <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white", workStyle.dot)} />
                </span>
                <div className="min-w-0">
                  <Link href={`/event-manager/team/members/${m.userId}/overview`} className="font-semibold text-surface-900 text-sm hover:text-brand-700 truncate block">
                    {m.name}
                  </Link>
                  <p className="text-xs text-surface-400 truncate">{m.role ?? "Team member"}</p>
                </div>
              </div>
              <button type="button" aria-label="Member actions" className="p-1 rounded hover:bg-surface-100 text-surface-400 shrink-0">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-surface-400 mb-2">{m.location ?? "—"}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {m.skills.slice(0, 3).map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-surface-100 text-surface-600">{s}</span>
              ))}
            </div>
            <div className="text-xs text-surface-400 uppercase tracking-wide mb-1">Rate / Type</div>
            <p className="text-sm text-surface-700 mb-3">
              {formatMoney(m.dayRateCents, m.currency)} / day · {m.employmentType}
            </p>
            <div className="text-xs text-surface-400 uppercase tracking-wide mb-1">Current Load</div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                <div className={cn("h-full rounded-full", workStyle.dot)} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <span className="text-xs text-surface-500 tabular-nums">{Math.round(m.scheduledHours)}h / {STANDARD_WEEKLY_HOURS}h</span>
            </div>
            <div className="text-xs text-surface-400 uppercase tracking-wide mb-1">Next Event</div>
            <p className="text-sm text-surface-600 mb-3 truncate">
              {m.nextAssignment ? `${m.nextAssignment.name}${m.nextAssignment.date ? ` · ${new Date(m.nextAssignment.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}` : "No upcoming assignment"}
            </p>
            <span className={cn("self-start inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mb-3", compliance.classes)}>{compliance.label}</span>
            <div className="mt-auto pt-3 border-t border-surface-100 flex items-center gap-2">
              <button type="button" className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <MessageSquare className="w-3.5 h-3.5" /> Message
              </button>
              <Link href={`/event-manager/team/members/${m.userId}/overview`} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100">
                View Profile
              </Link>
              <Link href={`/event-manager/team/members/${m.userId}/schedule`} aria-label="Schedule" className="p-1.5 text-surface-500 border border-surface-200 rounded-lg hover:bg-surface-50">
                <CalendarDays className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
