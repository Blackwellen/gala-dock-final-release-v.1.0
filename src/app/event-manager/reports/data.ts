import { createClient } from "@/lib/supabase/server";

/**
 * Live data layer for Reports & Analytics (Level 5).
 *
 * Every query is workspace-scoped via `.eq("workspace_id", workspaceId)` in
 * addition to RLS. All money columns are *_cents (GBP minor units); the UI
 * divides by 100 and formats with formatCurrency. No numbers are fabricated —
 * every metric is derived from rows. Tabs receive plain serializable objects.
 */

// ── Shared types ────────────────────────────────────────────────────────────

export interface MonthBucket {
  label: string; // "Jan", "Feb", ...
  invoiced: number; // £ pounds
  paid: number; // £ pounds
}

export interface NamedValue {
  label: string;
  value: number;
}

export interface OverviewData {
  revenueYtd: number;
  eventsDeliveredYtd: number;
  activeEvents: number;
  newLeadsThisMonth: number;
  pipelineValue: number;
  monthlyRevenue: MonthBucket[];
  pipeline: { stage: string; label: string; count: number }[];
  insights: {
    avgLeadToEventDays: number | null;
    topEventType: { type: string; count: number } | null;
    topSupplier: { name: string; count: number } | null;
  };
}

export interface RevenueData {
  monthlyRevenue: MonthBucket[];
  byEventType: NamedValue[]; // pounds
  outstanding: number;
  overdue: number;
  dueThisMonth: number;
  totalInvoiced: number;
  totalPaid: number;
  statusDistribution: { status: string; count: number; pct: number }[];
  topClients: {
    name: string;
    events: number;
    billed: number;
    paid: number;
    outstanding: number;
  }[];
  hasData: boolean;
}

export interface EventsData {
  statusDistribution: NamedValue[];
  byType: NamedValue[];
  delivery: {
    name: string;
    date: string | null;
    type: string | null;
    status: string;
    guests: number;
    revenue: number; // paid pounds
    marginPct: number | null;
  }[];
  avgMarginPct: number | null;
  deliveredCount: number;
  upcoming: { name: string; date: string | null; status: string; daysUntil: number | null }[];
  hasData: boolean;
}

export interface SuppliersData {
  topSuppliers: {
    name: string;
    bookings: number;
    quotes: number;
    accepted: number;
  }[];
  byBookings: NamedValue[];
  docHealth: { verified: number; expiringSoon: number; expired: number; total: number };
  quotes: { sent: number; accepted: number; declined: number; pending: number; acceptanceRate: number | null };
  hasData: boolean;
}

export interface TeamData {
  members: {
    name: string;
    eventsAssigned: number;
    tasksAssigned: number;
    tasksCompleted: number;
    tasksOverdue: number;
  }[];
  tasksByStatus: NamedValue[];
  totalOverdue: number;
  hasData: boolean;
}

export interface ClientsData {
  clients: {
    name: string;
    events: number;
    firstEvent: string | null;
    lastEvent: string | null;
    totalSpent: number; // pounds
    active: boolean;
  }[];
  totalClients: number;
  repeatClients: number;
  repeatPct: number | null;
  avgEventsPerClient: number | null;
  avgClientValue: number; // pounds
  renewals: {
    name: string;
    lastEvent: string | null;
    events: number;
    totalSpent: number;
  }[];
  hasData: boolean;
}

export interface ReportsData {
  overview: OverviewData;
  revenue: RevenueData;
  events: EventsData;
  suppliers: SuppliersData;
  team: TeamData;
  clients: ClientsData;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function gbp(cents: number | null | undefined): number {
  return Math.round((cents ?? 0)) / 100;
}

function titleCase(s: string | null | undefined): string {
  if (!s) return "Unknown";
  return s
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a rolling list of the last 12 calendar months ending with the current month. */
function lastTwelveMonths(now: Date): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()] });
  }
  return out;
}

const LEAD_STAGES: { stage: string; label: string }[] = [
  { stage: "new-enquiry", label: "New Enquiry" },
  { stage: "contacted", label: "Contacted" },
  { stage: "proposal-sent", label: "Proposal Sent" },
  { stage: "negotiating", label: "Negotiating" },
  { stage: "won", label: "Won" },
  { stage: "lost", label: "Lost" },
];

// ── Loader ──────────────────────────────────────────────────────────────────

export async function loadReportsData(workspaceId: string): Promise<ReportsData> {
  const supabase = await createClient();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Fetch all source rows in parallel. RLS + explicit workspace filter.
  const [
    invoicesRes,
    eventsRes,
    leadsRes,
    suppliersHealthRes,
    eventSuppliersRes,
    membersRes,
    eventTasksRes,
    clientsRes,
    financeSummaryRes,
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_cents, paid_cents, status, issued_on, due_on, event_id, client_name, archived_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
    supabase
      .from("events_with_stats")
      .select(
        "id, name, event_type, status, start_at, completed_at, created_at, budget_cents, total_invoiced_cents, total_paid_cents, guest_count_day, guest_count_evening, supplier_count, client_name, client_id, owner_user_id"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("leads")
      .select("id, stage, source, budget_estimate_cents, created_at, event_date, event_type, converted_event_id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("supplier_health")
      .select(
        "id, name, event_count, quote_count, accepted_quotes, insurance_expired, insurance_expiring_soon, onboarding_complete"
      )
      .eq("workspace_id", workspaceId),
    supabase
      .from("event_suppliers")
      .select("supplier_id, event_id, status")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("event_tasks")
      .select("id, status, assignee_user_id, due_at, completed_at, archived_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
    supabase
      .from("clients")
      .select("id, name, event_count, total_revenue_cents, last_event_at, created_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("workspace_finance_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  const invoices = invoicesRes.data ?? [];
  const events = eventsRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const supplierHealth = suppliersHealthRes.data ?? [];
  const eventSuppliers = eventSuppliersRes.data ?? [];
  const members = membersRes.data ?? [];
  const eventTasks = eventTasksRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const finance = financeSummaryRes.data ?? null;

  // Resolve member display names from profiles (no reliable FK join → fetch separately).
  const memberIds = members.map((m) => m.user_id);
  let profiles: { user_id: string; display_name: string | null }[] = [];
  if (memberIds.length > 0) {
    const { data: profRows } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    profiles = profRows ?? [];
  }
  const nameByUser = new Map(profiles.map((p) => [p.user_id, p.display_name]));

  // ── Monthly invoiced vs paid (last 12 months) ──────────────────────────────
  const months = lastTwelveMonths(now);
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  const monthly: MonthBucket[] = months.map((m) => ({ label: m.label, invoiced: 0, paid: 0 }));
  for (const inv of invoices) {
    if (!inv.issued_on) continue;
    const d = new Date(inv.issued_on);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = monthIndex.get(key);
    if (idx === undefined) continue;
    monthly[idx].invoiced += gbp(inv.total_cents);
    monthly[idx].paid += gbp(inv.paid_cents);
  }

  // ── Overview KPIs ──────────────────────────────────────────────────────────
  const revenueYtd = invoices
    .filter((i) => i.issued_on && new Date(i.issued_on) >= yearStart)
    .reduce((s, i) => s + gbp(i.paid_cents), 0);

  const eventsDeliveredYtd = events.filter(
    (e) => e.status === "completed" && e.completed_at && new Date(e.completed_at) >= yearStart
  ).length;

  const activeEvents = events.filter(
    (e) => e.status === "confirmed" || e.status === "in-delivery"
  ).length;

  const newLeadsThisMonth = leads.filter(
    (l) => l.created_at && new Date(l.created_at) >= monthStart
  ).length;

  const pipelineValue = leads
    .filter((l) => l.stage !== "won" && l.stage !== "lost")
    .reduce((s, l) => s + gbp(l.budget_estimate_cents), 0);

  // Pipeline funnel counts per stage.
  const stageCounts = new Map<string, number>();
  for (const l of leads) stageCounts.set(l.stage, (stageCounts.get(l.stage) ?? 0) + 1);
  const pipeline = LEAD_STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    count: stageCounts.get(s.stage) ?? 0,
  }));

  // Insight: avg days from lead creation to its converted event start.
  const eventById = new Map(events.map((e) => [e.id, e]));
  const convDurations: number[] = [];
  for (const l of leads) {
    if (!l.converted_event_id || !l.created_at) continue;
    const ev = eventById.get(l.converted_event_id);
    if (!ev?.start_at) continue;
    const days = Math.round(
      (new Date(ev.start_at).getTime() - new Date(l.created_at).getTime()) / 86400000
    );
    if (days >= 0) convDurations.push(days);
  }
  const avgLeadToEventDays =
    convDurations.length > 0
      ? Math.round(convDurations.reduce((a, b) => a + b, 0) / convDurations.length)
      : null;

  // Insight: most booked event type.
  const typeCounts = new Map<string, number>();
  for (const e of events) {
    if (!e.event_type) continue;
    typeCounts.set(e.event_type, (typeCounts.get(e.event_type) ?? 0) + 1);
  }
  let topEventType: { type: string; count: number } | null = null;
  for (const [type, count] of typeCounts) {
    if (!topEventType || count > topEventType.count) topEventType = { type: titleCase(type), count };
  }

  // Insight: top supplier by event bookings.
  const supplierBookings = new Map<string, number>();
  for (const es of eventSuppliers) {
    supplierBookings.set(es.supplier_id, (supplierBookings.get(es.supplier_id) ?? 0) + 1);
  }
  const supplierNameById = new Map(supplierHealth.map((s) => [s.id ?? "", s.name ?? "Supplier"]));
  let topSupplier: { name: string; count: number } | null = null;
  for (const [sid, count] of supplierBookings) {
    if (!topSupplier || count > topSupplier.count) {
      topSupplier = { name: supplierNameById.get(sid) ?? "Supplier", count };
    }
  }

  const overview: OverviewData = {
    revenueYtd,
    eventsDeliveredYtd,
    activeEvents,
    newLeadsThisMonth,
    pipelineValue,
    monthlyRevenue: monthly,
    pipeline,
    insights: { avgLeadToEventDays, topEventType, topSupplier },
  };

  // ── Revenue tab ─────────────────────────────────────────────────────────────
  // Revenue by event type: sum paid_cents of invoices grouped by linked event's type.
  const eventTypeById = new Map(events.map((e) => [e.id, e.event_type]));
  const revByType = new Map<string, number>();
  for (const inv of invoices) {
    const type = inv.event_id ? eventTypeById.get(inv.event_id) : null;
    const key = titleCase(type ?? "Unassigned");
    revByType.set(key, (revByType.get(key) ?? 0) + gbp(inv.paid_cents));
  }
  const byEventType: NamedValue[] = [...revByType.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  // Status distribution from live invoice statuses.
  const statusCounts = new Map<string, number>();
  for (const inv of invoices) statusCounts.set(inv.status, (statusCounts.get(inv.status) ?? 0) + 1);
  const totalInvCount = invoices.length;
  const statusDistribution = [...statusCounts.entries()]
    .map(([status, count]) => ({
      status,
      count,
      pct: totalInvCount > 0 ? Math.round((count / totalInvCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Due this month: outstanding (total - paid) on invoices due within current month, not paid/void.
  const dueThisMonth = invoices
    .filter(
      (i) =>
        i.due_on &&
        new Date(i.due_on) >= monthStart &&
        new Date(i.due_on) <= monthEnd &&
        i.status !== "paid" &&
        i.status !== "void"
    )
    .reduce((s, i) => s + gbp(i.total_cents) - gbp(i.paid_cents), 0);

  // Top clients by revenue: aggregate invoices by client_name.
  const clientAgg = new Map<string, { events: Set<string>; billed: number; paid: number }>();
  for (const inv of invoices) {
    const name = (inv.client_name ?? "").trim() || "Unnamed Client";
    const entry = clientAgg.get(name) ?? { events: new Set<string>(), billed: 0, paid: 0 };
    entry.billed += gbp(inv.total_cents);
    entry.paid += gbp(inv.paid_cents);
    if (inv.event_id) entry.events.add(inv.event_id);
    clientAgg.set(name, entry);
  }
  const topClients = [...clientAgg.entries()]
    .map(([name, v]) => ({
      name,
      events: v.events.size,
      billed: Math.round(v.billed),
      paid: Math.round(v.paid),
      outstanding: Math.round(v.billed - v.paid),
    }))
    .sort((a, b) => b.billed - a.billed)
    .slice(0, 5);

  const revenue: RevenueData = {
    monthlyRevenue: monthly,
    byEventType,
    outstanding: gbp(finance?.outstanding_cents),
    overdue: gbp(finance?.overdue_cents),
    dueThisMonth: Math.round(dueThisMonth),
    totalInvoiced: gbp(finance?.total_invoiced_cents),
    totalPaid: gbp(finance?.total_paid_cents),
    statusDistribution,
    topClients,
    hasData: invoices.length > 0,
  };

  // ── Events tab ──────────────────────────────────────────────────────────────
  const evStatusCounts = new Map<string, number>();
  for (const e of events) evStatusCounts.set(e.status ?? "unknown", (evStatusCounts.get(e.status ?? "unknown") ?? 0) + 1);
  const eventStatusDistribution: NamedValue[] = [...evStatusCounts.entries()]
    .map(([label, value]) => ({ label: titleCase(label), value }))
    .sort((a, b) => b.value - a.value);

  const evByType: NamedValue[] = [...typeCounts.entries()]
    .map(([label, value]) => ({ label: titleCase(label), value }))
    .sort((a, b) => b.value - a.value);

  const delivery = events
    .map((e) => {
      const guests = (e.guest_count_day ?? 0) + (e.guest_count_evening ?? 0);
      const paid = gbp(e.total_paid_cents);
      const budget = gbp(e.budget_cents);
      // Margin proxy: paid revenue vs budgeted cost. Only when both present.
      const marginPct =
        budget > 0 && paid > 0 ? Math.round(((paid - budget) / paid) * 100) : null;
      return {
        name: e.name ?? "Untitled Event",
        date: e.start_at,
        type: e.event_type ? titleCase(e.event_type) : null,
        status: e.status ?? "unknown",
        guests,
        revenue: Math.round(paid),
        marginPct,
      };
    })
    .sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });

  const margins = delivery.map((d) => d.marginPct).filter((m): m is number => m !== null);
  const avgMarginPct =
    margins.length > 0 ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : null;
  const deliveredCount = events.filter((e) => e.status === "completed").length;

  const upcoming = events
    .filter((e) => e.start_at && new Date(e.start_at) >= now && e.status !== "cancelled" && e.status !== "completed")
    .sort((a, b) => new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime())
    .slice(0, 5)
    .map((e) => ({
      name: e.name ?? "Untitled Event",
      date: e.start_at,
      status: e.status ?? "unknown",
      daysUntil: e.start_at
        ? Math.max(0, Math.round((new Date(e.start_at).getTime() - now.getTime()) / 86400000))
        : null,
    }));

  const eventsData: EventsData = {
    statusDistribution: eventStatusDistribution,
    byType: evByType,
    delivery: delivery.slice(0, 20),
    avgMarginPct,
    deliveredCount,
    upcoming,
    hasData: events.length > 0,
  };

  // ── Suppliers tab ─────────────────────────────────────────────────────────
  const topSuppliers = supplierHealth
    .map((s) => ({
      name: s.name ?? "Supplier",
      bookings: s.event_count ?? 0,
      quotes: s.quote_count ?? 0,
      accepted: s.accepted_quotes ?? 0,
    }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 8);

  const supplierByBookings: NamedValue[] = supplierHealth
    .map((s) => ({ label: s.name ?? "Supplier", value: s.event_count ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const docHealth = {
    verified: supplierHealth.filter((s) => s.onboarding_complete && !s.insurance_expired && !s.insurance_expiring_soon).length,
    expiringSoon: supplierHealth.filter((s) => s.insurance_expiring_soon).length,
    expired: supplierHealth.filter((s) => s.insurance_expired).length,
    total: supplierHealth.length,
  };

  const quotesSent = supplierHealth.reduce((s, x) => s + (x.quote_count ?? 0), 0);
  const quotesAccepted = supplierHealth.reduce((s, x) => s + (x.accepted_quotes ?? 0), 0);
  const esDeclined = eventSuppliers.filter((es) => es.status === "declined").length;
  const esPending = eventSuppliers.filter(
    (es) => es.status === "shortlisted" || es.status === "contacted"
  ).length;
  const quotes = {
    sent: quotesSent,
    accepted: quotesAccepted,
    declined: esDeclined,
    pending: esPending || Math.max(0, quotesSent - quotesAccepted),
    acceptanceRate: quotesSent > 0 ? Math.round((quotesAccepted / quotesSent) * 100) : null,
  };

  const suppliers: SuppliersData = {
    topSuppliers,
    byBookings: supplierByBookings,
    docHealth,
    quotes,
    hasData: supplierHealth.length > 0,
  };

  // ── Team tab ────────────────────────────────────────────────────────────────
  const eventsByOwner = new Map<string, number>();
  for (const e of events) {
    if (!e.owner_user_id) continue;
    eventsByOwner.set(e.owner_user_id, (eventsByOwner.get(e.owner_user_id) ?? 0) + 1);
  }
  // Workload from event_tasks assignment.
  const taskAgg = new Map<string, { assigned: number; completed: number; overdue: number }>();
  let totalOverdue = 0;
  for (const t of eventTasks) {
    const uid = t.assignee_user_id;
    if (!uid) continue;
    const entry = taskAgg.get(uid) ?? { assigned: 0, completed: 0, overdue: 0 };
    entry.assigned += 1;
    const isDone = t.status === "done" || t.status === "completed" || !!t.completed_at;
    if (isDone) entry.completed += 1;
    const isOverdue = !isDone && t.due_at && new Date(t.due_at) < now;
    if (isOverdue) {
      entry.overdue += 1;
      totalOverdue += 1;
    }
    taskAgg.set(uid, entry);
  }

  const teamMembers = members.map((m) => {
    const t = taskAgg.get(m.user_id) ?? { assigned: 0, completed: 0, overdue: 0 };
    return {
      name: nameByUser.get(m.user_id) || titleCase(m.role) + " Member",
      eventsAssigned: eventsByOwner.get(m.user_id) ?? 0,
      tasksAssigned: t.assigned,
      tasksCompleted: t.completed,
      tasksOverdue: t.overdue,
    };
  });

  // Tasks by status across the workspace.
  const taskStatusCounts = new Map<string, number>();
  for (const t of eventTasks) {
    const isDone = t.status === "done" || t.status === "completed" || !!t.completed_at;
    let bucket: string;
    if (isDone) bucket = "Completed";
    else if (t.due_at && new Date(t.due_at) < now) bucket = "Overdue";
    else if (t.status === "in_progress" || t.status === "in-progress") bucket = "In Progress";
    else bucket = "Not Started";
    taskStatusCounts.set(bucket, (taskStatusCounts.get(bucket) ?? 0) + 1);
  }
  const tasksByStatus: NamedValue[] = ["Not Started", "In Progress", "Completed", "Overdue"]
    .map((label) => ({ label, value: taskStatusCounts.get(label) ?? 0 }));

  const team: TeamData = {
    members: teamMembers.sort((a, b) => b.tasksAssigned - a.tasksAssigned),
    tasksByStatus,
    totalOverdue,
    hasData: members.length > 0 && eventTasks.length > 0,
  };

  // ── Clients tab ─────────────────────────────────────────────────────────────
  // First-event date isn't on clients; derive earliest event start per client_id.
  const firstEventByClient = new Map<string, string>();
  for (const e of events) {
    if (!e.client_id || !e.start_at) continue;
    const cur = firstEventByClient.get(e.client_id);
    if (!cur || new Date(e.start_at) < new Date(cur)) firstEventByClient.set(e.client_id, e.start_at);
  }

  const nineMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 9, now.getDate());
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const clientRows = clients
    .map((c) => {
      const lastEvent = c.last_event_at;
      const active = lastEvent ? new Date(lastEvent) >= nineMonthsAgo : false;
      return {
        name: c.name,
        events: c.event_count ?? 0,
        firstEvent: firstEventByClient.get(c.id) ?? null,
        lastEvent,
        totalSpent: gbp(c.total_revenue_cents),
        active,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const totalClients = clientRows.length;
  const repeatClients = clientRows.filter((c) => c.events >= 2).length;
  const totalEventsAcrossClients = clientRows.reduce((s, c) => s + c.events, 0);
  const totalClientRevenue = clientRows.reduce((s, c) => s + c.totalSpent, 0);

  const renewals = clientRows
    .filter(
      (c) =>
        c.lastEvent &&
        new Date(c.lastEvent) <= nineMonthsAgo &&
        new Date(c.lastEvent) >= twelveMonthsAgo
    )
    .map((c) => ({ name: c.name, lastEvent: c.lastEvent, events: c.events, totalSpent: Math.round(c.totalSpent) }))
    .slice(0, 8);

  const clientsData: ClientsData = {
    clients: clientRows.slice(0, 20).map((c) => ({ ...c, totalSpent: Math.round(c.totalSpent) })),
    totalClients,
    repeatClients,
    repeatPct: totalClients > 0 ? Math.round((repeatClients / totalClients) * 100) : null,
    avgEventsPerClient:
      totalClients > 0 ? Math.round((totalEventsAcrossClients / totalClients) * 10) / 10 : null,
    avgClientValue: totalClients > 0 ? Math.round(totalClientRevenue / totalClients) : 0,
    renewals,
    hasData: clients.length > 0,
  };

  return {
    overview,
    revenue,
    events: eventsData,
    suppliers,
    team,
    clients: clientsData,
  };
}
