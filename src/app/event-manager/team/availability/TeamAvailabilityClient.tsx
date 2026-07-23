"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users2,
  CalendarDays,
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  Plane,
  ChevronLeft,
  ChevronRight,
  Search,
  ListFilter,
  Bookmark,
  Plus,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { SectionTabs, TEAM_TABS } from "@/components/ui/SectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightsRail, RailCard } from "@/app/event-manager/suppliers/_components/SupplierInsightsRail";
import { MiniDonut } from "@/app/event-manager/suppliers/_components/MiniDonut";
import { cn } from "@/lib/utils";
import type { TeamWorkspaceData } from "../_data/queries";
import { addAvailabilityBlock, removeAvailabilityBlock } from "../actions";
import { BLOCK_TYPES, BLOCK_TYPE_LABELS } from "../lib";
import { buildWeekDays, formatWeekRangeLabel, getWeekStart, blockSpansDay } from "../_lib/workload";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_CELL_STYLES: Record<string, string> = {
  available: "bg-success-50 text-success-700 border-success-100",
  holiday: "bg-surface-100 text-surface-500 border-surface-200",
  sick: "bg-danger-50 text-danger-600 border-danger-100",
  training: "bg-info-50 text-info-600 border-info-100",
  tentative: "bg-warning-50 text-warning-700 border-warning-100",
  personal: "bg-surface-100 text-surface-500 border-surface-200",
  "external-event": "bg-surface-100 text-surface-500 border-surface-200",
  other: "bg-surface-100 text-surface-500 border-surface-200",
};

export function TeamAvailabilityClient({ members, assignments, availability }: TeamWorkspaceData) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const days = useMemo(() => buildWeekDays(weekStart, 7), [weekStart]);
  const weekRangeLabel = formatWeekRangeLabel(days);

  const filteredMembers = useMemo(
    () =>
      search.trim()
        ? members.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
        : members,
    [members, search],
  );

  const eventsStaffed = new Set(assignments.filter((a) => a.status !== "declined").map((a) => a.eventId)).size;

  const perMember = useMemo(() => {
    return filteredMembers.map((m) => {
      const blocks = availability.filter((b) => b.userId === m.userId);
      const cells = days.map((d) => {
        if (d.isWeekend) return { label: "OOO", hours: "All day", type: "weekend" as const, hoursNum: 0 };
        const block = blocks.find((b) => blockSpansDay(b, d.iso));
        if (block) {
          return {
            label: BLOCK_TYPE_LABELS[block.blockType] ?? "Unavailable",
            hours: "All day",
            type: block.blockType,
            hoursNum: 0,
          };
        }
        return { label: "Available", hours: "8h", type: "available" as const, hoursNum: 8 };
      });
      const weekTotal = cells.reduce((sum, c) => sum + c.hoursNum, 0);
      return { member: m, blocks, cells, weekTotal };
    });
  }, [filteredMembers, availability, days]);

  const now = Date.now();
  const activeOOO = new Set(
    availability.filter((b) => new Date(b.endAt).getTime() >= now && new Date(b.startAt).getTime() <= now).map((b) => b.userId),
  ).size;
  const scheduledLeave = new Set(availability.filter((b) => new Date(b.endAt).getTime() >= now).map((b) => b.userId)).size;
  const totalPossible = members.length * 40 || 1;
  const totalAvailable = perMember.reduce((sum, p) => sum + p.weekTotal, 0);
  const availabilityPct = Math.round((totalAvailable / totalPossible) * 100);

  const memberOptions = members.map((m) => ({ userId: m.userId, name: m.name }));

  function handleRemove(id: string) {
    startTransition(async () => {
      await removeAvailabilityBlock(id);
      router.refresh();
    });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Team & Staffing"
        description="Workload across the team, who is available, and who is out of office"
        actions={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Add Availability
          </button>
        }
        tabs={<SectionTabs tabs={TEAM_TABS} />}
      />

      <div className="p-6 space-y-6 max-w-[1600px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Team Members" value={String(members.length)} icon={Users2} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Events Staffed" value={String(eventsStaffed)} icon={CalendarDays} iconColor="text-info-600" iconBg="bg-info-50" />
          <MetricCard label="Overloaded" value="—" icon={AlertTriangle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Active Out-of-Office" value={String(activeOOO)} icon={CalendarOff} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Availability This Week" value={`${Math.max(0, availabilityPct)}%`} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Scheduled Leave" value={String(scheduledLeave)} icon={Plane} iconColor="text-brand-600" iconBg="bg-brand-50" />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 bg-white border border-surface-200 rounded-xl px-3 py-2.5">
              <button type="button" onClick={() => setWeekStart(getWeekStart(new Date(weekStart.getTime() - 7 * 86400000)))} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" aria-label="Previous week">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-surface-700 whitespace-nowrap px-1">{weekRangeLabel}</span>
              <button type="button" onClick={() => setWeekStart(getWeekStart(new Date(weekStart.getTime() + 7 * 86400000)))} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" aria-label="Next week">
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="relative ml-auto flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search team members…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-surface-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <ListFilter className="w-3.5 h-3.5" /> More filters
              </button>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
                <Bookmark className="w-3.5 h-3.5" /> Saved views
              </button>
            </div>

            {perMember.length === 0 ? (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <EmptyState icon={Users2} title="No team members yet" description="Invite teammates from Settings to start tracking availability." compact />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="sticky left-0 z-10 bg-surface-50 px-4 py-2.5 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider w-56">Team Member</th>
                        {days.map((d) => (
                          <th key={d.iso} className={cn("px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider min-w-[110px]", d.isToday ? "text-brand-700 bg-brand-50/60" : "text-surface-500")}>
                            {d.dow} {d.label}
                          </th>
                        ))}
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-28">Week Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {perMember.map(({ member, cells, weekTotal }) => (
                        <tr key={member.userId}>
                          <td className="sticky left-0 z-10 bg-white px-4 py-3 w-56">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                                {initials(member.name)}
                              </span>
                              <div className="min-w-0">
                                <p className="font-medium text-surface-900 truncate text-sm">{member.name}</p>
                                <p className="text-xs text-surface-400 truncate">{member.role ?? "Team member"}</p>
                              </div>
                            </div>
                          </td>
                          {cells.map((c, i) => (
                            <td key={i} className="px-1.5 py-2 text-center">
                              <div className={cn("rounded-md border px-2 py-1.5 text-[11px] leading-tight", STATUS_CELL_STYLES[c.type] ?? STATUS_CELL_STYLES.available)}>
                                <div className="font-medium">{c.label}</div>
                                <div className="opacity-70">{c.hours}</div>
                              </div>
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right text-sm font-semibold text-surface-700 tabular-nums">
                            {weekTotal}h / 40h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 border-t border-surface-200 bg-surface-50 text-xs text-surface-500">
                  <LegendDot className="bg-success-500" label="Available" />
                  <LegendDot className="bg-warning-500" label="Tentative" />
                  <LegendDot className="bg-info-500" label="Training" />
                  <LegendDot className="bg-danger-500" label="Sick Leave" />
                  <LegendDot className="bg-surface-400" label="Holiday / OOO" />
                </div>
              </div>
            )}

            {availability.length > 0 && (
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
                  <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">All availability blocks</h3>
                </div>
                <ul className="divide-y divide-surface-100">
                  {availability.map((b) => {
                    const m = members.find((mm) => mm.userId === b.userId);
                    return (
                      <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                          {initials(m?.name ?? "Team member")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-surface-900 truncate text-sm">{m?.name ?? "Team member"}</p>
                          <p className="text-xs text-surface-400">
                            {BLOCK_TYPE_LABELS[b.blockType] ?? b.blockType}
                            {b.reason ? ` · ${b.reason}` : ""}
                          </p>
                        </div>
                        <span className="text-sm text-surface-500 whitespace-nowrap">
                          {new Date(b.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} –{" "}
                          {new Date(b.endAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemove(b.id)}
                          disabled={pending}
                          aria-label="Remove block"
                          className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                        >
                          <X className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <InsightsRail>
            <RailCard title="Availability Summary">
              <MiniDonut
                segments={[
                  { label: "Available", value: totalAvailable, color: "bg-success-500" },
                  { label: "Unavailable", value: Math.max(totalPossible - totalAvailable, 0), color: "bg-surface-300" },
                ]}
                centerLabel={`${Math.max(0, availabilityPct)}%`}
                centerSubLabel="Available"
              />
            </RailCard>
            <RailCard title="Upcoming Leave">
              {availability.filter((b) => new Date(b.endAt).getTime() >= now).length === 0 ? (
                <p className="text-xs text-surface-400">No upcoming leave scheduled.</p>
              ) : (
                <ul className="space-y-2.5">
                  {availability
                    .filter((b) => new Date(b.endAt).getTime() >= now)
                    .slice(0, 5)
                    .map((b) => {
                      const m = members.find((mm) => mm.userId === b.userId);
                      return (
                        <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-surface-700 truncate">{m?.name ?? "Team member"}</span>
                          <span className="text-surface-400 shrink-0">{BLOCK_TYPE_LABELS[b.blockType] ?? b.blockType}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </RailCard>
            <RailCard title="Coverage Risks" viewAllHref="/event-manager/team/staffing-requests">
              <p className="text-xs text-surface-400">Role-coverage gap detection will appear here once staffing requests are wired to events.</p>
            </RailCard>
          </InsightsRail>
        </div>
      </div>

      {showAdd && (
        <AddBlockDialog memberOptions={memberOptions} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function AddBlockDialog({
  memberOptions,
  onClose,
}: {
  memberOptions: { userId: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full px-3 py-2 text-sm text-surface-800 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "block text-xs font-medium text-surface-600 mb-1.5";

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addAvailabilityBlock(formData);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add block");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-surface-900">Add Availability Block</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors">
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <form action={onSubmit} className="p-5 space-y-4">
          {memberOptions.length > 0 && (
            <div>
              <label className={labelCls} htmlFor="user_id">Team Member</label>
              <select id="user_id" name="user_id" className={inputCls} defaultValue="">
                <option value="">Me</option>
                {memberOptions.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="start_date">Start Date</label>
              <input id="start_date" name="start_date" type="date" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="end_date">End Date</label>
              <input id="end_date" name="end_date" type="date" required className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="block_type">Type</label>
            <select id="block_type" name="block_type" className={inputCls} defaultValue="holiday">
              {BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="reason">Reason (optional)</label>
            <input id="reason" name="reason" type="text" placeholder="e.g. Annual leave" className={inputCls} />
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-medium text-surface-600 rounded-lg hover:bg-surface-100 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
              {pending ? "Saving…" : "Save Block"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
