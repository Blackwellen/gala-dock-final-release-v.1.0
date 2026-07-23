import Link from "next/link";
import {
  Plus,
  Wallet,
  Building2,
  Wine,
  ShieldCheck,
  CheckCircle2,
  Ticket,
  AlertTriangle,
  MoreHorizontal,
  Search,
  CalendarClock,
  TrendingUp,
  AlertCircle,
  Percent,
  Gauge,
  Banknote,
  ListChecks,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, FINANCE_TABS } from "@/components/ui/SectionTabs";
import {
  ChartCard,
  InsightsRail,
  InsightCard,
  ProgressBar,
  StackedBarChart,
  GroupedBarChart,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { EventDeposit } from "@/lib/supabase/types";
import { formatCentsCompact, daysUntil, dueLabel, FINANCE_CHART_COLORS as C } from "../_lib/finance";

export const metadata = { title: "Finance — Deposits" };
export const dynamic = "force-dynamic";

type DepositRow = Pick<
  EventDeposit,
  | "id"
  | "event_id"
  | "client_id"
  | "kind"
  | "label"
  | "amount_cents"
  | "paid_cents"
  | "currency"
  | "due_date"
  | "refundable"
  | "status"
  | "paid_at"
  | "owner_id"
  | "created_at"
>;

const KIND_LABELS: Record<string, string> = {
  client_deposit: "Client Deposit",
  venue_hire: "Venue Retainer",
  bar: "Bar Deposit",
  security: "Security Hold",
  final_balance: "Final Balance Milestone",
  ticketing_reserve: "Ticketing Reserve",
  damage: "Damage Deposit",
  other: "Other Deposit",
};

const KIND_ICONS: Record<string, typeof Wallet> = {
  client_deposit: Wallet,
  venue_hire: Building2,
  bar: Wine,
  security: ShieldCheck,
  final_balance: CheckCircle2,
  ticketing_reserve: Ticket,
  damage: AlertTriangle,
  other: MoreHorizontal,
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

/** Deposit badge statuses supported by `StatusBadge` for this tab. */
type DepositEffectiveStatus = "pending" | "due-soon" | "part-paid" | "paid" | "overdue" | "refunded" | "forfeited";

/** Raw `status` overlaid with a computed due-date state, matching the badge
 * language used across every other Finance tab (green=paid, amber=due
 * soon/part-paid, red=overdue, purple=draft/neutral). */
function effectiveBadgeStatus(
  d: Pick<DepositRow, "status" | "due_date" | "amount_cents" | "paid_cents">
): DepositEffectiveStatus {
  if (d.status === "paid") return "paid";
  if (d.status === "refunded") return "refunded";
  if (d.status === "withheld") return "forfeited";
  const balance = d.amount_cents - d.paid_cents;
  if (balance <= 0) return "paid";
  const days = daysUntil(d.due_date);
  if (days !== null && days < 0) return "overdue";
  if (d.status === "partial") return "part-paid";
  if (days !== null && days <= 30) return "due-soon";
  return "pending";
}

interface FilterParams {
  q?: string;
  event?: string;
  kind?: string;
  status?: string;
  owner?: string;
  from?: string;
  to?: string;
}

export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const { workspaceId } = await requireWorkspace();
  const filters = await searchParams;
  const supabase = await createClient();

  const [{ data: depositData }, { data: eventsData }, { data: clientsData }, { data: memberData }] =
    await Promise.all([
      supabase
        .from("event_deposits")
        .select(
          "id, event_id, client_id, kind, label, amount_cents, paid_cents, currency, due_date, refundable, status, paid_at, owner_id, created_at"
        )
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
      supabase.from("clients").select("id, name").eq("workspace_id", workspaceId).is("deleted_at", null),
      supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).is("deleted_at", null),
    ]);

  const allDeposits = (depositData ?? []) as DepositRow[];
  const eventNames = new Map((eventsData ?? []).map((e) => [e.id, e.name as string]));
  const clientNames = new Map((clientsData ?? []).map((c) => [c.id, c.name as string]));

  const memberIds = (memberData ?? []).map((m) => m.user_id);
  const ownerNameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    for (const p of profiles ?? []) {
      if (p.display_name) ownerNameById.set(p.user_id, p.display_name);
    }
  }

  // ── Apply filters (server-rendered, GET-driven — no client JS required) ──
  const q = (filters.q ?? "").trim().toLowerCase();
  const deposits = allDeposits.filter((d) => {
    if (filters.event && d.event_id !== filters.event) return false;
    if (filters.kind && d.kind !== filters.kind) return false;
    if (filters.owner && d.owner_id !== filters.owner) return false;
    if (filters.status) {
      const eff = effectiveBadgeStatus(d);
      if (eff !== filters.status) return false;
    }
    if (filters.from && (!d.due_date || d.due_date < filters.from)) return false;
    if (filters.to && (!d.due_date || d.due_date > filters.to)) return false;
    if (q) {
      const haystack = `${d.label} ${eventNames.get(d.event_id) ?? ""} ${clientNames.get(d.client_id ?? "") ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const hasActiveFilters = Boolean(
    filters.q || filters.event || filters.kind || filters.status || filters.owner || filters.from || filters.to
  );

  // ── KPIs (computed from the filtered set, per Finance-tab convention) ────
  const totalDepositValue = deposits.reduce((s, d) => s + d.amount_cents, 0);
  const paidDeposits = deposits.reduce((s, d) => s + d.paid_cents, 0);
  const OPEN_STATUSES = new Set(["pending", "partial"]);
  const dueSoonValue = deposits
    .filter((d) => OPEN_STATUSES.has(d.status))
    .filter((d) => {
      const days = daysUntil(d.due_date);
      return days !== null && days >= 0 && days <= 30;
    })
    .reduce((s, d) => s + (d.amount_cents - d.paid_cents), 0);
  const overdueValue = deposits
    .filter((d) => OPEN_STATUSES.has(d.status))
    .filter((d) => {
      const days = daysUntil(d.due_date);
      return days !== null && days < 0;
    })
    .reduce((s, d) => s + (d.amount_cents - d.paid_cents), 0);
  const depositCoveragePct = totalDepositValue > 0 ? (paidDeposits / totalDepositValue) * 100 : 0;
  const completionRatios = deposits.filter((d) => d.amount_cents > 0).map((d) => (d.paid_cents / d.amount_cents) * 100);
  const avgCompletionPct =
    completionRatios.length > 0 ? completionRatios.reduce((s, v) => s + v, 0) / completionRatios.length : 0;

  // ── Right rail ────────────────────────────────────────────────────────
  const upcomingDue = deposits
    .filter((d) => OPEN_STATUSES.has(d.status) && d.due_date)
    .filter((d) => {
      const days = daysUntil(d.due_date);
      return days !== null && days >= 0 && days <= 30;
    })
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 6);

  const totalOutstanding = deposits.reduce((s, d) => s + Math.max(0, d.amount_cents - d.paid_cents), 0);
  const overdueExposurePct = totalOutstanding > 0 ? (overdueValue / totalOutstanding) * 100 : 0;

  const largestBalances = deposits
    .map((d) => ({ ...d, balance: d.amount_cents - d.paid_cents }))
    .filter((d) => d.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  // Deposit Completion by Month — weighted paid/required ratio for deposits
  // that received a payment (paid_at) within each of the last 6 months.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }) };
  });
  const completionByMonth = months.map((m) => {
    const inMonth = deposits.filter((d) => {
      if (!d.paid_at) return false;
      const dt = new Date(d.paid_at);
      return `${dt.getFullYear()}-${dt.getMonth()}` === m.key;
    });
    const required = inMonth.reduce((s, d) => s + d.amount_cents, 0);
    const paid = inMonth.reduce((s, d) => s + d.paid_cents, 0);
    return { label: m.label, pct: required > 0 ? Math.round((paid / required) * 100) : 0 };
  });

  // ── Row 2: Deposit Milestones by Event (stacked: Paid / Due Soon / Overdue / Scheduled) ──
  const eventBuckets = new Map<string, { paid: number; dueSoon: number; overdue: number; scheduled: number }>();
  for (const d of deposits) {
    const bucket = eventBuckets.get(d.event_id) ?? { paid: 0, dueSoon: 0, overdue: 0, scheduled: 0 };
    bucket.paid += d.paid_cents;
    const balance = d.amount_cents - d.paid_cents;
    if (balance > 0 && OPEN_STATUSES.has(d.status)) {
      const days = daysUntil(d.due_date);
      if (days !== null && days < 0) bucket.overdue += balance;
      else if (days !== null && days <= 30) bucket.dueSoon += balance;
      else bucket.scheduled += balance;
    }
    eventBuckets.set(d.event_id, bucket);
  }
  const milestonesByEvent = [...eventBuckets.entries()]
    .map(([eventId, b]) => ({
      label: eventNames.get(eventId) ?? "Unknown event",
      segments: [
        { key: "paid", label: "Paid", value: b.paid / 100, color: C.success },
        { key: "dueSoon", label: "Due Soon", value: b.dueSoon / 100, color: C.warning },
        { key: "overdue", label: "Overdue", value: b.overdue / 100, color: C.danger },
        { key: "scheduled", label: "Scheduled", value: b.scheduled / 100, color: C.slate },
      ],
    }))
    .filter((r) => r.segments.some((s) => s.value > 0))
    .sort((a, b) => b.segments.reduce((s, seg) => s + seg.value, 0) - a.segments.reduce((s, seg) => s + seg.value, 0))
    .slice(0, 8);

  // Deposit Schedule — a real, working chronological list. A full Gantt-style
  // timeline visual is out of scope for this pass; a sorted schedule list
  // gives the same "what's due when" answer without faking a timeline widget.
  const scheduleRows = deposits
    .filter((d) => d.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 12);

  // ── Filter option lists ──────────────────────────────────────────────
  const kindOptions = [...new Set(allDeposits.map((d) => d.kind))].sort();
  const eventOptions = [...new Set(allDeposits.map((d) => d.event_id))]
    .map((id) => ({ id, name: eventNames.get(id) ?? "Unknown event" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownerOptions = [...new Set(allDeposits.map((d) => d.owner_id).filter((v): v is string => !!v))]
    .map((id) => ({ id, name: ownerNameById.get(id) ?? "Unassigned" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const statusOptions: { value: DepositEffectiveStatus; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "due-soon", label: "Due Soon" },
    { value: "part-paid", label: "Part Paid" },
    { value: "paid", label: "Paid" },
    { value: "overdue", label: "Overdue" },
    { value: "refunded", label: "Refunded" },
    { value: "forfeited", label: "Forfeited" },
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Deposits"
        description="Manage client deposits, retainers, venue holds and bar deposits"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/finance/deposits/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Deposit
            </Link>
            <span
              title="Bulk milestone-plan templates (e.g. auto-schedule a deposit + interim + final balance) aren't built yet — create deposits individually for now."
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-surface-50 text-surface-400 text-sm font-medium cursor-not-allowed"
              aria-disabled="true"
            >
              <ListChecks className="w-4 h-4" />
              Set Milestone Plan
            </span>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Deposit Value" value={formatCentsCompact(totalDepositValue)} icon={Banknote} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Paid Deposits" value={formatCentsCompact(paidDeposits)} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Due Soon (30d)" value={formatCentsCompact(dueSoonValue)} icon={CalendarClock} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Overdue Deposits" value={formatCentsCompact(overdueValue)} icon={AlertCircle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Deposit Coverage" value={`${depositCoveragePct.toFixed(1)}%`} icon={Gauge} iconColor="text-violet-600" iconBg="bg-violet-50" />
          <MetricCard label="Avg Completion" value={`${avgCompletionPct.toFixed(1)}%`} icon={Percent} iconColor="text-info-600" iconBg="bg-info-50" />
        </KPIGrid>

        {/* Toolbar — real, GET-driven filters (no fake dropdowns) */}
        <form method="get" className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Search</label>
            <div className="relative">
              <Search className="w-4 h-4 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Deposit, event or client…"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Event</label>
            <select name="event" defaultValue={filters.event ?? ""} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
              <option value="">All events</option>
              {eventOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Deposit Type</label>
            <select name="kind" defaultValue={filters.kind ?? ""} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
              <option value="">All types</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>{kindLabel(k)}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Status</label>
            <select name="status" defaultValue={filters.status ?? ""} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
              <option value="">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Owner</label>
            <select name="owner" defaultValue={filters.owner ?? ""} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
              <option value="">All owners</option>
              {ownerOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Due From</label>
            <input type="date" name="from" defaultValue={filters.from ?? ""} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Due To</label>
            <input type="date" name="to" defaultValue={filters.to ?? ""} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              Apply
            </button>
            {hasActiveFilters && (
              <Link href="/event-manager/finance/deposits" className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-600 text-sm font-medium hover:bg-surface-50 transition-colors">
                Clear
              </Link>
            )}
          </div>
        </form>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200 gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-surface-900">Deposit Milestones</h2>
                <span className="text-xs text-surface-400">
                  {deposits.length} {deposits.length === 1 ? "deposit" : "deposits"}
                </span>
              </div>

              {deposits.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title={hasActiveFilters ? "No deposits match these filters" : "No deposits yet"}
                  description={
                    hasActiveFilters
                      ? "Try clearing filters or widening the date range."
                      : "Create your first deposit milestone to start tracking client retainers and balance schedules."
                  }
                  action={
                    hasActiveFilters ? (
                      <Link href="/event-manager/finance/deposits" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
                        Clear filters
                      </Link>
                    ) : (
                      <Link href="/event-manager/finance/deposits/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                        <Plus className="w-4 h-4" />
                        New Deposit
                      </Link>
                    )
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Deposit ID</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event / Client</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Total Required</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Paid</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Balance</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Next Due Date</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider min-w-[120px]">Progress</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {deposits.map((d) => {
                        const Icon = KIND_ICONS[d.kind] ?? MoreHorizontal;
                        const balance = d.amount_cents - d.paid_cents;
                        const pct = d.amount_cents > 0 ? Math.round((d.paid_cents / d.amount_cents) * 100) : 0;
                        const clientLabel = d.client_id ? clientNames.get(d.client_id) : undefined;
                        return (
                          <tr key={d.id} className="hover:bg-surface-50 transition-colors">
                            <td className="px-6 py-3 font-mono text-xs text-surface-500">DEP-{d.id.replace(/-/g, "").slice(-6).toUpperCase()}</td>
                            <td className="px-6 py-3">
                              <span className="font-medium text-surface-900">{eventNames.get(d.event_id) ?? "Unknown event"}</span>
                              {clientLabel && <span className="block text-xs text-surface-400">{clientLabel}</span>}
                            </td>
                            <td className="px-6 py-3">
                              <span className="inline-flex items-center gap-1.5 text-surface-700">
                                <Icon className="w-3.5 h-3.5 text-surface-400" />
                                {kindLabel(d.kind)}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">
                              {formatCurrency(d.amount_cents / 100, d.currency)}
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums text-surface-700">
                              {formatCurrency(d.paid_cents / 100, d.currency)}
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums text-surface-600">
                              {formatCurrency(balance / 100, d.currency)}
                            </td>
                            <td className="px-6 py-3 text-surface-500">
                              {d.due_date ? (
                                <>
                                  {formatDate(d.due_date)}
                                  <span className="block text-xs text-surface-400">{dueLabel(d.due_date)}</span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-6 py-3">
                              <StatusBadge status={effectiveBadgeStatus(d)} />
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                <ProgressBar pct={pct} color={pct >= 100 ? "bg-success-500" : "bg-brand-500"} className="w-20" />
                                <span className="text-xs font-semibold text-surface-700 tabular-nums w-9 text-right">{pct}%</span>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-right">
                              {balance > 0 ? (
                                <Link
                                  href={`/event-manager/finance/deposits/${d.id}/pay`}
                                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                                >
                                  Record Payment
                                </Link>
                              ) : (
                                <span className="text-xs text-surface-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Deposit Milestones by Event">
                {milestonesByEvent.length === 0 ? (
                  <p className="text-xs text-surface-400">No deposits scheduled against any event yet.</p>
                ) : (
                  <>
                    <StackedBarChart groups={milestonesByEvent} orientation="horizontal" formatValue={(v) => formatCurrency(v)} />
                    <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-surface-500">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.success }} />Paid</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.warning }} />Due Soon</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.danger }} />Overdue</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.slate }} />Scheduled</span>
                    </div>
                  </>
                )}
              </ChartCard>

              <ChartCard title="Deposit Schedule">
                {scheduleRows.length === 0 ? (
                  <p className="text-xs text-surface-400">No upcoming or past due dates to schedule.</p>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-surface-400 uppercase tracking-wider">
                          <th className="text-left py-1.5 px-1">Due</th>
                          <th className="text-left py-1.5 px-1">Event</th>
                          <th className="text-left py-1.5 px-1">Milestone</th>
                          <th className="text-right py-1.5 px-1">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-100">
                        {scheduleRows.map((d) => (
                          <tr key={d.id}>
                            <td className="py-1.5 px-1 whitespace-nowrap text-surface-600">{formatDate(d.due_date!)}</td>
                            <td className="py-1.5 px-1 truncate max-w-[100px] text-surface-700">{eventNames.get(d.event_id) ?? "—"}</td>
                            <td className="py-1.5 px-1 truncate max-w-[120px] text-surface-500">{d.label || kindLabel(d.kind)}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums font-medium text-surface-900">
                              {formatCurrency((d.amount_cents - d.paid_cents) / 100, d.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
            </div>

            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Upcoming Due Deposits">
              <ul className="space-y-2.5">
                {upcomingDue.length === 0 ? (
                  <li className="text-xs text-surface-400">Nothing due in the next 30 days.</li>
                ) : (
                  upcomingDue.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="truncate text-surface-600">{eventNames.get(d.event_id) ?? "Event"}</span>
                      <span className="font-semibold text-warning-600 shrink-0">{dueLabel(d.due_date)}</span>
                    </li>
                  ))
                )}
              </ul>
            </InsightCard>

            <InsightCard title="Overdue Exposure">
              <p className="text-2xl font-bold text-danger-600 tabular-nums">{formatCentsCompact(overdueValue)}</p>
              <p className="text-xs text-surface-400 mt-0.5 mb-3">{overdueExposurePct.toFixed(1)}% of outstanding balances</p>
              <ProgressBar pct={overdueExposurePct} color="bg-danger-500" />
            </InsightCard>

            <InsightCard title="Largest Deposit Balances">
              <ul className="space-y-2.5">
                {largestBalances.length === 0 ? (
                  <li className="text-xs text-surface-400">No open balances.</li>
                ) : (
                  largestBalances.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="truncate text-surface-600">{eventNames.get(d.event_id) ?? "Event"}</span>
                      <span className="font-semibold text-surface-800 tabular-nums shrink-0">
                        {formatCurrency(d.balance / 100, d.currency)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </InsightCard>

            <InsightCard title="Deposit Completion by Month">
              <GroupedBarChart
                groups={completionByMonth.map((m) => ({ label: m.label, bars: [{ key: "pct", value: m.pct, color: C.brand }] }))}
                height={140}
                formatValue={(v) => `${v.toFixed(0)}%`}
              />
            </InsightCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
