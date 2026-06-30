import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { TrendingUp, TrendingDown, Users, Ticket, Wallet, Star, BarChart2, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

function gbp(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100);
}

const AI_SIGNALS = [
  {
    type: "opportunity",
    color: "bg-success-50 border-success-200",
    badge: "bg-success-100 text-success-700",
    label: "Opportunity",
    title: "VIP ticket tier still 40% available",
    body: "With 6 weeks until the event, VIP seats are filling slower than last year. Consider a targeted invite campaign to your top-tier contacts.",
  },
  {
    type: "risk",
    color: "bg-warning-50 border-warning-200",
    badge: "bg-warning-100 text-warning-700",
    label: "Risk",
    title: "3 suppliers not yet contracted",
    body: "AV Production, Catering (evening) and Photography haven't signed contracts yet. Contract delays past T-30 days carry cancellation risk.",
  },
  {
    type: "action",
    color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    label: "Action",
    title: "Guest invitations wave 2 due",
    body: "Based on your event date, the second invitation wave should go out within the next 5 days to give guests sufficient notice.",
  },
];

export default async function InsightsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, budget_cents, start_at, guest_count_day")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const [
    { count: guestTotal }, { count: guestConfirmed },
    { data: expenses }, { data: tiers }, { data: tasks }, { count: taskDone }
  ] = await Promise.all([
    supabase.from("event_guests").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("event_guests").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).eq("rsvp_status", "confirmed"),
    supabase.from("event_expenses").select("amount_cents").eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("ticket_types").select("price_cents, sold").eq("workspace_id", workspaceId).eq("event_id", eventId),
    supabase.from("event_tasks").select("id", { count: "exact", head: false }).eq("workspace_id", workspaceId).eq("event_id", eventId).is("archived_at", null),
    supabase.from("event_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId).eq("status", "completed"),
  ]);

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + (e.amount_cents ?? 0), 0);
  const budget = event.budget_cents ?? 0;
  const budgetUsedPct = budget > 0 ? Math.round((totalExpenses / budget) * 100) : 0;
  const ticketRevenue = (tiers ?? []).reduce((s, t) => s + ((t.sold ?? 0) * (t.price_cents ?? 0)), 0);
  const taskTotal = (tasks ?? []).length;
  const taskCompletionPct = taskTotal > 0 ? Math.round(((taskDone ?? 0) / taskTotal) * 100) : 0;

  // Days to event
  const daysToEvent = event.start_at ? Math.ceil((new Date(event.start_at).getTime() - Date.now()) / 86400000) : null;

  const kpis = [
    {
      label: "Guest Confirmation Rate",
      value: guestTotal ? `${Math.round(((guestConfirmed ?? 0) / (guestTotal ?? 1)) * 100)}%` : "—",
      sub: `${guestConfirmed ?? 0} of ${guestTotal ?? 0} confirmed`,
      trend: "up",
      icon: Users,
      color: "text-brand-600",
      bg: "bg-brand-50",
    },
    {
      label: "Ticket Revenue",
      value: gbp(ticketRevenue),
      sub: `${tiers ? tiers.reduce((s, t) => s + (t.sold ?? 0), 0) : 0} tickets sold`,
      trend: "up",
      icon: Ticket,
      color: "text-success-600",
      bg: "bg-success-50",
    },
    {
      label: "Budget Used",
      value: `${budgetUsedPct}%`,
      sub: `${gbp(totalExpenses)} of ${gbp(budget)}`,
      trend: budgetUsedPct > 90 ? "down" : "up",
      icon: Wallet,
      color: budgetUsedPct > 90 ? "text-danger-600" : "text-violet-600",
      bg: budgetUsedPct > 90 ? "bg-danger-50" : "bg-violet-50",
    },
    {
      label: "Task Completion",
      value: `${taskCompletionPct}%`,
      sub: `${taskDone ?? 0} of ${taskTotal} tasks done`,
      trend: "up",
      icon: BarChart2,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Days to Event",
      value: daysToEvent !== null ? (daysToEvent > 0 ? `${daysToEvent}` : "Today!") : "—",
      sub: daysToEvent !== null && daysToEvent > 0 ? "days remaining" : "",
      trend: "neutral",
      icon: Star,
      color: "text-surface-600",
      bg: "bg-surface-50",
    },
  ];

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Insights</h2>
          <p className="text-sm text-surface-500">Live performance metrics, trends and AI-powered event intelligence.</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map(({ label, value, sub, trend, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
                <p className="mt-1.5 text-2xl font-bold text-surface-900 tracking-tight">{value}</p>
                <p className="mt-0.5 text-[11px] text-surface-400 truncate">{sub}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.8} />
                </span>
                {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-success-600" />}
                {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-danger-600" />}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI signals */}
      <div className="rounded-xl border border-surface-200 bg-white shadow-card">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
          <Zap className="h-4 w-4 text-brand-500" strokeWidth={1.8} />
          <h3 className="text-sm font-semibold text-surface-900">AI Event Intelligence</h3>
          <span className="ml-auto rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{AI_SIGNALS.length} signals</span>
        </div>
        <div className="p-4 space-y-3">
          {AI_SIGNALS.map((signal, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${signal.color}`}>
              <span className={`mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${signal.badge}`}>{signal.label}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-surface-900">{signal.title}</p>
                <p className="mt-0.5 text-xs text-surface-600 leading-relaxed">{signal.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance panels */}
      <div className="grid grid-cols-3 gap-5">

        {/* Guest segment breakdown */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Guest Segments</h3>
          <div className="space-y-2">
            {[
              { label: "Corporate / Business", pct: 45, color: "bg-blue-500" },
              { label: "VIP / Special Guest",  pct: 18, color: "bg-amber-500" },
              { label: "Press / Media",         pct: 12, color: "bg-pink-500" },
              { label: "General Public",        pct: 25, color: "bg-green-500" },
            ].map(({ label, pct, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-surface-700">{label}</span>
                  <span className="text-surface-500">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue mix */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Revenue Mix</h3>
          <div className="space-y-2">
            {[
              { label: "Ticket Sales",     pct: 65, color: "bg-brand-500" },
              { label: "Sponsorship",       pct: 22, color: "bg-violet-500" },
              { label: "Exhibition Fees",   pct: 8,  color: "bg-teal-500" },
              { label: "Online / Streaming",pct: 5,  color: "bg-blue-400" },
            ].map(({ label, pct, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-surface-700">{label}</span>
                  <span className="text-surface-500">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Event readiness */}
        <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Event Readiness Score</h3>
          <div className="flex items-center justify-center py-4">
            <div className="relative h-28 w-28">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-surface-100" />
                <circle
                  cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10"
                  strokeDasharray={`${(taskCompletionPct / 100) * 251} 251`}
                  strokeLinecap="round"
                  className={taskCompletionPct > 80 ? "text-success-500" : taskCompletionPct > 50 ? "text-warning-500" : "text-danger-500"}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-surface-900">{taskCompletionPct}%</span>
                <span className="text-[10px] text-surface-500">Complete</span>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-surface-500 mt-2">
            {taskCompletionPct > 80 ? "On track for a great event." : taskCompletionPct > 50 ? "Good progress — keep going." : "Action needed to stay on track."}
          </p>
        </div>

      </div>
    </div>
  );
}
