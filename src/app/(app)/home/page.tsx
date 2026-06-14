import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays, CheckSquare, AlertTriangle, Banknote,
  TrendingUp, Clock, Users2, Sparkles,
  ArrowRight, Plus, FileDown, CalendarOff, ListChecks,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Event, Task } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Home" };

// events.status is stored with underscores; StatusBadge expects hyphenated values.
function eventBadgeStatus(status: string) {
  return status.replace(/_/g, "-");
}

function formatGBP(cents: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDueLabel(due: string | null) {
  if (!due) return "No due date";
  const dueDate = new Date(due);
  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;
  const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((startOfDue.getTime() - startOfNow.getTime()) / dayMs);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "1 day ago";
  if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
  return `In ${diffDays} days`;
}

export default async function HomePage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const soonIso = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ── KPI: active events (not completed/cancelled) ───────────────────────────
  const { count: activeEventsCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled)");

  // ── KPI: upcoming events (start_at >= now) ─────────────────────────────────
  const { count: upcomingEventsCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .gte("start_at", nowIso);

  // ── KPI: open tasks (not done/cancelled) ───────────────────────────────────
  const { count: openTasksCount } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .not("status", "in", "(done,cancelled)");

  // ── KPI: outstanding invoice total (total_cents - paid_cents, not paid/void) ─
  const { data: outstandingInvoices } = await supabase
    .from("invoices")
    .select("total_cents, paid_cents")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .not("status", "in", "(paid,void)");

  const outstandingCents = (outstandingInvoices ?? []).reduce(
    (sum, inv) => sum + Math.max((inv.total_cents ?? 0) - (inv.paid_cents ?? 0), 0),
    0
  );

  // ── Upcoming events list ───────────────────────────────────────────────────
  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, name, status, start_at, location, client_name")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(6);

  // ── Tasks needing attention: due soon or overdue, still open ───────────────
  const { data: attentionTasks } = await supabase
    .from("tasks")
    .select("id, title, status, due_at, event_id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .not("status", "in", "(done,cancelled)")
    .not("due_at", "is", null)
    .lte("due_at", soonIso)
    .order("due_at", { ascending: true })
    .limit(6);

  const events = (upcomingEvents ?? []) as Pick<
    Event,
    "id" | "name" | "status" | "start_at" | "location" | "client_name"
  >[];
  const tasks = (attentionTasks ?? []) as Pick<
    Task,
    "id" | "title" | "status" | "due_at" | "event_id"
  >[];

  const kpis = [
    {
      label: "Active Events",
      value: activeEventsCount ?? 0,
      icon: CalendarDays,
      iconColor: "text-brand-600",
      iconBg: "bg-brand-50",
      href: "/events",
    },
    {
      label: "Upcoming Events",
      value: upcomingEventsCount ?? 0,
      icon: CalendarDays,
      iconColor: "text-violet-600",
      iconBg: "bg-violet-50",
      href: "/events",
    },
    {
      label: "Open Tasks",
      value: openTasksCount ?? 0,
      icon: CheckSquare,
      iconColor: "text-warning-600",
      iconBg: "bg-warning-50",
      href: "/tasks",
    },
    {
      label: "Outstanding Invoices",
      value: formatGBP(outstandingCents),
      icon: Banknote,
      iconColor: "text-danger-600",
      iconBg: "bg-danger-50",
      href: "/finance/payments",
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Home"
        description={today}
        actions={
          <>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              <FileDown className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Export Summary</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
              <Sparkles className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">AI Briefing</span>
            </button>
            <Link
              href="/events/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">New Event</span>
            </Link>
          </>
        }
      />

      <div className="p-6 space-y-8 max-w-[1400px]">
        {/* KPI grid */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Overview
          </h2>
          <KPIGrid>
            {kpis.map((kpi) => (
              <MetricCard key={kpi.label} {...kpi} />
            ))}
          </KPIGrid>
        </section>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Upcoming events */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-surface-900">Upcoming Events</h2>
              <Link href="/events" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              {events.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarOff}
                  title="No upcoming events"
                  description="Events with a future start date will appear here."
                />
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-surface-100">
                    {events.map((event) => (
                      <tr key={event.id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/events/${event.id}`} className="font-medium text-surface-900 hover:text-brand-600 transition-colors">
                            {event.name}
                          </Link>
                          <p className="text-xs text-surface-400 mt-0.5">
                            {event.client_name ?? event.location ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-surface-500 text-xs whitespace-nowrap">
                          {formatDate(event.start_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <StatusBadge status={eventBadgeStatus(event.status) as never} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Tasks needing attention */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-surface-900">Needs Attention</h2>
              <Link href="/tasks" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              {tasks.length === 0 ? (
                <EmptyState
                  compact
                  icon={ListChecks}
                  title="Nothing due soon"
                  description="Tasks that are overdue or due within the next week will appear here."
                />
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-surface-100">
                    {tasks.map((task) => {
                      const overdue = task.due_at != null && new Date(task.due_at) < new Date();
                      return (
                        <tr key={task.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/tasks/${task.id}`} className="font-medium text-surface-900 hover:text-brand-600 transition-colors">
                              {task.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span
                              className={
                                overdue
                                  ? "text-xs font-medium text-danger-600 bg-danger-50 px-2 py-0.5 rounded-full border border-danger-200"
                                  : "text-xs font-medium text-warning-600 bg-warning-50 px-2 py-0.5 rounded-full border border-warning-200"
                              }
                            >
                              {formatDueLabel(task.due_at)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* AI daily briefing card */}
        <section>
          <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-violet-900 rounded-xl p-6 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white blur-3xl" />
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white" strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">Gala Copilot Daily Briefing</h3>
                <p className="text-sm text-white/70 mt-0.5">
                  Get a smart summary of today&apos;s priorities — events, tasks, supplier chases and payment risks.
                </p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2.5 bg-white text-brand-700 text-sm font-semibold rounded-lg hover:bg-brand-50 transition-colors shrink-0">
                <Sparkles className="w-4 h-4" strokeWidth={1.8} />
                Generate Briefing
              </button>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "View Event Pipeline",    href: "/events",             icon: TrendingUp },
              { label: "View Open Tasks",        href: "/tasks",              icon: AlertTriangle },
              { label: "View Client Approvals",  href: "/finance/quotes",     icon: Clock },
              { label: "View Suppliers",         href: "/suppliers",          icon: Users2 },
            ].map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className="flex items-center gap-2.5 px-4 py-3 bg-white border border-surface-200 rounded-xl text-sm font-medium text-surface-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-all shadow-card group"
              >
                <Icon className="w-4 h-4 text-surface-400 group-hover:text-brand-500 transition-colors shrink-0" strokeWidth={1.8} />
                {label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
