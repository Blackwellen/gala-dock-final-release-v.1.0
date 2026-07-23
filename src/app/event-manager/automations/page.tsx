import Link from "next/link";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Lock,
  Zap,
  Plus,
  Sparkles,
  Webhook,
  Boxes,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ShieldOff,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { DonutChart, DonutLegend, ProgressBar, InsightCard } from "@/components/ui/FinanceCharts";
import { formatRelative } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { getPersonaContext } from "@/lib/flags/context";
import { upgradeMessage } from "@/lib/billing/entitlements";
import {
  getOverviewMetrics,
  getRecentActivity,
  getNeedsAttention,
  getUsageSnapshot,
  getAutomationCoverage,
} from "@/lib/automations/data";
import { RECIPES_BY_ID } from "@/lib/automations/recipes";
import { applyRecipe } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automations — Overview" };

const FEATURED_RECIPE_IDS = [
  "event-confirmed-onboarding",
  "supplier-doc-expiring-renewal",
  "invoice-overdue-draft-chase",
  "task-overdue-escalate",
  "checkin-due-reminder",
  "post-event-feedback-request",
];

const MODULE_COLORS: Record<string, string> = {
  events: "#7c3aed",
  suppliers: "#0ea5e9",
  tasks: "#f59e0b",
  finance: "#22c55e",
  pipeline: "#ec4899",
  tickets: "#6366f1",
  documents: "#14b8a6",
  notifications: "#94a3b8",
  operations: "#64748b",
};

const RISK_BADGE: Record<string, string> = {
  low: "bg-success-50 text-success-700",
  medium: "bg-warning-50 text-warning-700",
  high: "bg-danger-50 text-danger-700",
};

const RUN_STATUS_BADGE: Record<
  string,
  "queued" | "running" | "waiting-approval" | "cancelled" | "skipped" | "resolved" | "failed"
> = {
  queued: "queued",
  running: "running",
  waiting_approval: "waiting-approval",
  cancelled: "cancelled",
  skipped: "skipped",
  success: "resolved",
  failed: "failed",
};

function runStatusBadge(status: string) {
  return RUN_STATUS_BADGE[status] ?? "queued";
}

function recipeIcon(name: string): LucideIcon {
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name];
  return Icon ?? LucideIcons.Zap;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export default async function AutomationsOverviewPage() {
  const { flags } = await getPersonaContext();

  if (!flags.automationsBuilder) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Automations" description="Build, manage and monitor automated workflows across events, suppliers, finance and operations." />
        <div className="max-w-lg mx-auto mt-10 rounded-xl border border-surface-200 bg-white p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Automations</h2>
          <p className="text-sm text-surface-500 mb-5">{upgradeMessage("business")}</p>
          <Link href="/event-manager/settings/billing" className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const { workspaceId } = await requireWorkspace();

  const [metrics, activity, attention, usage, coverage] = await Promise.all([
    getOverviewMetrics(workspaceId),
    getRecentActivity(workspaceId, 6),
    getNeedsAttention(workspaceId),
    getUsageSnapshot(workspaceId),
    getAutomationCoverage(workspaceId),
  ]);

  const featuredRecipes = FEATURED_RECIPE_IDS.map((id) => RECIPES_BY_ID[id]).filter(Boolean);

  const coverageData = coverage.map((c) => ({
    label: capitalize(c.module),
    value: c.count,
    color: MODULE_COLORS[c.module] ?? "#94a3b8",
  }));

  const needsAttentionItems = [
    {
      key: "failed",
      label: "Failed runs (last 24h)",
      count: attention.failedRuns24h,
      href: "/event-manager/automations/runs?status=failed",
      icon: AlertTriangle,
      tone: "text-danger-600 bg-danger-50",
    },
    {
      key: "approvals",
      label: "Pending approvals",
      count: attention.pendingApprovals,
      href: "/event-manager/automations/approvals",
      icon: Activity,
      tone: "text-warning-600 bg-warning-50",
    },
    {
      key: "integrations",
      label: "Disconnected integrations",
      count: attention.disconnectedIntegrations,
      href: "/event-manager/automations/integrations",
      icon: ShieldOff,
      tone: "text-surface-500 bg-surface-100",
    },
  ];
  const totalNeedsAttention = needsAttentionItems.reduce((s, i) => s + i.count, 0);

  const usageRows = [
    { label: "Automation runs", used: usage.runsUsed, cap: usage.runsCap },
    { label: "Tasks executed", used: usage.tasksExecuted, cap: usage.tasksCap },
    { label: "AI credits", used: usage.aiCreditsUsed, cap: usage.aiCreditsCap },
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Automations"
        description="Build, manage and monitor automated workflows across events, suppliers, finance and operations."
        tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/automations/ai-builder"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              AI Builder
            </Link>
            <Link
              href="/event-manager/automations/builder/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New automation
            </Link>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-[1600px] space-y-6">
        {metrics.total === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Zap}
              title="No automations yet"
              description="Start from a proven recipe — it installs as a review-first draft you can test and activate when ready."
              action={
                <Link href="/event-manager/automations/recipes" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
                  Create from recipe
                </Link>
              }
            />
          </div>
        ) : (
          <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Total automations" value={metrics.total} icon={Boxes} iconColor="text-brand-600" iconBg="bg-brand-50" />
            <MetricCard label="Active" value={metrics.active} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
            <MetricCard label="Drafts" value={metrics.drafts} icon={Sparkles} iconColor="text-surface-500" iconBg="bg-surface-100" />
            <MetricCard label="Success rate" value={`${metrics.successRate}%`} icon={Activity} iconColor="text-violet-600" iconBg="bg-violet-50" />
            <MetricCard label="Runs today" value={metrics.runsToday} icon={Zap} iconColor="text-info-600" iconBg="bg-info-50" />
            <MetricCard label="Pending approvals" value={metrics.pendingApprovals} icon={AlertTriangle} iconColor="text-warning-600" iconBg="bg-warning-50" />
          </KPIGrid>
        )}

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <QuickAction href="/event-manager/automations/recipes" icon={Sparkles} label="Create from recipe" desc="Start from a curated template" />
            <QuickAction href="/event-manager/automations/builder/new" icon={Boxes} label="Build in canvas" desc="Trigger → condition → action" />
            <QuickAction href="/event-manager/automations/ai-builder" icon={Zap} label="Create with AI" desc="Describe it, review, activate" />
            <QuickAction href="/event-manager/automations/integrations" icon={Webhook} label="Connect webhook" desc="Wire in an external system" />
          </div>
        </div>

        {/* Featured recipes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900">Featured recipes</h2>
            <Link href="/event-manager/automations/recipes" className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
              Browse all recipes <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredRecipes.map((recipe) => {
              const Icon = recipeIcon(recipe.icon);
              return (
                <div key={recipe.id} className="rounded-xl border border-surface-200 bg-white p-4 flex flex-col shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-surface-400">{recipe.group}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize shrink-0 ${RISK_BADGE[recipe.risk]}`}>{recipe.risk} risk</span>
                  </div>
                  <h4 className="text-sm font-semibold text-surface-900 mt-2.5">{recipe.name}</h4>
                  <p className="text-xs text-surface-500 mt-1 flex-1">{recipe.description}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
                    <span className="text-[10px] font-medium text-surface-400 capitalize">{recipe.complexity} setup</span>
                    <form
                      action={async () => {
                        "use server";
                        await applyRecipe(recipe.id);
                      }}
                    >
                      <button type="submit" className="px-3 py-1.5 text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors">
                        Use recipe
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">Recent automation activity</h2>
                <Link href="/event-manager/automations/runs" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all runs</Link>
              </div>
              {activity.length === 0 ? (
                <EmptyState icon={Activity} title="No runs yet" description="Once an automation fires, its activity will appear here." compact />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Automation</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Trigger</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {activity.map((row) => (
                        <tr key={row.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-5 py-3 font-medium text-surface-900">{row.automationName}</td>
                          <td className="px-5 py-3 text-surface-500 text-xs">{row.trigger}</td>
                          <td className="px-5 py-3"><StatusBadge status={runStatusBadge(row.status)} /></td>
                          <td className="px-5 py-3 text-surface-400 text-xs">{formatRelative(row.ts)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Needs attention */}
            <InsightCard title="Needs attention">
              {totalNeedsAttention === 0 ? (
                <p className="text-xs text-surface-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success-600" /> All automations are healthy — nothing needs attention right now.
                </p>
              ) : (
                <ul className="space-y-1">
                  {needsAttentionItems.filter((i) => i.count > 0).map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <Link href={item.href} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-surface-50 transition-colors">
                          <span className="flex items-center gap-2 text-xs text-surface-700">
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center ${item.tone}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                            {item.label}
                          </span>
                          <span className="text-xs font-semibold text-surface-900 tabular-nums">{item.count}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </InsightCard>
          </div>

          <div className="space-y-4">
            {/* Usage snapshot */}
            <InsightCard title="Usage snapshot" action={<Link href="/event-manager/automations/usage" className="text-xs text-brand-600 hover:text-brand-700 font-medium">Details</Link>}>
              <div className="space-y-4">
                {usageRows.map((row) => {
                  const pct = row.cap > 0 ? Math.min(100, Math.round((row.used / row.cap) * 100)) : 0;
                  return (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-surface-600">{row.label}</span>
                        <span className="font-semibold text-surface-800 tabular-nums">
                          {row.used.toLocaleString()} {row.cap > 0 ? `/ ${row.cap.toLocaleString()}` : "· no cap set"}
                        </span>
                      </div>
                      <ProgressBar pct={pct} color={pct >= 90 ? "bg-danger-500" : pct >= 70 ? "bg-warning-500" : "bg-brand-500"} />
                    </div>
                  );
                })}
              </div>
            </InsightCard>

            {/* Automation coverage */}
            <InsightCard title="Automation coverage">
              {coverageData.length === 0 ? (
                <p className="text-xs text-surface-400">No automations to chart yet.</p>
              ) : (
                <div className="flex items-center gap-5">
                  <DonutChart data={coverageData} centerValue={String(metrics.total)} centerLabel="Total" size={140} thickness={20} />
                  <div className="flex-1 min-w-0">
                    <DonutLegend data={coverageData} />
                  </div>
                </div>
              )}
            </InsightCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, desc }: { href: string; icon: LucideIcon; label: string; desc: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 p-3 rounded-lg border border-surface-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
      <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5 text-brand-600" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-surface-900">{label}</p>
        <p className="text-xs text-surface-500 truncate">{desc}</p>
      </div>
    </Link>
  );
}
