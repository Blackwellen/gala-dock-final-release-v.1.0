import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays, Users2, CheckSquare, AlertTriangle,
  TrendingUp, Clock, Banknote, Sparkles,
  ArrowRight, Plus, FileDown,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Home" };

const KPI_DATA = [
  { label: "Active Events",           value: "12",  icon: CalendarDays, iconColor: "text-brand-600",   iconBg: "bg-brand-50",   href: "/events" },
  { label: "Events This Month",       value: "5",   icon: CalendarDays, iconColor: "text-violet-600",  iconBg: "bg-violet-50",  href: "/events" },
  { label: "Tasks Due",               value: "28",  icon: CheckSquare,  iconColor: "text-warning-600", iconBg: "bg-warning-50", href: "/tasks" },
  { label: "Overdue Tasks",           value: "4",   icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50",  href: "/tasks" },
  { label: "Supplier Quotes Pending", value: "9",   icon: Users2,       iconColor: "text-info-600",    iconBg: "bg-info-50",    href: "/suppliers" },
  { label: "Client Approvals Pending",value: "3",   icon: Clock,        iconColor: "text-warning-600", iconBg: "bg-warning-50", href: "/finance/quotes" },
  { label: "Payments Overdue",        value: "2",   icon: Banknote,     iconColor: "text-danger-600",  iconBg: "bg-danger-50",  href: "/finance/payments" },
  { label: "Events at Risk",          value: "1",   icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50",  href: "/events" },
];

const UPCOMING_EVENTS = [
  { id: "1", name: "The Carter Wedding",       date: "14 Jun 2026", status: "confirmed"  as const, client: "S. Carter" },
  { id: "2", name: "Meridian Tech Summit",     date: "19 Jun 2026", status: "in-delivery"as const, client: "Meridian Ltd" },
  { id: "3", name: "Hawthorn Birthday Ball",   date: "28 Jun 2026", status: "quoting"   as const, client: "J. Hawthorn" },
  { id: "4", name: "Thornbury Gala Dinner",    date: "5 Jul 2026",  status: "confirmed"  as const, client: "Thornbury CC" },
];

const OVERDUE_TASKS = [
  { id: "1", title: "Send AV brief to supplier",         event: "Meridian Tech Summit", due: "2 days ago" },
  { id: "2", title: "Confirm final guest count",          event: "The Carter Wedding",  due: "1 day ago" },
  { id: "3", title: "Chase catering contract signature",  event: "Hawthorn Birthday",   due: "Today" },
  { id: "4", title: "Upload venue floor plan",            event: "Thornbury Gala",      due: "3 days ago" },
];

export default function HomePage() {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

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
            {KPI_DATA.map((kpi) => (
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
              <table className="w-full text-sm">
                <tbody className="divide-y divide-surface-100">
                  {UPCOMING_EVENTS.map((event) => (
                    <tr key={event.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/events/${event.id}`} className="font-medium text-surface-900 hover:text-brand-600 transition-colors">
                          {event.name}
                        </Link>
                        <p className="text-xs text-surface-400 mt-0.5">{event.client}</p>
                      </td>
                      <td className="px-4 py-3 text-surface-500 text-xs whitespace-nowrap">{event.date}</td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge status={event.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Overdue tasks */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-surface-900">Overdue Tasks</h2>
              <Link href="/tasks" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-surface-100">
                  {OVERDUE_TASKS.map((task) => (
                    <tr key={task.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/tasks/${task.id}`} className="font-medium text-surface-900 hover:text-brand-600 transition-colors">
                          {task.title}
                        </Link>
                        <p className="text-xs text-surface-400 mt-0.5">{task.event}</p>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-xs font-medium text-danger-600 bg-danger-50 px-2 py-0.5 rounded-full border border-danger-200">
                          {task.due}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              { label: "View Overdue Tasks",     href: "/tasks",              icon: AlertTriangle },
              { label: "View Client Approvals",  href: "/finance/quotes",     icon: Clock },
              { label: "View Supplier Chases",   href: "/suppliers",          icon: Users2 },
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
