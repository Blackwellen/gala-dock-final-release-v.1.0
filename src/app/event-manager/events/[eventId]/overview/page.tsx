import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  Users, Wallet, CheckCircle2, Clock, AlertCircle,
  Building2, Zap, MapPin, Ticket, TrendingUp, Star, ArrowRight,
  Radio, CloudSun, ShieldAlert, Sparkles, UserCheck,
  BarChart3, FileText, Layout, MessageSquare, CalendarDays,
} from "lucide-react";

export const dynamic = "force-dynamic";

/* ─── Formatters ─────────────────────────────────────────────────────────── */

function gbp(cents: number | null | undefined) {
  if (!cents) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", maximumFractionDigits: 0,
  }).format(cents / 100);
}

function num(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-GB");
}

function pct(n: number, d: number) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

/* ─── KPI Card ───────────────────────────────────────────────────────────── */

function KpiCard({
  label, value, sub, icon: Icon, iconBg, iconColor,
  trend, trendLabel, barPct, barColor,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  iconBg: string; iconColor: string; trend?: "up" | "down" | "neutral";
  trendLabel?: string; barPct?: number; barColor?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-card flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
          <p className="mt-1.5 text-[26px] font-bold text-surface-900 tracking-tight leading-none">{value}</p>
          {sub && <p className="mt-1 text-xs text-surface-400">{sub}</p>}
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={1.8} />
        </span>
      </div>
      {trendLabel && (
        <p className={`text-[11px] font-medium ${trend === "up" ? "text-success-600" : trend === "down" ? "text-danger-600" : "text-surface-400"}`}>
          {trend === "up" && "↑ "}{trend === "down" && "↓ "}{trendLabel}
        </p>
      )}
      {barPct !== undefined && (
        <div className="h-1 w-full rounded-full bg-surface-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor ?? "bg-brand-500"}`} style={{ width: `${Math.min(barPct, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/* ─── Donut ──────────────────────────────────────────────────────────────── */

function DonutChart({ pct: p, size = 96, stroke = 10, color = "#4f46e5", label, sublabel }: {
  pct: number; size?: number; stroke?: number; color?: string; label: string; sublabel?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (p / 100) * circ;
  const cx = size / 2;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }} className="-rotate-90 absolute inset-0">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-surface-100" />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
      </svg>
      <div className="flex flex-col items-center justify-center z-10 text-center">
        <span className="text-xl font-bold text-surface-900 leading-none">{label}</span>
        {sublabel && <span className="text-[10px] text-surface-400 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}

/* ─── Mini bar ───────────────────────────────────────────────────────────── */

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="w-24 shrink-0 text-surface-600 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-12 text-right text-surface-500 font-medium tabular-nums">{value}/{max}</span>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function OverviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events").select("*")
    .eq("id", eventId).eq("workspace_id", workspaceId).is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const [
    { count: taskTotal }, { count: taskDone }, { count: taskInProgress },
    { count: supplierTotal }, { count: supplierConfirmed },
    { count: guestTotal }, { count: guestConfirmed }, { count: guestVip },
    { data: expenses }, { data: tiers },
    { data: recentActivity }, { data: openTasks },
    { data: scheduleItems },
  ] = await Promise.all([
    supabase.from("event_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).is("archived_at", null),
    supabase.from("event_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).eq("status", "completed").is("archived_at", null),
    supabase.from("event_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).eq("status", "in_progress").is("archived_at", null),
    supabase.from("event_suppliers").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("event_suppliers").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).eq("status", "confirmed"),
    supabase.from("event_guests").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("event_guests").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).eq("rsvp_status", "confirmed"),
    supabase.from("event_guests").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).eq("guest_type", "vip"),
    supabase.from("event_expenses").select("amount_cents").eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("ticket_types").select("name, price_cents, quantity, sold").eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("event_activity").select("*").eq("workspace_id", workspaceId).eq("event_id", eventId).order("created_at", { ascending: false }).limit(6),
    supabase.from("event_tasks").select("id, title, status, priority, due_at").eq("workspace_id", workspaceId).eq("event_id", eventId).neq("status", "completed").is("archived_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(5),
    supabase.from("event_run_sheet_items").select("id, title, starts_at, duration_minutes, section, lane").eq("workspace_id", workspaceId).eq("event_id", eventId).order("position", { ascending: true }).limit(5),
  ]);

  /* computed */
  const totalSpent = (expenses ?? []).reduce((s, e) => s + (e.amount_cents ?? 0), 0);
  const budget = event.budget_cents ?? 0;
  const budgetUsedPct = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0;
  const ticketsSold = (tiers ?? []).reduce((s, t) => s + (t.sold ?? 0), 0);
  const ticketsTotal = (tiers ?? []).reduce((s, t) => s + (t.quantity ?? 0), 0);
  const ticketRevenue = (tiers ?? []).reduce((s, t) => s + (t.sold ?? 0) * (t.price_cents ?? 0), 0);
  const taskCompletionPct = (taskTotal ?? 0) > 0 ? Math.round(((taskDone ?? 0) / (taskTotal ?? 1)) * 100) : 0;
  const supplierReadinessPct = (supplierTotal ?? 0) > 0 ? Math.round(((supplierConfirmed ?? 0) / (supplierTotal ?? 1)) * 100) : 0;
  const guestConfirmPct = (guestTotal ?? 0) > 0 ? Math.round(((guestConfirmed ?? 0) / (guestTotal ?? 1)) * 100) : 0;
  const startDate = event.start_at ? new Date(event.start_at) : null;
  const daysUntil = startDate ? Math.ceil((startDate.getTime() - Date.now()) / 86_400_000) : null;
  const readinessScore = Math.round(
    taskCompletionPct * 0.30 + supplierReadinessPct * 0.25 +
    guestConfirmPct * 0.15 + (budgetUsedPct > 0 && budgetUsedPct <= 100 ? 80 : 60) * 0.15 + 70 * 0.15
  );
  const readinessDimensions = [
    { label: "Planning",   value: taskCompletionPct,   color: "bg-brand-500" },
    { label: "Suppliers",  value: supplierReadinessPct, color: "bg-violet-500" },
    { label: "Finance",    value: budgetUsedPct <= 100 ? 85 : 60, color: "bg-success-500" },
    { label: "Logistics",  value: 80,                  color: "bg-amber-500" },
    { label: "Marketing",  value: guestConfirmPct,      color: "bg-blue-500" },
  ];

  /* alerts */
  const alerts: { level: "high" | "medium" | "low"; msg: string }[] = [];
  if (budgetUsedPct > 90) alerts.push({ level: "high", msg: `Budget ${budgetUsedPct}% used` });
  if ((supplierTotal ?? 0) - (supplierConfirmed ?? 0) > 0)
    alerts.push({ level: "medium", msg: `${(supplierTotal ?? 0) - (supplierConfirmed ?? 0)} suppliers unconfirmed` });
  if ((taskTotal ?? 0) - (taskDone ?? 0) > 10)
    alerts.push({ level: "low", msg: `${(taskTotal ?? 0) - (taskDone ?? 0)} tasks remaining` });
  const alertCounts = {
    high:   alerts.filter(a => a.level === "high").length,
    medium: alerts.filter(a => a.level === "medium").length,
    low:    alerts.filter(a => a.level === "low").length,
  };

  function priorityBadge(p: string | null) {
    if (p === "high" || p === "urgent") return "bg-danger-100 text-danger-700";
    if (p === "medium") return "bg-warning-100 text-warning-700";
    return "bg-surface-100 text-surface-500";
  }

  const ev = event as Record<string, unknown>;

  return (
    <div className="space-y-5 p-5 pb-12 animate-fade-in">

      {/* ── 6 KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Total Revenue" value={gbp(ticketRevenue)} sub="Ticket revenue"
          icon={TrendingUp} iconBg="bg-success-50" iconColor="text-success-600"
          trend="up" trendLabel="From ticket sales"
          barPct={budget > 0 ? Math.min(Math.round((ticketRevenue / budget) * 100), 100) : 0}
          barColor="bg-success-500"
        />
        <KpiCard
          label="Budget" value={gbp(budget)}
          sub={budget > 0 ? `${budgetUsedPct}% spent · ${gbp(totalSpent)}` : "No budget set"}
          icon={Wallet}
          iconBg={budgetUsedPct > 90 ? "bg-danger-50" : "bg-amber-50"}
          iconColor={budgetUsedPct > 90 ? "text-danger-600" : "text-amber-600"}
          barPct={budgetUsedPct} barColor={budgetUsedPct > 90 ? "bg-danger-500" : "bg-amber-500"}
        />
        <KpiCard
          label="Tickets Sold"
          value={ticketsTotal > 0 ? `${num(ticketsSold)} / ${num(ticketsTotal)}` : num(ticketsSold)}
          sub={ticketsTotal > 0 ? `${pct(ticketsSold, ticketsTotal)} capacity` : "No tiers set up"}
          icon={Ticket} iconBg="bg-blue-50" iconColor="text-blue-600"
          barPct={ticketsTotal > 0 ? Math.round((ticketsSold / ticketsTotal) * 100) : 0}
          barColor="bg-blue-500"
        />
        <KpiCard
          label="VIP Guests" value={num(guestVip)}
          sub={guestVip ? `of ${num(guestTotal)} total` : "No VIPs tagged"}
          icon={Star} iconBg="bg-amber-50" iconColor="text-amber-500"
          trend="up" trendLabel="VIP allocation"
        />
        <KpiCard
          label="Supplier Readiness" value={`${supplierReadinessPct}%`}
          sub={supplierReadinessPct >= 90 ? "On track" : "Action needed"}
          icon={Building2} iconBg="bg-violet-50" iconColor="text-violet-600"
          barPct={supplierReadinessPct} barColor="bg-violet-500"
        />
        <KpiCard
          label="Task Completion" value={`${taskCompletionPct}%`}
          sub={`${taskDone ?? 0} of ${taskTotal ?? 0} done`}
          icon={CheckCircle2} iconBg="bg-brand-50" iconColor="text-brand-600"
          barPct={taskCompletionPct} barColor="bg-brand-500"
        />
      </div>

      {/* ── Main row: Readiness | Tickets | Actions + Run-sheet ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Readiness card */}
        <div className="xl:col-span-3 rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Event Readiness Score</h3>
          <div className="flex items-center justify-center mb-4">
            <DonutChart
              pct={readinessScore} size={120} stroke={12}
              color={readinessScore > 80 ? "#22c55e" : readinessScore > 60 ? "#f59e0b" : "#ef4444"}
              label={`${readinessScore}`} sublabel="/100"
            />
          </div>
          <p className={`text-center text-xs font-semibold mb-4 ${readinessScore > 80 ? "text-success-600" : readinessScore > 60 ? "text-warning-600" : "text-danger-600"}`}>
            {readinessScore > 80 ? "Excellent" : readinessScore > 60 ? "Good progress" : "Action needed"}
          </p>
          <div className="space-y-2.5">
            {readinessDimensions.map(d => (
              <div key={d.label} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-surface-500">{d.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.value}%` }} />
                </div>
                <span className="w-10 text-right text-surface-500 tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>

          {/* Guest mix mini-donut */}
          {(guestTotal ?? 0) > 0 && (
            <div className="mt-5 pt-4 border-t border-surface-100">
              <p className="text-xs font-semibold text-surface-700 mb-3">Guest Mix</p>
              <div className="flex items-center gap-4">
                <DonutChart pct={guestConfirmPct} size={64} stroke={8} color="#4f46e5" label={`${guestConfirmed ?? 0}`} sublabel="conf." />
                <div className="text-xs space-y-1.5 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
                    <span className="text-surface-600">Confirmed</span>
                    <span className="ml-auto font-semibold text-surface-800">{guestConfirmed ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-surface-600">VIP</span>
                    <span className="ml-auto font-semibold text-surface-800">{guestVip ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-surface-300 shrink-0" />
                    <span className="text-surface-600">Total</span>
                    <span className="ml-auto font-semibold text-surface-800">{guestTotal ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ticket sales */}
        <div className="xl:col-span-5 rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-surface-900">Ticket Sales Breakdown</h3>
            <span className="text-xs text-surface-400">By tier</span>
          </div>

          {(tiers ?? []).length > 0 ? (
            <>
              <div className="space-y-3 mb-5">
                {(tiers ?? []).map(tier => (
                  <MiniBar key={tier.name} label={tier.name ?? "Tier"} value={tier.sold ?? 0} max={tier.quantity ?? 0} color="bg-brand-500" />
                ))}
              </div>
              <div className="rounded-lg bg-surface-50 border border-surface-100 p-3 flex items-center gap-5 text-xs">
                <div>
                  <p className="text-surface-500">Sold</p>
                  <p className="text-lg font-bold text-surface-900 leading-tight">{num(ticketsSold)}</p>
                </div>
                {ticketsTotal > 0 && <>
                  <div>
                    <p className="text-surface-500">Remaining</p>
                    <p className="text-lg font-bold text-surface-900 leading-tight">{num(ticketsTotal - ticketsSold)}</p>
                  </div>
                  <div>
                    <p className="text-surface-500">Capacity</p>
                    <p className="text-lg font-bold text-surface-900 leading-tight">{num(ticketsTotal)}</p>
                  </div>
                  <div className="ml-auto">
                    <div className="h-1.5 w-28 rounded-full bg-surface-200 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(Math.round((ticketsSold / ticketsTotal) * 100), 100)}%` }} />
                    </div>
                    <p className="text-surface-400 text-right mt-0.5">{pct(ticketsSold, ticketsTotal)} sold</p>
                  </div>
                </>}
              </div>
              {(tiers ?? []).length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(tiers ?? []).map(tier => (
                    <div key={tier.name} className="rounded-lg bg-surface-50 p-2.5">
                      <p className="text-[11px] text-surface-500 truncate">{tier.name}</p>
                      <p className="text-sm font-bold text-surface-900 mt-0.5">{gbp((tier.sold ?? 0) * (tier.price_cents ?? 0))}</p>
                      <p className="text-[10px] text-surface-400">{tier.sold ?? 0} × {gbp(tier.price_cents)}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Ticket className="h-10 w-10 text-surface-200 mb-3" />
              <p className="text-sm font-medium text-surface-700">No ticket tiers yet</p>
              <p className="text-xs text-surface-400 mt-1">Add ticket types to start tracking sales</p>
              <a href={`/event-manager/events/${eventId}/tickets`} className="mt-3 text-xs text-brand-600 font-medium hover:underline">
                Set up tickets →
              </a>
            </div>
          )}
        </div>

        {/* Next actions + run-sheet */}
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-4 py-3.5 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Next Actions</h3>
              <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-bold text-warning-700">{(openTasks ?? []).length}</span>
            </div>
            <ul className="divide-y divide-surface-100">
              {(openTasks ?? []).length === 0 ? (
                <li className="px-4 py-5 text-center text-sm text-surface-400">All tasks complete!</li>
              ) : (openTasks ?? []).map((t, i) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-surface-100 flex items-center justify-center text-[10px] font-bold text-surface-500 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-surface-900 truncate font-medium">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.due_at && (
                        <p className="text-[11px] text-surface-400">
                          Due {new Date(t.due_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                      )}
                      {t.priority && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${priorityBadge(t.priority as string)}`}>
                          {(t.priority as string).charAt(0).toUpperCase() + (t.priority as string).slice(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-surface-50">
              <a href={`/event-manager/events/${eventId}/tasks`} className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
                View all tasks <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-4 py-3.5 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Run-sheet</h3>
              <Clock className="h-3.5 w-3.5 text-surface-400" />
            </div>
            <ul className="divide-y divide-surface-100">
              {(scheduleItems ?? []).length === 0 ? (
                <li className="px-4 py-4 text-sm text-center text-surface-400">No schedule items yet</li>
              ) : (scheduleItems ?? []).map(item => {
                const startTime = item.starts_at
                  ? new Date(item.starts_at as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : null;
                const endTime = item.starts_at && item.duration_minutes
                  ? new Date(new Date(item.starts_at as string).getTime() + (item.duration_minutes as number) * 60_000)
                      .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : null;
                const laneLabel = item.lane ? String(item.lane).replace(/_/g, " ") : null;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-success-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-surface-900 truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-surface-400">
                        {startTime && <span>{startTime}{endTime && ` – ${endTime}`}</span>}
                        {laneLabel && <span className="capitalize truncate">{laneLabel}</span>}
                      </div>
                    </div>
                    {item.section && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-600 shrink-0">{item.section}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-2 border-t border-surface-50">
              <a href={`/event-manager/events/${eventId}/schedule`} className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
                Full run-sheet <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status cards row: guests | venue | livestream | weather | risk ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">

        {/* Guest gallery */}
        <div className="xl:col-span-2 rounded-xl border border-surface-200 bg-white shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-surface-900">Guest Gallery</h3>
            <span className="text-xs text-surface-400">{num(guestTotal)} invited</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden" style={{ background: ["linear-gradient(135deg,#4f46e5,#7c3aed)","linear-gradient(135deg,#0ea5e9,#2563eb)","linear-gradient(135deg,#10b981,#059669)","linear-gradient(135deg,#f59e0b,#d97706)","linear-gradient(135deg,#ec4899,#be185d)","linear-gradient(135deg,#8b5cf6,#6d28d9)","linear-gradient(135deg,#f97316,#ea580c)"][i % 7] }}>
                <div className="w-full h-full flex items-center justify-center">
                  <UserCheck className="h-4 w-4 text-white/70" />
                </div>
              </div>
            ))}
            {(guestTotal ?? 0) > 7 && (
              <div className="aspect-square rounded-lg bg-surface-100 flex items-center justify-center">
                <span className="text-[10px] font-bold text-surface-500">+{num((guestTotal ?? 0) - 7)}</span>
              </div>
            )}
          </div>
          <a href={`/event-manager/events/${eventId}/guests`} className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline">
            View all guests <ArrowRight className="h-3 w-3" />
          </a>
        </div>

        {/* Venue */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-brand-500" strokeWidth={1.8} />
            <h3 className="text-sm font-semibold text-surface-900">Venue</h3>
          </div>
          {ev.venue_name_snapshot || ev.location ? (
            <>
              <p className="text-sm font-semibold text-surface-900 leading-tight">{(ev.venue_name_snapshot ?? ev.location) as string}</p>
              {ev.venue_address_snapshot && <p className="text-xs text-surface-500 mt-1 leading-relaxed">{ev.venue_address_snapshot as string}</p>}
              <div className="mt-3 rounded-lg bg-surface-100 h-20 flex items-center justify-center border border-surface-200">
                <div className="text-center">
                  <MapPin className="h-5 w-5 text-surface-300 mx-auto" />
                  <p className="text-[10px] text-surface-400 mt-1">Map view</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-surface-400">No venue set</p>
          )}
          <a href={`/event-manager/events/${eventId}/floor-plan`} className="mt-3 flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline">
            Floor plan <ArrowRight className="h-3 w-3" />
          </a>
        </div>

        {/* Livestream */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="h-4 w-4 text-danger-500" strokeWidth={1.8} />
            <h3 className="text-sm font-semibold text-surface-900">Livestream</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <Radio className="h-8 w-8 text-surface-200 mb-2" />
            <p className="text-xs text-surface-400">Not live</p>
            <p className="text-[11px] text-surface-300 mt-0.5">
              {ev.has_livestream ? "Stream pending" : "No stream planned"}
            </p>
          </div>
        </div>

        {/* Weather + Risk */}
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <CloudSun className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
              <h3 className="text-xs font-semibold text-surface-900">Weather</h3>
            </div>
            <p className="text-2xl font-bold text-surface-900">—</p>
            <p className="text-[11px] text-surface-400 mt-0.5">
              {startDate ? startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "No event date"}
            </p>
            {startDate && daysUntil !== null && daysUntil > 7 && (
              <p className="text-[10px] text-surface-400 mt-1">Forecast available closer to event</p>
            )}
          </div>

          <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-4 w-4 text-danger-500" strokeWidth={1.8} />
              <h3 className="text-xs font-semibold text-surface-900">Risk & Alerts</h3>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-center">
                <p className="text-lg font-bold text-danger-600">{alertCounts.high}</p>
                <p className="text-[10px] text-surface-400">High</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-warning-600">{alertCounts.medium}</p>
                <p className="text-[10px] text-surface-400">Med</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-surface-400">{alertCounts.low}</p>
                <p className="text-[10px] text-surface-400">Low</p>
              </div>
            </div>
            {alerts.slice(0, 1).map((a, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertCircle className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${a.level === "high" ? "text-danger-500" : a.level === "medium" ? "text-warning-500" : "text-surface-400"}`} />
                <p className="text-[11px] text-surface-700 leading-tight">{a.msg}</p>
              </div>
            ))}
            {alerts.length === 0 && <p className="text-[11px] text-success-600 font-medium">✓ No active alerts</p>}
          </div>
        </div>
      </div>

      {/* ── AI Insights ── */}
      <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" strokeWidth={1.8} />
          </div>
          <h3 className="text-sm font-semibold text-surface-900">AI Event Insights</h3>
          <span className="ml-auto text-xs text-brand-600 font-medium">Powered by Copilot</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Ticket, color: "text-success-600", bg: "bg-success-50", title: "Ticket momentum", body: "Sales velocity is healthy. A second push with personalised invites could close the remaining capacity." },
            { icon: Building2, color: "text-warning-600", bg: "bg-warning-50", title: "Supplier contracts", body: `${(supplierTotal ?? 0) - (supplierConfirmed ?? 0)} supplier(s) still pending. Contract delays past T-30 increase risk significantly.` },
            { icon: Users, color: "text-blue-600", bg: "bg-blue-50", title: "Guest invitations", body: "Based on your event date, the second invitation wave should go out within 5 days to give guests sufficient notice." },
          ].map((insight, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-white border border-surface-100 px-4 py-3.5 shadow-sm">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${insight.bg}`}>
                <insight.icon className={`h-4 w-4 ${insight.color}`} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-surface-900">{insight.title}</p>
                <p className="mt-0.5 text-xs text-surface-500 leading-relaxed">{insight.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom row: Sponsors | Quick Links | Team Activity ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Sponsors */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Sponsors & Partners</h3>
          <div className="flex flex-wrap gap-3 items-center">
            {["Platinum Sponsor", "Gold Partner", "Media Partner", "Tech Partner"].map(name => (
              <div key={name} className="h-8 px-3 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-center">
                <span className="text-xs font-semibold text-surface-400">{name}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-50 border border-surface-100 px-3 py-2">
            <Zap className="h-3.5 w-3.5 text-brand-500" />
            <span className="text-xs text-surface-600">Manage sponsorship in the Event Brief</span>
            <a href={`/event-manager/events/${eventId}/brief`} className="ml-auto text-xs text-brand-600 hover:underline font-medium">Brief →</a>
          </div>
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Quick Links</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Floor Plan",   href: "floor-plan",       icon: Layout },
              { label: "Run Sheet",    href: "schedule",          icon: CalendarDays },
              { label: "Documents",    href: "documents-media",   icon: FileText },
              { label: "Mood Board",   href: "mood-board",        icon: Star },
              { label: "Guest List",   href: "guests",            icon: Users },
              { label: "Comms Centre", href: "comms",             icon: MessageSquare },
            ].map(({ label, href, icon: Icon }) => (
              <a key={href} href={`/event-manager/events/${eventId}/${href}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 bg-surface-50 border border-surface-100 hover:bg-surface-100 transition-colors"
              >
                <Icon className="h-3.5 w-3.5 text-brand-500 shrink-0" strokeWidth={1.8} />
                <span className="text-xs font-medium text-surface-700">{label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Team activity */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-900">Team Activity</h3>
            <BarChart3 className="h-3.5 w-3.5 text-surface-400" />
          </div>
          <ul className="divide-y divide-surface-50">
            {(recentActivity ?? []).length === 0 ? (
              <li className="px-5 py-5 text-sm text-center text-surface-400">No activity yet</li>
            ) : (recentActivity ?? []).map((a: Record<string, unknown>) => (
              <li key={a.id as string} className="flex items-start gap-3 px-5 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 text-[10px] font-bold shrink-0 mt-0.5">
                  {((a.actor_name as string) ?? (a.action as string) ?? "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-surface-700 leading-relaxed">
                    <span className="font-semibold text-surface-900">{(a.actor_name as string) ?? "System"}</span>{" "}
                    {(a.note as string) ?? (a.action as string)}
                  </p>
                  <p className="text-[10px] text-surface-400 mt-0.5">
                    {new Date(a.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-5 py-2 border-t border-surface-50">
            <a href={`/event-manager/events/${eventId}/activity`} className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
              View all activity <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
