"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  XCircle,
  CalendarPlus,
  Phone,
  Mail,
  StickyNote,
  Clock,
  GitBranch,
  X,
  Check,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/supabase/types";
import {
  LEAD_STAGES,
  LEAD_SOURCES,
  EVENT_TYPES,
  STAGE_LABELS,
  SOURCE_LABELS,
  formatBudget,
  formatEventDate,
  sourceLabel,
  type LeadStage,
} from "../lib";
import {
  updateLeadStage,
  updateLead,
  deleteLead,
  addLeadNote,
  logLeadInteraction,
  markLeadOutcome,
  convertLeadToEvent,
} from "../actions";

export interface MemberOption {
  id: string;
  name: string;
}

export interface ActivityRow {
  id: string;
  action: string;
  detail: string | null;
  actorName: string;
  createdAt: string;
}

export interface LinkedEvent {
  id: string;
  name: string;
  status: string;
}

function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const ACTIVITY_ICONS: Record<string, typeof Clock> = {
  "Stage changed": GitBranch,
  "Note added": StickyNote,
  "Call logged": Phone,
  "Email logged": Mail,
  "Lead created": CalendarPlus,
  "Lead converted": CheckCircle2,
  "Marked as Won": CheckCircle2,
  "Marked as Lost": XCircle,
};

export function LeadDetailClient({
  lead,
  assignedName,
  activities,
  teamMembers,
  linkedEvent,
}: {
  lead: Lead;
  assignedName: string | null;
  activities: ActivityRow[];
  teamMembers: MemberOption[];
  linkedEvent: LinkedEvent | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"overview" | "activity">("overview");
  const [editing, setEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [logKind, setLogKind] = useState<"call" | "email" | "note" | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const stage = lead.stage as LeadStage;
  const isWon = stage === "won";
  const isLost = stage === "lost";
  const isConverted = !!lead.converted_event_id;

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const currentIndex = LEAD_STAGES.indexOf(stage);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-6 pt-5 pb-4">
        <Link
          href="/event-manager/leads"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-800 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
          Back to Leads
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-surface-900 tracking-tight">
                {lead.title}
              </h1>
              <StatusBadge status={stage} />
            </div>
            <p className="mt-1 text-sm text-surface-500">{lead.client_name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isWon && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"
              >
                <Pencil className="w-4 h-4" strokeWidth={1.8} />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((s) => !s)}
                className="p-2 rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50 transition-colors"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
              </button>
              {showMenu && (
                <div
                  className="absolute right-0 mt-1 w-44 bg-white border border-surface-200 rounded-lg shadow-lg py-1 z-20"
                  onMouseLeave={() => setShowMenu(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      if (confirm("Delete this lead? This cannot be undone.")) {
                        run(() => deleteLead(lead.id));
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                    Delete Lead
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stage progress bar */}
        <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1">
          {LEAD_STAGES.map((s, i) => {
            const reached = i <= currentIndex && !isLost;
            const isCurrent = s === stage;
            return (
              <button
                key={s}
                type="button"
                disabled={isWon || isLost || pending || s === stage}
                onClick={() => {
                  if (confirm(`Move to ${STAGE_LABELS[s]}?`)) {
                    run(() => updateLeadStage(lead.id, s));
                  }
                }}
                className={cn(
                  "flex-1 min-w-[110px] px-3 py-2 rounded-lg text-xs font-medium text-center transition-colors border",
                  isCurrent
                    ? "bg-brand-600 text-white border-brand-600"
                    : reached
                    ? "bg-brand-50 text-brand-700 border-brand-200"
                    : "bg-surface-50 text-surface-500 border-surface-200",
                  !(isWon || isLost) && s !== stage && "hover:border-brand-400 cursor-pointer"
                )}
              >
                {STAGE_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 max-w-[1400px]">
        {error && (
          <div className="mb-4 p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">
            {error}
          </div>
        )}

        {isConverted && (
          <div className="mb-6 p-4 bg-success-50 border border-success-200 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success-600 shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-success-800">
                This lead has been won and converted to an event.
              </p>
              {linkedEvent && (
                <Link
                  href={`/event-manager/events/${linkedEvent.id}`}
                  className="text-sm text-success-700 underline hover:text-success-800"
                >
                  View event: {linkedEvent.name}
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="flex gap-0 border-b border-surface-200">
              {(["overview", "activity"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "px-4 py-3 text-sm font-medium border-b-2 transition-all capitalize",
                    tab === t
                      ? "text-brand-600 border-brand-600"
                      : "text-surface-500 border-transparent hover:text-surface-800"
                  )}
                >
                  {t}
                  {t === "activity" && activities.length > 0 && (
                    <span className="ml-2 text-xs text-surface-400">
                      {activities.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "overview" ? (
              editing ? (
                <EditForm
                  lead={lead}
                  teamMembers={teamMembers}
                  pending={pending}
                  onCancel={() => setEditing(false)}
                  onSave={(fd) => {
                    run(async () => {
                      await updateLead(lead.id, fd);
                      setEditing(false);
                    });
                  }}
                />
              ) : (
                <OverviewCards
                  lead={lead}
                  assignedName={assignedName}
                  isWon={isWon}
                  isConverted={isConverted}
                  pending={pending}
                  onConvert={() => setShowConvert(true)}
                  onWin={() => run(() => markLeadOutcome(lead.id, "won"))}
                  onLost={() => setShowLost(true)}
                />
              )
            ) : (
              <ActivityTab
                activities={activities}
                pending={pending}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                onAddNote={() =>
                  run(async () => {
                    await addLeadNote(lead.id, noteDraft);
                    setNoteDraft("");
                  })
                }
              />
            )}
          </div>

          {/* Right rail */}
          <div className="space-y-4">
            {linkedEvent && (
              <RailCard title="Linked Event">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">
                      {linkedEvent.name}
                    </p>
                    <div className="mt-1">
                      <StatusBadge status={linkedEvent.status as never} />
                    </div>
                  </div>
                </div>
                <Link
                  href={`/event-manager/events/${linkedEvent.id}`}
                  className="mt-3 block text-center text-sm font-semibold text-brand-600 border border-brand-200 rounded-lg py-2 hover:bg-brand-50 transition-colors"
                >
                  View Event
                </Link>
              </RailCard>
            )}

            <RailCard title="Quick Log">
              <div className="grid grid-cols-3 gap-2">
                <RailLogBtn
                  icon={Phone}
                  label="Call"
                  onClick={() => setLogKind("call")}
                />
                <RailLogBtn
                  icon={Mail}
                  label="Email"
                  onClick={() => setLogKind("email")}
                />
                <RailLogBtn
                  icon={StickyNote}
                  label="Note"
                  onClick={() => setLogKind("note")}
                />
              </div>
            </RailCard>

            <RailCard title="Details">
              <dl className="space-y-2.5 text-sm">
                <RailRow label="Source" value={sourceLabel(lead.source)} />
                <RailRow label="Assigned" value={assignedName ?? "Unassigned"} />
                <RailRow
                  label="Created"
                  value={formatEventDate(lead.created_at)}
                />
                {lead.lost_reason && (
                  <RailRow label="Lost reason" value={lead.lost_reason} />
                )}
              </dl>
            </RailCard>
          </div>
        </div>
      </div>

      {/* Convert modal */}
      {showConvert && (
        <ConvertModal
          lead={lead}
          pending={pending}
          onClose={() => setShowConvert(false)}
          onConfirm={(fd) => run(() => convertLeadToEvent(lead.id, fd))}
        />
      )}

      {/* Lost modal */}
      {showLost && (
        <LostModal
          pending={pending}
          onClose={() => setShowLost(false)}
          onConfirm={(reason) =>
            run(async () => {
              await markLeadOutcome(lead.id, "lost", reason);
              setShowLost(false);
            })
          }
        />
      )}

      {/* Quick log modal */}
      {logKind && (
        <LogModal
          kind={logKind}
          pending={pending}
          onClose={() => setLogKind(null)}
          onConfirm={(detail) =>
            run(async () => {
              await logLeadInteraction(lead.id, logKind, detail);
              setLogKind(null);
            })
          }
        />
      )}
    </div>
  );
}

/* ---------- Overview ---------- */

function OverviewCards({
  lead,
  assignedName,
  isWon,
  isConverted,
  pending,
  onConvert,
  onWin,
  onLost,
}: {
  lead: Lead;
  assignedName: string | null;
  isWon: boolean;
  isConverted: boolean;
  pending: boolean;
  onConvert: () => void;
  onWin: () => void;
  onLost: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
        <h3 className="text-sm font-semibold text-surface-900 mb-4">
          Lead Information
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Info label="Client Name" value={lead.client_name} />
          <Info label="Company" value={lead.company_name} />
          <Info label="Email" value={lead.client_email} />
          <Info label="Phone" value={lead.client_phone} />
          <Info label="Event Type" value={lead.event_type} />
          <Info label="Event Date" value={formatEventDate(lead.event_date)} />
          <Info label="Location" value={lead.event_location} />
          <Info
            label="Guest Estimate"
            value={
              lead.guest_count_estimate !== null
                ? String(lead.guest_count_estimate)
                : null
            }
          />
          <Info label="Source" value={sourceLabel(lead.source)} />
          <Info label="Assigned To" value={assignedName} />
        </dl>
        {lead.notes && (
          <div className="mt-5 pt-4 border-t border-surface-100">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">
              Notes
            </p>
            <p className="text-sm text-surface-700 whitespace-pre-wrap">
              {lead.notes}
            </p>
          </div>
        )}
      </div>

      {/* Budget card */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
        <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">
          Budget Estimate
        </p>
        <p className="mt-1 text-3xl font-bold text-surface-900 tabular-nums">
          {formatBudget(lead.budget_estimate_cents)}
        </p>
      </div>

      {/* Quick actions */}
      {!isWon && (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">
            Quick Actions
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConvert}
              disabled={pending || isConverted}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
            >
              <CalendarPlus className="w-4 h-4" strokeWidth={2} />
              Convert to Event
            </button>
            <button
              type="button"
              onClick={onWin}
              disabled={pending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-success-700 border border-success-200 rounded-lg hover:bg-success-50 transition-colors disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.8} />
              Mark Won
            </button>
            <button
              type="button"
              onClick={onLost}
              disabled={pending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-60"
            >
              <XCircle className="w-4 h-4" strokeWidth={1.8} />
              Mark Lost
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-surface-400">{label}</dt>
      <dd className="text-sm text-surface-900 mt-0.5">
        {value ? value : <span className="text-surface-300">—</span>}
      </dd>
    </div>
  );
}

/* ---------- Edit form ---------- */

function EditForm({
  lead,
  teamMembers,
  pending,
  onCancel,
  onSave,
}: {
  lead: Lead;
  teamMembers: MemberOption[];
  pending: boolean;
  onCancel: () => void;
  onSave: (fd: FormData) => void;
}) {
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave(new FormData(e.currentTarget));
  }
  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4"
    >
      <h3 className="text-sm font-semibold text-surface-900">Edit Lead</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EditField label="Lead Title" required>
          <input name="title" defaultValue={lead.title} required className={inputCls} />
        </EditField>
        <EditField label="Client Name" required>
          <input
            name="client_name"
            defaultValue={lead.client_name}
            required
            className={inputCls}
          />
        </EditField>
        <EditField label="Client Email">
          <input
            name="client_email"
            type="email"
            defaultValue={lead.client_email ?? ""}
            className={inputCls}
          />
        </EditField>
        <EditField label="Client Phone">
          <input
            name="client_phone"
            type="tel"
            defaultValue={lead.client_phone ?? ""}
            className={inputCls}
          />
        </EditField>
        <EditField label="Company">
          <input
            name="company_name"
            defaultValue={lead.company_name ?? ""}
            className={inputCls}
          />
        </EditField>
        <EditField label="Event Type">
          <select
            name="event_type"
            defaultValue={lead.event_type ?? ""}
            className={inputCls}
          >
            <option value="">Select type…</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </EditField>
        <EditField label="Event Date">
          <input
            name="event_date"
            type="date"
            defaultValue={lead.event_date ?? ""}
            className={inputCls}
          />
        </EditField>
        <EditField label="Location">
          <input
            name="event_location"
            defaultValue={lead.event_location ?? ""}
            className={inputCls}
          />
        </EditField>
        <EditField label="Guest Estimate">
          <input
            name="guest_count_estimate"
            type="number"
            min={0}
            defaultValue={lead.guest_count_estimate ?? ""}
            className={inputCls}
          />
        </EditField>
        <EditField label="Budget (£ GBP)">
          <input
            name="budget_estimate"
            type="number"
            min={0}
            defaultValue={
              lead.budget_estimate_cents !== null
                ? lead.budget_estimate_cents / 100
                : ""
            }
            className={inputCls}
          />
        </EditField>
        <EditField label="Source">
          <select name="source" defaultValue={lead.source ?? ""} className={inputCls}>
            <option value="">Select source…</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </EditField>
        <EditField label="Assigned To">
          <select
            name="assigned_to"
            defaultValue={lead.assigned_to ?? ""}
            className={inputCls}
          >
            <option value="">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </EditField>
      </div>
      <EditField label="Notes">
        <textarea
          name="notes"
          rows={3}
          defaultValue={lead.notes ?? ""}
          className={inputCls + " resize-none"}
        />
      </EditField>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function EditField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">
        {label}
        {required && <span className="text-danger-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ---------- Activity ---------- */

function ActivityTab({
  activities,
  pending,
  noteDraft,
  setNoteDraft,
  onAddNote,
}: {
  activities: ActivityRow[];
  pending: boolean;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  onAddNote: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
        <div className="flex items-start gap-2">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            placeholder="Add a note to the timeline…"
            className={inputCls + " resize-none"}
          />
          <button
            type="button"
            onClick={onAddNote}
            disabled={pending || !noteDraft.trim()}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 shrink-0"
          >
            Add Note
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
        {activities.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No activity yet"
            description="Stage changes, notes and logged calls will appear here."
            compact
          />
        ) : (
          <ol className="space-y-4">
            {activities.map((a, i) => {
              const Icon = ACTIVITY_ICONS[a.action] ?? Clock;
              return (
                <li key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
                    </div>
                    {i < activities.length - 1 && (
                      <div className="w-px flex-1 bg-surface-200 mt-1" />
                    )}
                  </div>
                  <div className="pb-2 min-w-0">
                    <p className="text-sm font-medium text-surface-900">
                      {a.action}
                    </p>
                    {a.detail && (
                      <p className="text-sm text-surface-600 mt-0.5">{a.detail}</p>
                    )}
                    <p className="text-xs text-surface-400 mt-1">
                      {a.actorName} · {fmtDateTime(a.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

/* ---------- Right rail helpers ---------- */

function RailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
      <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-surface-400">{label}</dt>
      <dd className="text-surface-800 text-right">{value}</dd>
    </div>
  );
}

function RailLogBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 hover:border-surface-300 transition-colors"
    >
      <Icon className="w-4 h-4" strokeWidth={1.8} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

/* ---------- Modals ---------- */

function ModalShell({
  title,
  icon: Icon,
  onClose,
  children,
}: {
  title: string;
  icon: typeof CalendarPlus;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.8} />
            </div>
            <h2 className="text-sm font-semibold text-surface-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConvertModal({
  lead,
  pending,
  onClose,
  onConfirm,
}: {
  lead: Lead;
  pending: boolean;
  onClose: () => void;
  onConfirm: (fd: FormData) => void;
}) {
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onConfirm(new FormData(e.currentTarget));
  }
  return (
    <ModalShell title="Convert to Event" icon={CalendarPlus} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <p className="text-sm text-surface-500">
          This creates a confirmed event from the lead, marks it won and links the
          two records.
        </p>
        <EditField label="Event Title" required>
          <input name="event_name" defaultValue={lead.title} required className={inputCls} />
        </EditField>
        <EditField label="Client Name" required>
          <input
            name="client_name"
            defaultValue={lead.client_name}
            required
            className={inputCls}
          />
        </EditField>
        <div className="grid grid-cols-2 gap-3">
          <EditField label="Event Date">
            <input
              name="event_date"
              type="date"
              defaultValue={lead.event_date ?? ""}
              className={inputCls}
            />
          </EditField>
          <EditField label="Event Type">
            <select
              name="event_type"
              defaultValue={lead.event_type ?? ""}
              className={inputCls}
            >
              <option value="">Select type…</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </EditField>
        </div>
        <EditField label="Venue / Location">
          <input
            name="event_location"
            defaultValue={lead.event_location ?? ""}
            className={inputCls}
          />
        </EditField>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            <Check className="w-4 h-4" strokeWidth={2.5} />
            {pending ? "Converting…" : "Create Event"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function LostModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell title="Mark as Lost" icon={XCircle} onClose={onClose}>
      <div className="p-5 space-y-4">
        <EditField label="Reason (optional)">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Went with another planner, budget too low…"
            className={inputCls + " resize-none"}
          />
        </EditField>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={pending}
            className="px-5 py-2 text-sm font-semibold text-white bg-surface-700 rounded-lg hover:bg-surface-800 transition-colors disabled:opacity-60"
          >
            {pending ? "Saving…" : "Mark Lost"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function LogModal({
  kind,
  pending,
  onClose,
  onConfirm,
}: {
  kind: "call" | "email" | "note";
  pending: boolean;
  onClose: () => void;
  onConfirm: (detail: string) => void;
}) {
  const [detail, setDetail] = useState("");
  const titles = {
    call: "Log Call",
    email: "Log Email",
    note: "Log Note",
  };
  const icons = { call: Phone, email: Mail, note: StickyNote };
  return (
    <ModalShell title={titles[kind]} icon={icons[kind]} onClose={onClose}>
      <div className="p-5 space-y-4">
        <EditField label="Details">
          <textarea
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={
              kind === "call"
                ? "What was discussed on the call?"
                : kind === "email"
                ? "Subject / summary of the email"
                : "Note details"
            }
            className={inputCls + " resize-none"}
          />
        </EditField>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(detail)}
            disabled={pending}
            className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save Log"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
