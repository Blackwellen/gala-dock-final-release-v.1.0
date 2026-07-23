import type { ElementType, ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  Users, Wallet, CheckCircle2, Clock,
  Building2, MapPin, Ticket, TrendingUp, ArrowRight,
  Radio, Sparkles, UserCheck,
  FileText, Layout, MessageSquare, CalendarDays,
  ChevronRight, Activity, Target, AlertTriangle,
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

/* ─── Shared primitives ──────────────────────────────────────────────────── */

function SectionHeader({
  title, sub, href, hrefLabel = "View all",
  action,
}: {
  title: string; sub?: string; href?: string; hrefLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-surface-900 leading-tight">{title}</h3>
        {sub && <p className="text-[11px] text-surface-400 mt-0.5">{sub}</p>}
      </div>
      {action ?? (href && (
        <a href={href} className="flex items-center gap-0.5 text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors shrink-0">
          {hrefLabel}
          <ChevronRight className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, iconBg, iconColor,
  trendLabel, trendUp, barPct, barColor, accent,
}: {
  label: string; value: string; sub?: string; icon: ElementType;
  iconBg: string; iconColor: string;
  trendLabel?: string; trendUp?: boolean; barPct?: number; barColor?: string;
  accent?: string;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-card flex flex-col gap-2 ${accent ?? "border-surface-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-surface-400">{label}</p>
          <p className="mt-1.5 text-[24px] font-bold text-surface-900 tracking-tight leading-none">{value}</p>
          {sub && <p className="mt-1 text-[11px] text-surface-400 leading-tight">{sub}</p>}
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} strokeWidth={1.8} />
        </span>
      </div>
      {trendLabel && (
        <p className={`text-[10.5px] font-medium flex items-center gap-1 ${trendUp === true ? "text-success-600" : trendUp === false ? "text-danger-600" : "text-surface-400"}`}>
          {trendUp === true && "↑"}{trendUp === false && "↓"} {trendLabel}
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
        <span className="text-[18px] font-bold text-surface-900 leading-none">{label}</span>
        {sublabel && <span className="text-[9px] text-surface-400 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}

function StatusDot({ color }: { color: "green" | "amber" | "red" | "gray" }) {
  const map = {
    green: "bg-success-500",
    amber: "bg-amber-500",
    red: "bg-danger-500",
    gray: "bg-surface-300",
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${map[color]}`} />;
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
    supabase.from("event_activity").select("*").eq("workspace_id", workspaceId).eq("event_id", eventId).order("created_at", { ascending: false }).limit(8),
    supabase.from("event_tasks").select("id, title, status, priority, due_at").eq("workspace_id", workspaceId).eq("event_id", eventId).neq("status", "completed").is("archived_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(6),
    supabase.from("event_run_sheet_items").select("id, title, starts_at, duration_minutes, section, lane").eq("workspace_id", workspaceId).eq("event_id", eventId).order("position", { ascending: true }).limit(6),
  ]);

  /* ── Computed values ── */
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

  /* ── Alerts ── */
  const alerts: { level: "high" | "medium" | "low"; msg: string }[] = [];
  if (budgetUsedPct > 90) alerts.push({ level: "high", msg: `Budget ${budgetUsedPct}% used — near limit` });
  if (budgetUsedPct > 100) alerts.push({ level: "high", msg: "Budget exceeded" });
  if ((supplierTotal ?? 0) - (supplierConfirmed ?? 0) > 0)
    alerts.push({ level: "medium", msg: `${(supplierTotal ?? 0) - (supplierConfirmed ?? 0)} supplier${(supplierTotal ?? 0) - (supplierConfirmed ?? 0) !== 1 ? "s" : ""} unconfirmed` });
  if (daysUntil !== null && daysUntil < 14 && (taskTotal ?? 0) - (taskDone ?? 0) > 5)
    alerts.push({ level: "high", msg: `${(taskTotal ?? 0) - (taskDone ?? 0)} tasks open with ${daysUntil}d to go` });
  if ((taskTotal ?? 0) - (taskDone ?? 0) > 10)
    alerts.push({ level: "low", msg: `${(taskTotal ?? 0) - (taskDone ?? 0)} tasks still open` });
  const alertCounts = {
    high:   alerts.filter(a => a.level === "high").length,
    medium: alerts.filter(a => a.level === "medium").length,
    low:    alerts.filter(a => a.level === "low").length,
  };

  /* ── Readiness dimensions ── */
  const readinessDimensions = [
    { label: "Planning",   value: taskCompletionPct,   color: "bg-brand-500" },
    { label: "Suppliers",  value: supplierReadinessPct, color: "bg-violet-500" },
    { label: "Finance",    value: budgetUsedPct <= 100 ? 85 : 60, color: "bg-success-500" },
    { label: "Logistics",  value: 80,                  color: "bg-amber-500" },
    { label: "Marketing",  value: guestConfirmPct,      color: "bg-blue-500" },
  ];

  function priorityBadge(p: string | null) {
    if (p === "high" || p === "urgent") return "bg-danger-50 text-danger-700 border border-danger-100";
    if (p === "medium") return "bg-warning-50 text-warning-700 border border-warning-100";
    return "bg-surface-50 text-surface-500 border border-surface-100";
  }

  const ev = event as Record<string, unknown>;

  /* ── Venue static map ── */
  const KNOWN_VENUE_COORDS: Record<string, [number, number]> = {
    "excel london":      [51.5079, 0.0332],
    "olympia london":    [51.4965, -0.2108],
    "o2 arena":          [51.5030, 0.0032],
    "royal albert hall": [51.5009, -0.1776],
    "barbican centre":   [51.5205, -0.0933],
    "tate modern":       [51.5076, -0.0994],
    "wembley":           [51.5560, -0.2796],
    "alexandra palace":  [51.5949, -0.1295],
  };
  const venueNameRaw = ((ev.venue_name_snapshot ?? ev.location ?? "") as string).toLowerCase();
  const venueCoords = Object.entries(KNOWN_VENUE_COORDS).find(([k]) => venueNameRaw.includes(k))?.[1] ?? [51.5079, 0.0332];
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
  const venueMapSrc = mapTilerKey
    ? `https://api.maptiler.com/maps/streets-v2/static/${venueCoords[1]},${venueCoords[0]},14/400x160.png?key=${mapTilerKey}&attribution=false`
    : null;

  /* ── AI insight generation (data-grounded) ── */
  const aiInsights: { icon: ElementType; color: string; bg: string; title: string; body: string; score?: number }[] = [];

  if (ticketsTotal > 0) {
    const vel = Math.round((ticketsSold / ticketsTotal) * 100);
    aiInsights.push({
      icon: Ticket, color: "text-success-600", bg: "bg-success-50",
      title: "Ticket momentum",
      body: vel >= 80
        ? "Sales velocity is strong. A final push targeting waitlisted contacts could help you hit full capacity."
        : vel >= 50
        ? `At ${vel}% sold, a second invitation wave with a personalised nudge could close the remaining ${ticketsTotal - ticketsSold} spots.`
        : `Ticket sales at ${vel}% — consider early-bird promotions or a targeted invite campaign to drive registrations.`,
      score: vel,
    });
  }

  if ((supplierTotal ?? 0) > 0) {
    const unconfirmed = (supplierTotal ?? 0) - (supplierConfirmed ?? 0);
    aiInsights.push({
      icon: Building2, color: "text-warning-600", bg: "bg-warning-50",
      title: "Supplier contracts",
      body: unconfirmed === 0
        ? "All suppliers are confirmed. Review briefs and share run-sheet access ahead of the event."
        : `${unconfirmed} supplier${unconfirmed !== 1 ? "s" : ""} still pending. Contract delays beyond T-30 significantly increase delivery risk.`,
      score: supplierReadinessPct,
    });
  }

  if ((guestTotal ?? 0) > 0) {
    const daysLabel = daysUntil !== null ? ` with ${daysUntil} day${daysUntil !== 1 ? "s" : ""} to go` : "";
    aiInsights.push({
      icon: Users, color: "text-blue-600", bg: "bg-blue-50",
      title: "Guest invitations",
      body: guestConfirmPct >= 80
        ? `${guestConfirmPct}% confirmed${daysLabel}. Start preparing check-in packs and dietary requirements.`
        : guestConfirmPct >= 50
        ? `${guestConfirmPct}% confirmed${daysLabel}. A reminder wave to pending guests typically lifts confirmation rates by 15–25%.`
        : `Guest confirmations at ${guestConfirmPct}%${daysLabel}. Prioritise outreach to ensure accurate catering and seating plans.`,
      score: guestConfirmPct,
    });
  }

  if (aiInsights.length === 0) {
    aiInsights.push(
      { icon: Target, color: "text-brand-600", bg: "bg-brand-50", title: "Set your targets", body: "Add ticket tiers, invite your first guests, and assign suppliers to start generating AI-powered readiness insights." },
      { icon: Sparkles, color: "text-violet-600", bg: "bg-violet-50", title: "AI is watching", body: "As your event data grows, Copilot will surface data-driven signals, risks, and recommendations here." },
    );
  }

  return (
    <div className="space-y-5 p-5 lg:p-6 pb-12 animate-fade-in">

      {/* ── KPI strip (7 cards: days + 6 key metrics) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">

        {/* Days until — featured card */}
        <div className={`rounded-xl border p-4 shadow-card col-span-1 flex flex-col gap-1 ${
          daysUntil === null ? "bg-surface-50 border-surface-200" :
          daysUntil < 0 ? "bg-surface-50 border-surface-200" :
          daysUntil < 7 ? "bg-danger-50 border-danger-200" :
          daysUntil < 30 ? "bg-warning-50 border-warning-200" :
          "bg-white border-surface-200"
        }`}>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-surface-400">Event in</p>
          <p className={`text-[26px] font-extrabold leading-none tracking-tight ${
            daysUntil === null ? "text-surface-400" :
            daysUntil < 0 ? "text-surface-400" :
            daysUntil < 7 ? "text-danger-700" :
            daysUntil < 30 ? "text-warning-700" :
            "text-surface-900"
          }`}>
            {daysUntil === null ? "—" : daysUntil < 0 ? "Past" : daysUntil === 0 ? "Today" : daysUntil}
          </p>
          <p className="text-[11px] text-surface-400 mt-0.5">
            {daysUntil === null ? "No date set" : daysUntil < 0 ? "event ended" : daysUntil === 0 ? "Event day!" : "days to go"}
          </p>
          {startDate && (
            <p className="text-[10px] text-surface-300 mt-0.5">
              {startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        <KpiCard
          label="Revenue" value={gbp(ticketRevenue)} sub="Ticket income"
          icon={TrendingUp} iconBg="bg-success-50" iconColor="text-success-600"
          trendLabel="From ticket sales" trendUp={ticketRevenue > 0}
          barPct={budget > 0 ? Math.min(Math.round((ticketRevenue / budget) * 100), 100) : 0}
          barColor="bg-success-500"
        />
        <KpiCard
          label="Budget" value={gbp(budget)}
          sub={budget > 0 ? `${budgetUsedPct}% spent · ${gbp(totalSpent)}` : "No budget set"}
          icon={Wallet}
          iconBg={budgetUsedPct > 90 ? "bg-danger-50" : "bg-amber-50"}
          iconColor={budgetUsedPct > 90 ? "text-danger-600" : "text-amber-600"}
          trendLabel={budgetUsedPct > 100 ? "Over budget" : budgetUsedPct > 80 ? "Running high" : "Within budget"}
          trendUp={budgetUsedPct <= 80}
          barPct={budgetUsedPct} barColor={budgetUsedPct > 90 ? "bg-danger-500" : "bg-amber-500"}
        />
        <KpiCard
          label="Tickets Sold"
          value={ticketsTotal > 0 ? `${num(ticketsSold)}` : num(ticketsSold)}
          sub={ticketsTotal > 0 ? `of ${num(ticketsTotal)} · ${pct(ticketsSold, ticketsTotal)} capacity` : "No tiers set up"}
          icon={Ticket} iconBg="bg-blue-50" iconColor="text-blue-600"
          barPct={ticketsTotal > 0 ? Math.round((ticketsSold / ticketsTotal) * 100) : 0}
          barColor="bg-blue-500"
        />
        <KpiCard
          label="Guests" value={num(guestTotal)}
          sub={`${guestConfirmed ?? 0} confirmed · ${guestVip ?? 0} VIP`}
          icon={Users} iconBg="bg-indigo-50" iconColor="text-indigo-600"
          trendLabel={`${guestConfirmPct}% confirmed`} trendUp={guestConfirmPct > 50}
        />
        <KpiCard
          label="Suppliers" value={`${supplierReadinessPct}%`}
          sub={`${supplierConfirmed ?? 0} of ${supplierTotal ?? 0} confirmed`}
          icon={Building2} iconBg="bg-violet-50" iconColor="text-violet-600"
          barPct={supplierReadinessPct} barColor="bg-violet-500"
          trendLabel={supplierReadinessPct >= 90 ? "On track" : "Action needed"}
          trendUp={supplierReadinessPct >= 90}
        />
        <KpiCard
          label="Tasks Done" value={`${taskCompletionPct}%`}
          sub={`${taskDone ?? 0} of ${taskTotal ?? 0} complete`}
          icon={CheckCircle2} iconBg="bg-brand-50" iconColor="text-brand-600"
          barPct={taskCompletionPct} barColor="bg-brand-500"
          trendLabel={`${(taskTotal ?? 0) - (taskDone ?? 0)} remaining`}
          trendUp={taskCompletionPct > 50}
        />
      </div>

      {/* ── Main analysis row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Readiness score */}
        <div className="xl:col-span-3 rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <SectionHeader title="Event Readiness" sub="Composite delivery score" />
          <div className="flex items-center justify-center mb-4">
            <DonutChart
              pct={readinessScore} size={112} stroke={11}
              color={readinessScore > 80 ? "#22c55e" : readinessScore > 60 ? "#f59e0b" : "#ef4444"}
              label={`${readinessScore}`} sublabel="/ 100"
            />
          </div>
          <div className={`text-center text-[11px] font-semibold mb-4 px-3 py-1.5 rounded-full inline-flex mx-auto items-center gap-1.5 ${
            readinessScore > 80 ? "bg-success-50 text-success-700" :
            readinessScore > 60 ? "bg-warning-50 text-warning-700" :
            "bg-danger-50 text-danger-700"
          }`}>
            <StatusDot color={readinessScore > 80 ? "green" : readinessScore > 60 ? "amber" : "red"} />
            {readinessScore > 80 ? "Excellent — on track" : readinessScore > 60 ? "Good progress" : "Action needed"}
          </div>

          <div className="space-y-2.5 mt-2">
            {readinessDimensions.map(d => (
              <div key={d.label} className="flex items-center gap-2.5 text-[11px]">
                <span className="w-[72px] shrink-0 text-surface-500 font-medium">{d.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.value}%` }} />
                </div>
                <span className="w-8 text-right text-surface-400 tabular-nums font-semibold">{d.value}</span>
              </div>
            ))}
          </div>

          {(guestTotal ?? 0) > 0 && (
            <div className="mt-4 pt-4 border-t border-surface-100">
              <p className="text-[11px] font-semibold text-surface-600 mb-3">Guest Mix</p>
              <div className="flex items-center gap-3">
                <DonutChart pct={guestConfirmPct} size={56} stroke={7} color="#4f46e5" label={`${guestConfirmed ?? 0}`} />
                <div className="text-[11px] space-y-1.5 flex-1">
                  <div className="flex items-center gap-1.5">
                    <StatusDot color="green" />
                    <span className="text-surface-500">Confirmed</span>
                    <span className="ml-auto font-semibold text-surface-800">{guestConfirmed ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot color="amber" />
                    <span className="text-surface-500">VIP</span>
                    <span className="ml-auto font-semibold text-surface-800">{guestVip ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot color="gray" />
                    <span className="text-surface-500">Total invited</span>
                    <span className="ml-auto font-semibold text-surface-800">{guestTotal ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ticket sales */}
        <div className="xl:col-span-5 rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <SectionHeader title="Ticket Sales" sub={ticketsTotal > 0 ? `${num(ticketsSold)} sold of ${num(ticketsTotal)} capacity` : "No ticket tiers configured"} href={`/event-manager/events/${eventId}/tickets`} hrefLabel="Manage tickets" />

          {(tiers ?? []).length > 0 ? (
            <>
              {/* Tier breakdown bars */}
              <div className="space-y-3 mb-5">
                {(tiers ?? []).map((tier, i) => {
                  const tierPct = (tier.quantity ?? 0) > 0 ? Math.round(((tier.sold ?? 0) / (tier.quantity ?? 0)) * 100) : 0;
                  const colors = ["bg-brand-500", "bg-violet-500", "bg-blue-500", "bg-success-500", "bg-amber-500"];
                  return (
                    <div key={tier.name} className="flex items-center gap-3 text-[11px]">
                      <span className="w-28 shrink-0 text-surface-600 truncate font-medium">{tier.name ?? "Tier"}</span>
                      <div className="flex-1 h-2 rounded-full bg-surface-100 overflow-hidden">
                        <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${tierPct}%` }} />
                      </div>
                      <span className="w-20 text-right text-surface-500 tabular-nums">{tier.sold ?? 0} / {tier.quantity ?? 0}</span>
                    </div>
                  );
                })}
              </div>

              {/* Summary row */}
              <div className="rounded-xl bg-surface-50 border border-surface-100 p-3.5 grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider font-semibold">Sold</p>
                  <p className="text-base font-bold text-surface-900 leading-tight mt-0.5">{num(ticketsSold)}</p>
                </div>
                {ticketsTotal > 0 && <>
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider font-semibold">Remaining</p>
                    <p className="text-base font-bold text-surface-900 leading-tight mt-0.5">{num(ticketsTotal - ticketsSold)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider font-semibold">Capacity</p>
                    <p className="text-base font-bold text-surface-900 leading-tight mt-0.5">{num(ticketsTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider font-semibold">Revenue</p>
                    <p className="text-base font-bold text-success-700 leading-tight mt-0.5">{gbp(ticketRevenue)}</p>
                  </div>
                </>}
              </div>

              {/* Tier revenue cards */}
              {(tiers ?? []).length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(tiers ?? []).map(tier => (
                    <div key={tier.name} className="rounded-lg bg-white border border-surface-100 p-2.5 shadow-sm">
                      <p className="text-[10.5px] text-surface-500 truncate font-medium">{tier.name}</p>
                      <p className="text-sm font-bold text-surface-900 mt-0.5">{gbp((tier.sold ?? 0) * (tier.price_cents ?? 0))}</p>
                      <p className="text-[10px] text-surface-400">{tier.sold ?? 0} × {gbp(tier.price_cents)}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Ticket className="h-10 w-10 text-surface-200 mb-3" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-surface-700">No ticket tiers yet</p>
              <p className="text-xs text-surface-400 mt-1">Add ticket types to start tracking sales</p>
              <a href={`/event-manager/events/${eventId}/tickets`}
                className="mt-3 inline-flex items-center gap-1 text-xs text-white bg-brand-600 hover:bg-brand-700 font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Set up tickets <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* Next actions + run-sheet */}
        <div className="xl:col-span-4 space-y-4">
          {/* Next actions */}
          <div className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-4 py-3.5 border-b border-surface-100">
              <SectionHeader
                title="Next Actions"
                sub={`${(openTasks ?? []).length} open task${(openTasks ?? []).length !== 1 ? "s" : ""}`}
                href={`/event-manager/events/${eventId}/tasks`}
              />
            </div>
            <ul className="divide-y divide-surface-50">
              {(openTasks ?? []).length === 0 ? (
                <li className="px-4 py-6 text-center">
                  <CheckCircle2 className="h-7 w-7 text-success-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-success-700">All tasks complete!</p>
                </li>
              ) : (openTasks ?? []).map((t, i) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-50/60 transition-colors">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-surface-100 flex items-center justify-center text-[9px] font-bold text-surface-500 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-surface-900 truncate font-medium leading-snug">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.due_at && (
                        <p className="text-[10px] text-surface-400">
                          {new Date(t.due_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                      )}
                      {t.priority && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${priorityBadge(t.priority as string)}`}>
                          {(t.priority as string).charAt(0).toUpperCase() + (t.priority as string).slice(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Run-sheet preview */}
          <div className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-4 py-3.5 border-b border-surface-100">
              <SectionHeader
                title="Run-sheet Preview"
                sub={(scheduleItems ?? []).length > 0 ? `${(scheduleItems ?? []).length} items` : "No items yet"}
                href={`/event-manager/events/${eventId}/schedule`}
              />
            </div>
            <ul className="divide-y divide-surface-50">
              {(scheduleItems ?? []).length === 0 ? (
                <li className="px-4 py-6 text-center">
                  <Clock className="h-7 w-7 text-surface-200 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-xs text-surface-400">No schedule items yet</p>
                </li>
              ) : (scheduleItems ?? []).map(item => {
                const startTime = item.starts_at
                  ? new Date(item.starts_at as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : null;
                const endTime = item.starts_at && item.duration_minutes
                  ? new Date(new Date(item.starts_at as string).getTime() + (item.duration_minutes as number) * 60_000)
                      .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : null;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-brand-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-surface-900 truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-surface-400">
                        {startTime && <span>{startTime}{endTime && ` – ${endTime}`}</span>}
                        {item.section && <span className="truncate">{item.section}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Status row: Guests | Venue | Livestream | Risk ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Guest gallery */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
          <SectionHeader title="Guest Gallery" sub={`${num(guestTotal)} invited`} href={`/event-manager/events/${eventId}/guests`} />
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden shadow-sm" style={{
                background: [
                  "linear-gradient(135deg,#4f46e5,#7c3aed)",
                  "linear-gradient(135deg,#0ea5e9,#2563eb)",
                  "linear-gradient(135deg,#10b981,#059669)",
                  "linear-gradient(135deg,#f59e0b,#d97706)",
                  "linear-gradient(135deg,#ec4899,#be185d)",
                  "linear-gradient(135deg,#8b5cf6,#6d28d9)",
                  "linear-gradient(135deg,#f97316,#ea580c)",
                ][i % 7],
              }}>
                <div className="w-full h-full flex items-center justify-center">
                  <UserCheck className="h-3.5 w-3.5 text-white/70" />
                </div>
              </div>
            ))}
            {(guestTotal ?? 0) > 7 && (
              <div className="aspect-square rounded-lg bg-surface-100 flex items-center justify-center border border-surface-200">
                <span className="text-[9px] font-bold text-surface-500">+{num((guestTotal ?? 0) - 7)}</span>
              </div>
            )}
          </div>
          {(guestTotal ?? 0) === 0 && (
            <p className="text-[11px] text-surface-400 text-center py-2">No guests yet</p>
          )}
        </div>

        {/* Venue */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
          <SectionHeader title="Venue & Location" href={`/event-manager/events/${eventId}/event-map`} hrefLabel="View map" />
          {ev.venue_name_snapshot || ev.location ? (
            <>
              <div className="flex items-start gap-2 mb-3">
                <MapPin className="h-3.5 w-3.5 text-brand-500 shrink-0 mt-0.5" strokeWidth={1.8} />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-surface-900 leading-snug">{(ev.venue_name_snapshot ?? ev.location) as string}</p>
                  {ev.venue_address_snapshot != null && <p className="text-[10.5px] text-surface-400 mt-0.5 leading-snug">{ev.venue_address_snapshot as string}</p>}
                </div>
              </div>
              {venueMapSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={venueMapSrc}
                  alt={(ev.venue_name_snapshot ?? "Venue") as string}
                  width={400}
                  height={160}
                  className="rounded-lg w-full h-20 object-cover border border-surface-100"
                />
              ) : (
                <div className="rounded-lg bg-gradient-to-br from-surface-50 to-surface-100 h-20 flex flex-col items-center justify-center border border-surface-100 gap-1">
                  <MapPin className="h-4 w-4 text-surface-300" strokeWidth={1.5} />
                  <p className="text-[9px] text-surface-300 font-medium">Add NEXT_PUBLIC_MAPTILER_KEY to enable</p>
                </div>
              )}
              <a
                href={`/event-manager/events/${eventId}/event-map`}
                className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                View on map
                <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
              </a>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <MapPin className="h-8 w-8 text-surface-200 mb-2" strokeWidth={1.5} />
              <p className="text-xs text-surface-400">No venue set</p>
            </div>
          )}
        </div>

        {/* Livestream */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
          <SectionHeader title="Livestream" />
          <div className="flex flex-col items-center justify-center py-5 text-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${ev.has_livestream ? "bg-danger-50" : "bg-surface-100"}`}>
              <Radio className={`h-5 w-5 ${ev.has_livestream ? "text-danger-500" : "text-surface-300"}`} strokeWidth={1.8} />
            </div>
            <p className="text-xs font-semibold text-surface-600">
              {ev.has_livestream ? "Stream planned" : "Not live"}
            </p>
            <p className="text-[10.5px] text-surface-400 mt-0.5">
              {ev.has_livestream ? "Configure stream in settings" : "No stream planned for this event"}
            </p>
          </div>
        </div>

        {/* Risk & Alerts */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4">
          <SectionHeader title="Risk & Alerts" />

          {/* Alert counts */}
          <div className="flex items-center justify-around mb-3 py-2 rounded-lg bg-surface-50 border border-surface-100">
            <div className="text-center">
              <p className={`text-lg font-extrabold ${alertCounts.high > 0 ? "text-danger-600" : "text-surface-300"}`}>{alertCounts.high}</p>
              <p className="text-[9px] text-surface-400 uppercase tracking-wider font-semibold">High</p>
            </div>
            <div className="w-px h-8 bg-surface-200" />
            <div className="text-center">
              <p className={`text-lg font-extrabold ${alertCounts.medium > 0 ? "text-warning-600" : "text-surface-300"}`}>{alertCounts.medium}</p>
              <p className="text-[9px] text-surface-400 uppercase tracking-wider font-semibold">Med</p>
            </div>
            <div className="w-px h-8 bg-surface-200" />
            <div className="text-center">
              <p className={`text-lg font-extrabold ${alertCounts.low > 0 ? "text-surface-600" : "text-surface-300"}`}>{alertCounts.low}</p>
              <p className="text-[9px] text-surface-400 uppercase tracking-wider font-semibold">Low</p>
            </div>
          </div>

          {/* Alert list */}
          <div className="space-y-1.5">
            {alerts.length === 0 && (
              <div className="flex items-center gap-1.5">
                <StatusDot color="green" />
                <p className="text-[11px] text-success-700 font-semibold">No active alerts</p>
              </div>
            )}
            {alerts.slice(0, 3).map((a, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertTriangle className={`h-3 w-3 shrink-0 mt-0.5 ${a.level === "high" ? "text-danger-500" : a.level === "medium" ? "text-warning-500" : "text-surface-400"}`} />
                <p className="text-[10.5px] text-surface-700 leading-snug">{a.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── AI Event Intelligence ── */}
      {aiInsights.length > 0 && (
        <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-[#faf9ff] to-white shadow-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-surface-900">AI Event Intelligence</h3>
              <p className="text-[10.5px] text-surface-400">Data-grounded insights from your live event metrics</p>
            </div>
            <span className="ml-auto text-[10.5px] text-brand-600 font-semibold bg-brand-50 px-2.5 py-1 rounded-full border border-brand-100 shrink-0">
              Copilot
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {aiInsights.map((insight, i) => {
              const Icon = insight.icon;
              return (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-white border border-surface-100 px-4 py-3.5 shadow-sm hover:shadow-md transition-shadow">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${insight.bg}`}>
                    <Icon className={`h-4 w-4 ${insight.color}`} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-surface-900 mb-1">{insight.title}</p>
                    <p className="text-[11px] text-surface-500 leading-relaxed">{insight.body}</p>
                    {insight.score !== undefined && (
                      <div className="mt-2 h-1 w-full rounded-full bg-surface-100 overflow-hidden">
                        <div className="h-full rounded-full bg-brand-400" style={{ width: `${insight.score}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bottom row: Quick Links | Event Health | Team Activity ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Quick links */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <SectionHeader title="Quick Navigation" sub="Jump to any section" />
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Floor Plan",   href: "floor-plan",       icon: Layout },
              { label: "Run Sheet",    href: "schedule",          icon: CalendarDays },
              { label: "Documents",    href: "documents-media",   icon: FileText },
              { label: "Guest List",   href: "guests",            icon: Users },
              { label: "Comms Centre", href: "comms",             icon: MessageSquare },
              { label: "Finances",     href: "finance",           icon: Wallet },
            ].map(({ label, href, icon: Icon }) => (
              <a key={href} href={`/event-manager/events/${eventId}/${href}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 bg-surface-50 border border-surface-100 hover:bg-surface-100 hover:border-surface-200 transition-all group"
              >
                <Icon className="h-3.5 w-3.5 text-brand-400 group-hover:text-brand-600 shrink-0 transition-colors" strokeWidth={1.8} />
                <span className="text-[11.5px] font-medium text-surface-700 group-hover:text-surface-900 transition-colors">{label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Event health summary */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <SectionHeader title="Event Health" sub="Key delivery signals" />
          <div className="space-y-3">
            {[
              {
                label: "Budget Control",
                status: budgetUsedPct > 100 ? "Over budget" : budgetUsedPct > 90 ? "Near limit" : budget > 0 ? "On track" : "No budget",
                dot: budgetUsedPct > 100 ? "red" as const : budgetUsedPct > 90 ? "amber" as const : "green" as const,
                sub: budget > 0 ? `${budgetUsedPct}% used` : "Set a budget to track",
              },
              {
                label: "Supplier Chain",
                status: supplierReadinessPct >= 90 ? "Secured" : supplierReadinessPct >= 50 ? "In progress" : (supplierTotal ?? 0) === 0 ? "No suppliers" : "Action needed",
                dot: supplierReadinessPct >= 90 ? "green" as const : supplierReadinessPct >= 50 ? "amber" as const : "red" as const,
                sub: `${supplierConfirmed ?? 0} of ${supplierTotal ?? 0} confirmed`,
              },
              {
                label: "Task Progress",
                status: taskCompletionPct >= 80 ? "On track" : taskCompletionPct >= 40 ? "In progress" : "Behind",
                dot: taskCompletionPct >= 80 ? "green" as const : taskCompletionPct >= 40 ? "amber" as const : "red" as const,
                sub: `${taskDone ?? 0}/${taskTotal ?? 0} tasks done`,
              },
              {
                label: "Guest Invitations",
                status: guestConfirmPct >= 80 ? "Strong turnout" : guestConfirmPct >= 50 ? "Building" : (guestTotal ?? 0) === 0 ? "No guests yet" : "Low confirmation",
                dot: guestConfirmPct >= 80 ? "green" as const : guestConfirmPct >= 50 ? "amber" as const : "red" as const,
                sub: `${guestConfirmPct}% confirmed`,
              },
              {
                label: "Ticket Sales",
                status: ticketsTotal === 0 ? "No tiers" : ticketsSold === ticketsTotal ? "Sold out" : (ticketsSold / Math.max(ticketsTotal, 1)) >= 0.7 ? "Healthy" : "Needs push",
                dot: ticketsTotal === 0 ? "gray" as const : ticketsSold === ticketsTotal ? "green" as const : (ticketsSold / Math.max(ticketsTotal, 1)) >= 0.7 ? "green" as const : "amber" as const,
                sub: ticketsTotal > 0 ? `${pct(ticketsSold, ticketsTotal)} capacity` : "Set up ticket tiers",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-1.5 border-b border-surface-50 last:border-0">
                <StatusDot color={item.dot} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-semibold text-surface-700 leading-tight">{item.label}</p>
                  <p className="text-[10px] text-surface-400">{item.sub}</p>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                  item.dot === "green" ? "bg-success-50 text-success-700" :
                  item.dot === "amber" ? "bg-warning-50 text-warning-700" :
                  item.dot === "red" ? "bg-danger-50 text-danger-700" :
                  "bg-surface-50 text-surface-400"
                }`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Team activity feed */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card">
          <div className="px-4 py-3.5 border-b border-surface-100 flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-semibold text-surface-900">Team Activity</h3>
              <p className="text-[10.5px] text-surface-400 mt-0.5">Recent changes</p>
            </div>
            <Activity className="h-3.5 w-3.5 text-surface-300" />
          </div>
          <ul className="divide-y divide-surface-50">
            {(recentActivity ?? []).length === 0 ? (
              <li className="px-4 py-8 text-center">
                <Activity className="h-7 w-7 text-surface-200 mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-xs text-surface-400">No activity yet</p>
              </li>
            ) : (recentActivity ?? []).map((a: Record<string, unknown>) => (
              <li key={a.id as string} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-50/50 transition-colors">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 text-[9px] font-bold shrink-0 mt-0.5 border border-brand-100">
                  {((a.actor_name as string) ?? (a.action as string) ?? "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-surface-700 leading-snug">
                    <span className="font-semibold text-surface-900">{(a.actor_name as string) ?? "System"}</span>
                    {" "}{(a.note as string) ?? (a.action as string)}
                  </p>
                  <p className="text-[9.5px] text-surface-400 mt-0.5">
                    {new Date(a.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2.5 border-t border-surface-50">
            <a href={`/event-manager/events/${eventId}/activity`} className="text-[11px] text-brand-600 font-medium hover:underline flex items-center gap-1">
              View full activity log <ChevronRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
