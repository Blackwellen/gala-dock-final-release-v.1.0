"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users2,
  CalendarDays,
  AlertTriangle,
  CalendarOff,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabNav } from "@/components/ui/TabNav";
import { cn } from "@/lib/utils";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_LABELS,
  blockTypeLabel,
  formatDate,
  formatRange,
  loadLevel,
  LOAD_STYLES,
} from "./lib";
import { addAvailabilityBlock, removeAvailabilityBlock } from "./actions";

export interface MemberBlock {
  id: string;
  startAt: string;
  endAt: string;
  blockType: string;
  reason: string | null;
}

export interface MemberRow {
  userId: string;
  name: string;
  email: string | null;
  role: string | null;
  eventCount: number;
  assignmentCount: number;
  confirmedCount: number;
  upcomingEvents: { id: string; name: string; startAt: string | null }[];
  blocks: MemberBlock[];
}

export interface AvailabilityRow {
  id: string;
  userId: string;
  name: string;
  startAt: string;
  endAt: string;
  blockType: string;
  reason: string | null;
}

export interface TeamKpis {
  members: number;
  assignedEvents: number;
  overloaded: number;
  activeBlocks: number;
}

const TABS = [
  { id: "workload", label: "Workload" },
  { id: "availability", label: "Availability" },
];

export function TeamClient({
  members,
  availability,
  kpis,
  memberOptions,
}: {
  members: MemberRow[];
  availability: AvailabilityRow[];
  kpis: TeamKpis;
  memberOptions: { userId: string; name: string }[];
}) {
  const [tab, setTab] = useState("workload");
  const [showAdd, setShowAdd] = useState(false);

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
        tabs={<TabNav tabs={TABS} active={tab} onChange={setTab} />}
      />

      <div className="p-6 space-y-6 max-w-[1400px]">
        <KPIGrid className="grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Team Members"
            value={String(kpis.members)}
            icon={Users2}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
          <MetricCard
            label="Events Staffed"
            value={String(kpis.assignedEvents)}
            icon={CalendarDays}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard
            label="Overloaded"
            value={String(kpis.overloaded)}
            icon={AlertTriangle}
            iconColor="text-danger-600"
            iconBg="bg-danger-50"
          />
          <MetricCard
            label="Active Out-of-Office"
            value={String(kpis.activeBlocks)}
            icon={CalendarOff}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
        </KPIGrid>

        {tab === "workload" ? (
          <WorkloadTable members={members} />
        ) : (
          <AvailabilityView availability={availability} />
        )}
      </div>

      {showAdd && (
        <AddBlockDialog
          memberOptions={memberOptions}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function WorkloadTable({ members }: { members: MemberRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (members.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <EmptyState
          icon={Users2}
          title="No team members yet"
          description="Invite teammates from Settings to start tracking workload and assignments."
          compact
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200 bg-surface-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Team Member
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">
              Active Events
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">
              Confirmed Roles
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">
              Next Event
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Load
            </th>
            <th className="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {members.map((m) => {
            const level = loadLevel(m.eventCount);
            const style = LOAD_STYLES[level];
            const isOpen = expanded === m.userId;
            const next = m.upcomingEvents[0];
            const activeBlock = m.blocks.find(
              (b) => new Date(b.endAt).getTime() >= Date.now(),
            );
            return (
              <Fragment key={m.userId}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : m.userId)}
                  className="hover:bg-surface-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                        {initials(m.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-surface-900 truncate">{m.name}</p>
                        <p className="text-xs text-surface-400 truncate">
                          {m.role ?? m.email ?? "Member"}
                        </p>
                      </div>
                      {activeBlock && (
                        <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning-50 text-warning-600 border border-warning-200 shrink-0">
                          <CalendarOff className="w-3 h-3" strokeWidth={2} />
                          Out of Office
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-surface-700 hidden md:table-cell tabular-nums">
                    {m.eventCount}
                  </td>
                  <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell tabular-nums">
                    {m.confirmedCount} / {m.assignmentCount}
                  </td>
                  <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell whitespace-nowrap">
                    {next ? `${next.name} · ${formatDate(next.startAt, "TBC")}` : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
                        style.classes,
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      {style.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-surface-300">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4" strokeWidth={1.8} />
                    ) : (
                      <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-surface-50/60">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                            Upcoming Events
                          </p>
                          {m.upcomingEvents.length === 0 ? (
                            <p className="text-sm text-surface-400">No assigned events.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {m.upcomingEvents.map((e) => (
                                <li
                                  key={e.id}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <span className="text-surface-700 truncate">{e.name}</span>
                                  <span className="text-surface-400 whitespace-nowrap">
                                    {formatDate(e.startAt, "TBC")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                            Out of Office
                          </p>
                          {m.blocks.length === 0 ? (
                            <p className="text-sm text-surface-400">No availability blocks.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {m.blocks.map((b) => (
                                <li
                                  key={b.id}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <span className="text-surface-700">
                                    {blockTypeLabel(b.blockType)}
                                  </span>
                                  <span className="text-surface-400 whitespace-nowrap">
                                    {formatRange(b.startAt, b.endAt)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AvailabilityView({ availability }: { availability: AvailabilityRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const now = Date.now();
  const active = availability.filter((b) => new Date(b.endAt).getTime() >= now);
  const past = availability.filter((b) => new Date(b.endAt).getTime() < now);

  function handleRemove(id: string) {
    startTransition(async () => {
      await removeAvailabilityBlock(id);
      router.refresh();
    });
  }

  if (availability.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <EmptyState
          icon={CalendarClock}
          title="No availability blocks"
          description="Add holidays, sick leave or training so clashes surface when staffing events."
          compact
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BlockList
        title="Current & Upcoming"
        rows={active}
        onRemove={handleRemove}
        pending={pending}
        removable
      />
      {past.length > 0 && (
        <BlockList title="Past" rows={past} onRemove={handleRemove} pending={pending} />
      )}
    </div>
  );
}

function BlockList({
  title,
  rows,
  onRemove,
  pending,
  removable,
}: {
  title: string;
  rows: AvailabilityRow[];
  onRemove: (id: string) => void;
  pending: boolean;
  removable?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
        <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <ul className="divide-y divide-surface-100">
        {rows.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
              {initials(b.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-surface-900 truncate">{b.name}</p>
              <p className="text-xs text-surface-400">
                {blockTypeLabel(b.blockType)}
                {b.reason ? ` · ${b.reason}` : ""}
              </p>
            </div>
            <span className="text-sm text-surface-500 whitespace-nowrap">
              {formatRange(b.startAt, b.endAt)}
            </span>
            {removable && (
              <button
                type="button"
                onClick={() => onRemove(b.id)}
                disabled={pending}
                aria-label="Remove block"
                className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <form action={onSubmit} className="p-5 space-y-4">
          {memberOptions.length > 0 && (
            <div>
              <label className={labelCls} htmlFor="user_id">
                Team Member
              </label>
              <select id="user_id" name="user_id" className={inputCls} defaultValue="">
                <option value="">Me</option>
                {memberOptions.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="start_date">
                Start Date
              </label>
              <input id="start_date" name="start_date" type="date" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="end_date">
                End Date
              </label>
              <input id="end_date" name="end_date" type="date" required className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="block_type">
              Type
            </label>
            <select id="block_type" name="block_type" className={inputCls} defaultValue="holiday">
              {BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BLOCK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="reason">
              Reason (optional)
            </label>
            <input
              id="reason"
              name="reason"
              type="text"
              placeholder="e.g. Annual leave"
              className={inputCls}
            />
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save Block"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
