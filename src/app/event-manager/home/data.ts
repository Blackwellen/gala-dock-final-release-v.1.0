import { createClient } from "@/lib/supabase/server";
import { r2PublicUrl } from "@/lib/storage/r2";
import { RANGE_OPTIONS, type DashboardRange } from "./range-options";
import { exactCurrency, compactCurrency } from "./format";

export { RANGE_OPTIONS, type DashboardRange };

/**
 * Home dashboard data layer. A handful of parallel, workspace-scoped Supabase
 * queries (no N+1 per-row fetching) feed every panel on the Event Manager home
 * route. Trend/sparkline figures are derived from real row timestamps — there is
 * no dedicated dashboard RPC or event-status-history table yet, so "vs previous
 * period" compares the same metric computed over two adjacent time windows of
 * the row's own created/issued date rather than a point-in-time snapshot.
 */

const ACTIVE_EVENT_STATUSES_EXCLUDED = "(completed,cancelled)";
const OPEN_TASK_STATUSES_EXCLUDED = "(done,cancelled)";
const CLOSED_INVOICE_STATUSES_EXCLUDED = "(paid,void)";

const STAGE_ORDER = [
  "new_enquiry",
  "briefing",
  "quoting",
  "awaiting_approval",
  "confirmed",
  "in_delivery",
] as const;

const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  new_enquiry: "New Enquiry",
  briefing: "Briefing",
  quoting: "Quoting",
  awaiting_approval: "Awaiting Approval",
  confirmed: "Confirmed",
  in_delivery: "In Delivery",
};

const STAGE_COLOR: Record<(typeof STAGE_ORDER)[number], string> = {
  new_enquiry: "#3b82f6",
  briefing: "#8b5cf6",
  quoting: "#f59e0b",
  awaiting_approval: "#4f46e5",
  confirmed: "#22c55e",
  in_delivery: "#0ea5e9",
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff));
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface RangeWindow {
  start: Date;
  end: Date;
}

/** Resolve the selected dashboard period into a concrete [start, end) window. */
export function resolveRange(range: DashboardRange, now = new Date()): RangeWindow {
  switch (range) {
    case "today":
      return { start: startOfDay(now), end: new Date(startOfDay(now).getTime() + 86_400_000) };
    case "next7":
      return { start: now, end: new Date(now.getTime() + 7 * 86_400_000) };
    case "month": {
      const start = startOfMonth(now);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { start, end };
    }
    case "week":
    default: {
      const start = startOfWeek(now);
      const end = new Date(start.getTime() + 7 * 86_400_000);
      return { start, end };
    }
  }
}

function previousWindow(win: RangeWindow): RangeWindow {
  const durationMs = win.end.getTime() - win.start.getTime();
  return { start: new Date(win.start.getTime() - durationMs), end: win.start };
}

function pctDelta(current: number, previous: number): { pct: number | null; positive: boolean } {
  if (previous <= 0) {
    if (current <= 0) return { pct: null, positive: true };
    return { pct: 100, positive: true };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, positive: pct >= 0 };
}

/** Bucket a list of ISO date strings into N equal-width weekly buckets ending now, oldest→newest. */
function weeklyBuckets(dates: (string | null | undefined)[], weeks = 8, now = new Date()): number[] {
  const buckets = new Array(weeks).fill(0);
  const weekMs = 7 * 86_400_000;
  const end = now.getTime();
  const start = end - weeks * weekMs;
  for (const d of dates) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (Number.isNaN(t) || t < start || t > end) continue;
    const idx = Math.min(weeks - 1, Math.floor((t - start) / weekMs));
    buckets[idx] += 1;
  }
  return buckets;
}

export interface KpiDatum {
  value: number;
  formattedValue: string;
  deltaPct: number | null;
  positive: boolean;
  sparkline: number[];
  secondaryLabel: string;
  /** True when the secondary line represents a risk/overdue count worth flagging in red. */
  warn: boolean;
}

export interface UpcomingEventCard {
  id: string;
  name: string;
  status: string;
  eventType: string | null;
  startAt: string | null;
  month: string;
  day: string;
  venue: string | null;
  guestCount: number;
  valueCents: number;
  coverImageUrl: string | null;
  isVip: boolean;
  riskLevel: string | null;
}

export type AttentionSeverity = "overdue" | "due-today" | "due-soon" | "at-risk" | "flagged" | "payment-overdue";

export interface AttentionItem {
  id: string;
  kind: "task" | "event" | "invoice";
  title: string;
  category: string;
  eventName: string | null;
  dueLabel: string;
  severity: AttentionSeverity;
  href: string;
}

export interface PipelineStage {
  key: string;
  label: string;
  valueCents: number;
  color: string;
  pct: number;
}

export interface PipelineOpportunity {
  id: string;
  name: string;
  stageLabel: string;
  dateLabel: string;
  valueCents: number;
}

export interface ActivityItem {
  id: string;
  message: string;
  detail: string | null;
  href: string | null;
  at: string;
}

export interface HomeDashboardData {
  range: DashboardRange;
  currency: string;
  locale: string;
  kpis: {
    activeEvents: KpiDatum;
    upcomingEvents: KpiDatum;
    openTasks: KpiDatum;
    outstandingInvoices: KpiDatum;
  };
  upcomingEvents: UpcomingEventCard[];
  attentionItems: AttentionItem[];
  pipeline: { totalCents: number; stages: PipelineStage[]; topOpportunities: PipelineOpportunity[] };
  activity: ActivityItem[];
}

function dueLabelFor(due: string | null, now: Date): { label: string; overdue: boolean; dueToday: boolean } {
  if (!due) return { label: "No due date", overdue: false, dueToday: false };
  const dueDate = new Date(due);
  const dayMs = 86_400_000;
  const startOfDue = startOfDay(dueDate);
  const startOfNow = startOfDay(now);
  const diffDays = Math.round((startOfDue.getTime() - startOfNow.getTime()) / dayMs);

  if (diffDays < 0) return { label: `Overdue by ${Math.abs(diffDays)}d`, overdue: true, dueToday: false };
  if (diffDays === 0) return { label: "Due today", overdue: false, dueToday: true };
  if (diffDays === 1) return { label: "Due in 1 day", overdue: false, dueToday: false };
  return { label: `Due in ${diffDays} days`, overdue: false, dueToday: false };
}

export async function getHomeDashboardData(
  workspaceId: string,
  range: DashboardRange,
  currency: string,
  locale: string
): Promise<HomeDashboardData> {
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const win = resolveRange(range, now);
  const prevWin = previousWindow(win);
  const attentionHorizonIso = new Date(now.getTime() + 14 * 86_400_000).toISOString();

  const [
    activeEventsRes,
    upcomingInRangeRes,
    upcomingInPrevRangeRes,
    carouselEventsRes,
    openTasksRes,
    outstandingInvoicesRes,
    attentionTasksRes,
    riskEventsRes,
    overdueInvoicesRes,
    paidInvoicesRes,
    updatedEventsRes,
    completedTasksRes,
    onboardedSuppliersRes,
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, status, start_at, budget_cents, quote_value_cents, created_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .not("status", "in", ACTIVE_EVENT_STATUSES_EXCLUDED),
    supabase
      .from("events")
      .select("id, budget_cents, quote_value_cents", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("start_at", win.start.toISOString())
      .lt("start_at", win.end.toISOString()),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("start_at", prevWin.start.toISOString())
      .lt("start_at", prevWin.end.toISOString()),
    supabase
      .from("events")
      .select(
        "id, name, status, event_type, start_at, venue_name_snapshot, location, guest_count_day, guest_count_evening, budget_cents, quote_value_cents, cover_image_url, is_vip, risk_level"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(12),
    supabase
      .from("tasks")
      .select("id, due_at, created_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .not("status", "in", OPEN_TASK_STATUSES_EXCLUDED),
    supabase
      .from("invoices")
      .select("id, total_cents, paid_cents, due_on, issued_on, status")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .not("status", "in", CLOSED_INVOICE_STATUSES_EXCLUDED),
    supabase
      .from("tasks")
      .select("id, title, status, due_at, event_id, category, priority")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .not("status", "in", OPEN_TASK_STATUSES_EXCLUDED)
      .not("due_at", "is", null)
      .lte("due_at", attentionHorizonIso)
      .order("due_at", { ascending: true })
      .limit(10),
    supabase
      .from("events")
      .select("id, name, status, risk_level, flagged, flagged_reason, next_action, next_action_due")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .not("status", "in", ACTIVE_EVENT_STATUSES_EXCLUDED)
      .or("risk_level.in.(high,critical),flagged.eq.true")
      .limit(6),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, due_on, total_cents, paid_cents, event_id, status")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .or(`status.eq.overdue,and(due_on.lt.${now.toISOString().slice(0, 10)},status.neq.paid,status.neq.void)`)
      .order("due_on", { ascending: true })
      .limit(4),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, total_cents, payment_received_at, event_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "paid")
      .not("payment_received_at", "is", null)
      .order("payment_received_at", { ascending: false })
      .limit(5),
    supabase
      .from("events")
      .select("id, name, updated_at, created_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("tasks")
      .select("id, title, completed_at, event_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "done")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(5),
    supabase
      .from("suppliers")
      .select("id, name, onboarding_completed_at")
      .eq("workspace_id", workspaceId)
      .not("onboarding_completed_at", "is", null)
      .order("onboarding_completed_at", { ascending: false })
      .limit(5),
  ]);

  const currencyFmt = (cents: number) => exactCurrency(cents, currency, locale);
  // Compact ("£8.7m") for aggregate/summary values — matches the reference dashboard,
  // where roll-up totals are abbreviated but individual record amounts stay exact.
  const compactCurrencyFmt = (cents: number) => compactCurrency(cents, currency, locale);

  // ── KPI 1: Active Events ────────────────────────────────────────────────────
  const activeEventRows = activeEventsRes.data ?? [];
  const activeEventsValueCents = activeEventRows.reduce(
    (sum, e) => sum + (e.budget_cents || e.quote_value_cents || 0),
    0
  );
  const activeCreatedDates = activeEventRows.map((e) => e.created_at);
  const activeCurrent30 = activeCreatedDates.filter((d) => new Date(d).getTime() >= now.getTime() - 30 * 86_400_000).length;
  const activePrev30 = activeCreatedDates.filter((d) => {
    const t = new Date(d).getTime();
    return t < now.getTime() - 30 * 86_400_000 && t >= now.getTime() - 60 * 86_400_000;
  }).length;
  const activeDelta = pctDelta(activeCurrent30, activePrev30);

  // ── KPI 2: Upcoming Events (range-scoped) ───────────────────────────────────
  const upcomingRangeRows = upcomingInRangeRes.data ?? [];
  const upcomingCount = upcomingInRangeRes.count ?? upcomingRangeRows.length;
  const upcomingValueCents = upcomingRangeRows.reduce((sum, e) => sum + (e.budget_cents || e.quote_value_cents || 0), 0);
  const upcomingPrevCount = upcomingInPrevRangeRes.count ?? 0;
  const upcomingDelta = pctDelta(upcomingCount, upcomingPrevCount);

  // ── KPI 3: Open Tasks ────────────────────────────────────────────────────────
  const openTaskRows = openTasksRes.data ?? [];
  const openTasksCount = openTaskRows.length;
  const overdueTasksCount = openTaskRows.filter((t) => t.due_at && new Date(t.due_at).getTime() < now.getTime()).length;
  const tasksCurrent30 = openTaskRows.filter((t) => new Date(t.created_at).getTime() >= now.getTime() - 30 * 86_400_000).length;
  const tasksPrev30 = openTaskRows.filter((t) => {
    const tt = new Date(t.created_at).getTime();
    return tt < now.getTime() - 30 * 86_400_000 && tt >= now.getTime() - 60 * 86_400_000;
  }).length;
  const tasksDelta = pctDelta(tasksCurrent30, tasksPrev30);

  // ── KPI 4: Outstanding Invoices ──────────────────────────────────────────────
  const outstandingRows = outstandingInvoicesRes.data ?? [];
  const outstandingCents = outstandingRows.reduce(
    (sum, inv) => sum + Math.max((inv.total_cents ?? 0) - (inv.paid_cents ?? 0), 0),
    0
  );
  const overdueInvoiceCount = outstandingRows.filter(
    (inv) => inv.status === "overdue" || (inv.due_on && new Date(inv.due_on).getTime() < now.getTime())
  ).length;
  const invoicesIssued30 = outstandingRows.filter(
    (inv) => inv.issued_on && new Date(inv.issued_on).getTime() >= now.getTime() - 30 * 86_400_000
  ).length;
  const invoicesIssuedPrev30 = outstandingRows.filter((inv) => {
    if (!inv.issued_on) return false;
    const t = new Date(inv.issued_on).getTime();
    return t < now.getTime() - 30 * 86_400_000 && t >= now.getTime() - 60 * 86_400_000;
  }).length;
  const invoicesDelta = pctDelta(invoicesIssued30, invoicesIssuedPrev30);

  const kpis: HomeDashboardData["kpis"] = {
    activeEvents: {
      value: activeEventRows.length,
      formattedValue: activeEventRows.length.toLocaleString(locale),
      deltaPct: activeDelta.pct,
      positive: activeDelta.positive,
      sparkline: weeklyBuckets(activeCreatedDates, 8, now),
      secondaryLabel: `${compactCurrencyFmt(activeEventsValueCents)} estimated value`,
      warn: false,
    },
    upcomingEvents: {
      value: upcomingCount,
      formattedValue: upcomingCount.toLocaleString(locale),
      deltaPct: upcomingDelta.pct,
      positive: upcomingDelta.positive,
      sparkline: weeklyBuckets(
        carouselEventsRes.data?.map((e) => e.start_at) ?? [],
        8,
        now
      ),
      secondaryLabel: `${compactCurrencyFmt(upcomingValueCents)} total pipeline value`,
      warn: false,
    },
    openTasks: {
      value: openTasksCount,
      formattedValue: openTasksCount.toLocaleString(locale),
      deltaPct: tasksDelta.pct,
      positive: tasksDelta.positive,
      sparkline: weeklyBuckets(openTaskRows.map((t) => t.created_at), 8, now),
      secondaryLabel: `${overdueTasksCount.toLocaleString(locale)} overdue task${overdueTasksCount === 1 ? "" : "s"}`,
      warn: overdueTasksCount > 0,
    },
    outstandingInvoices: {
      value: outstandingCents,
      formattedValue: currencyFmt(outstandingCents),
      deltaPct: invoicesDelta.pct,
      positive: invoicesDelta.positive,
      sparkline: weeklyBuckets(outstandingRows.map((i) => i.issued_on), 8, now),
      secondaryLabel: `${overdueInvoiceCount.toLocaleString(locale)} invoice${overdueInvoiceCount === 1 ? "" : "s"} overdue`,
      warn: overdueInvoiceCount > 0,
    },
  };

  // ── Upcoming events carousel ────────────────────────────────────────────────
  const upcomingEvents: UpcomingEventCard[] = (carouselEventsRes.data ?? []).map((e) => {
    const startAt = e.start_at;
    const d = startAt ? new Date(startAt) : null;
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      eventType: e.event_type,
      startAt,
      month: d ? d.toLocaleDateString(locale, { month: "short" }).toUpperCase() : "—",
      day: d ? d.getDate().toString() : "—",
      venue: e.venue_name_snapshot ?? e.location ?? null,
      guestCount: (e.guest_count_day ?? 0) + (e.guest_count_evening ?? 0),
      valueCents: e.budget_cents || e.quote_value_cents || 0,
      coverImageUrl: r2PublicUrl(e.cover_image_url),
      isVip: !!e.is_vip,
      riskLevel: e.risk_level,
    };
  });

  // ── Needs attention ──────────────────────────────────────────────────────────
  const attentionTasks = attentionTasksRes.data ?? [];
  const attentionEventIds = Array.from(new Set(attentionTasks.map((t) => t.event_id).filter(Boolean))) as string[];
  const attentionEventNames = new Map<string, string>();
  if (attentionEventIds.length > 0) {
    const { data: evRows } = await supabase.from("events").select("id, name").in("id", attentionEventIds);
    for (const ev of evRows ?? []) attentionEventNames.set(ev.id, ev.name);
  }

  const taskItems: AttentionItem[] = attentionTasks.map((t) => {
    const { label, overdue, dueToday } = dueLabelFor(t.due_at, now);
    return {
      id: `task-${t.id}`,
      kind: "task",
      title: t.title,
      category: t.category ?? "Task",
      eventName: t.event_id ? attentionEventNames.get(t.event_id) ?? null : null,
      dueLabel: label,
      severity: overdue ? "overdue" : dueToday ? "due-today" : "due-soon",
      href: `/event-manager/tasks/${t.id}`,
    };
  });

  const riskItems: AttentionItem[] = (riskEventsRes.data ?? []).map((e) => ({
    id: `event-${e.id}`,
    kind: "event",
    title: e.flagged ? (e.flagged_reason ?? "Flagged for review") : (e.next_action ?? "At-risk event"),
    category: e.flagged ? "Flagged" : "Risk",
    eventName: e.name,
    dueLabel: e.next_action_due ? dueLabelFor(e.next_action_due, now).label : `${(e.risk_level ?? "medium")} risk`,
    severity: e.flagged ? "flagged" : "at-risk",
    href: `/event-manager/events/${e.id}`,
  }));

  const invoiceItems: AttentionItem[] = (overdueInvoicesRes.data ?? []).map((inv) => ({
    id: `invoice-${inv.id}`,
    kind: "invoice",
    title: `Invoice ${inv.invoice_number} overdue`,
    category: "Payment",
    eventName: inv.client_name,
    dueLabel: inv.due_on ? dueLabelFor(inv.due_on, now).label : "Overdue",
    severity: "payment-overdue",
    href: `/event-manager/finance/invoices/${inv.id}`,
  }));

  const severityRank: Record<AttentionSeverity, number> = {
    overdue: 0,
    "payment-overdue": 1,
    "due-today": 2,
    flagged: 3,
    "at-risk": 4,
    "due-soon": 5,
  };
  const attentionItems = [...taskItems, ...riskItems, ...invoiceItems]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 8);

  // ── Event pipeline ───────────────────────────────────────────────────────────
  const stageValues = new Map<string, number>(STAGE_ORDER.map((s) => [s, 0]));
  for (const e of activeEventRows) {
    if (!stageValues.has(e.status)) continue;
    stageValues.set(e.status, (stageValues.get(e.status) ?? 0) + (e.budget_cents || e.quote_value_cents || 0));
  }
  const pipelineTotalCents = Array.from(stageValues.values()).reduce((s, v) => s + v, 0);
  const stages: PipelineStage[] = STAGE_ORDER.map((key) => {
    const valueCents = stageValues.get(key) ?? 0;
    return {
      key,
      label: STAGE_LABEL[key],
      valueCents,
      color: STAGE_COLOR[key],
      pct: pipelineTotalCents > 0 ? Math.round((valueCents / pipelineTotalCents) * 100) : 0,
    };
  }).filter((s) => s.valueCents > 0);

  const topOpportunities: PipelineOpportunity[] = activeEventRows
    .filter((e) => e.status !== "confirmed" && e.status !== "in_delivery")
    .map((e) => ({
      id: e.id,
      name: e.name,
      stageLabel: STAGE_LABEL[e.status as (typeof STAGE_ORDER)[number]] ?? e.status,
      dateLabel: e.start_at
        ? new Date(e.start_at).toLocaleDateString(locale, { month: "short", year: "numeric" })
        : "No date",
      valueCents: e.budget_cents || e.quote_value_cents || 0,
    }))
    .sort((a, b) => b.valueCents - a.valueCents)
    .slice(0, 3);

  // ── Recent activity ──────────────────────────────────────────────────────────
  const activity: ActivityItem[] = [
    ...(paidInvoicesRes.data ?? []).map((inv) => ({
      id: `inv-${inv.id}`,
      message: `Invoice ${inv.invoice_number} paid`,
      detail: inv.client_name ?? currencyFmt(inv.total_cents),
      href: `/event-manager/finance/invoices/${inv.id}`,
      at: inv.payment_received_at as string,
    })),
    ...(updatedEventsRes.data ?? [])
      .filter((e) => e.updated_at !== e.created_at)
      .map((e) => ({
        id: `ev-${e.id}`,
        message: "Event updated",
        detail: e.name,
        href: `/event-manager/events/${e.id}`,
        at: e.updated_at,
      })),
    ...(completedTasksRes.data ?? []).map((t) => ({
      id: `task-${t.id}`,
      message: "Task completed",
      detail: t.title,
      href: `/event-manager/tasks/${t.id}`,
      at: t.completed_at as string,
    })),
    ...(onboardedSuppliersRes.data ?? []).map((s) => ({
      id: `sup-${s.id}`,
      message: "Supplier onboarded",
      detail: s.name,
      href: `/event-manager/suppliers/${s.id}`,
      at: s.onboarding_completed_at as string,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  return {
    range,
    currency,
    locale,
    kpis,
    upcomingEvents,
    attentionItems,
    pipeline: { totalCents: pipelineTotalCents, stages, topOpportunities },
    activity,
  };
}
