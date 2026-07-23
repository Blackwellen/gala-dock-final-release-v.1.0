import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { VenueDashboard, SupplierDashboard } from "@/components/personas/PersonaDashboards";
import { getHomeDashboardData, type DashboardRange } from "./data";
import { HomeKpiCard } from "./_components/HomeKpiCard";
import { EventCarousel } from "./_components/EventCarousel";
import { NeedsAttentionPanel } from "./_components/NeedsAttentionPanel";
import { PipelinePanel } from "./_components/PipelinePanel";
import { RecentActivityPanel } from "./_components/RecentActivityPanel";
import { QuickActionsPanel } from "./_components/QuickActionsPanel";
import { PeriodSelector } from "./_components/PeriodSelector";
import { CalendarDays, CheckSquare, Banknote, ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "Home" };

const VALID_RANGES: DashboardRange[] = ["today", "week", "next7", "month"];

function firstNameFrom(displayName: string | null, email: string): string {
  const source = (displayName ?? "").trim();
  if (source) return source.split(/\s+/)[0];
  const local = email.split("@")[0] ?? "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { workspaceId, workspace, user } = await requireWorkspace();

  // Persona-aware home: venue/supplier workspaces get their own dashboard.
  const workspaceType = (workspace as { workspace_type?: string }).workspace_type ?? "organizer";
  if (workspaceType === "venue") return <VenueDashboard workspaceId={workspaceId} />;
  if (workspaceType === "supplier") return <SupplierDashboard workspaceId={workspaceId} />;

  const sp = await searchParams;
  const range: DashboardRange = VALID_RANGES.includes(sp.range as DashboardRange) ? (sp.range as DashboardRange) : "week";

  const currency = (workspace as { currency?: string }).currency ?? "GBP";
  const locale = (workspace as { locale?: string }).locale ?? "en-GB";

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const firstName = firstNameFrom(profile?.display_name ?? null, user.email ?? "");

  const today = new Date().toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const data = await getHomeDashboardData(workspaceId, range, currency, locale);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-6 py-5">
        <div className="max-w-[1600px] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight flex items-center gap-2">
              Welcome back, {firstName} <span aria-hidden>👋</span>
            </h1>
            <p className="mt-1 text-sm text-surface-500">Here&apos;s what&apos;s happening with your events and operations.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:flex items-center gap-1.5 text-sm text-surface-500">
              <CalendarDays className="w-4 h-4 text-surface-400" strokeWidth={1.8} />
              {today}
            </span>
            <PeriodSelector value={range} />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-[1600px]">
        {/* KPI grid */}
        <section aria-label="Key metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <HomeKpiCard
            label="Active Events"
            data={data.kpis.activeEvents}
            icon={CalendarDays}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
            sparklineColor="#4f46e5"
            href="/event-manager/events"
          />
          <HomeKpiCard
            label="Upcoming Events"
            data={data.kpis.upcomingEvents}
            icon={CalendarDays}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
            sparklineColor="#8b5cf6"
            href="/event-manager/events"
          />
          <HomeKpiCard
            label="Open Tasks"
            data={data.kpis.openTasks}
            icon={CheckSquare}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
            sparklineColor="#f59e0b"
            href="/event-manager/tasks"
            warn={data.kpis.openTasks.warn}
          />
          <HomeKpiCard
            label="Outstanding Invoices"
            data={data.kpis.outstandingInvoices}
            icon={Banknote}
            iconColor="text-danger-600"
            iconBg="bg-danger-50"
            sparklineColor="#ef4444"
            href="/event-manager/finance/payments"
            warn={data.kpis.outstandingInvoices.warn}
          />
        </section>

        {/* Upcoming events carousel */}
        <section aria-label="Upcoming events">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900">Upcoming Events</h2>
            <Link href="/event-manager/events" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
              View all events <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <EventCarousel events={data.upcomingEvents} currency={currency} locale={locale} />
        </section>

        {/* Lower panels */}
        <section aria-label="Operational insights" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
          <NeedsAttentionPanel items={data.attentionItems} />
          <PipelinePanel
            totalCents={data.pipeline.totalCents}
            stages={data.pipeline.stages}
            topOpportunities={data.pipeline.topOpportunities}
            currency={currency}
            locale={locale}
          />
          <RecentActivityPanel items={data.activity} />
          <QuickActionsPanel />
        </section>
      </div>
    </div>
  );
}
