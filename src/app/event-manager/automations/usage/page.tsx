import Link from "next/link";
import {
  Zap,
  Sparkles,
  Plus,
  Gauge,
  BrainCircuit,
  Webhook,
  ClipboardCheck,
  CreditCard,
  HardDrive,
  Users,
  Boxes,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChartCard, InsightCard, ProgressBar, DonutChart, DonutLegend } from "@/components/ui/FinanceCharts";
import { cn, formatNumber } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getPlanLimits, getUsageSnapshot, getUsageOverTime, getUsageByModule, listIntegrations } from "@/lib/automations/data";
import { UsageChartClient } from "./UsageChartClient";
import { ExportUsageButton, type UsageExportSummary } from "./ExportUsageButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automations — Usage & Limits" };

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

const SUB_STATUS_BADGE: Record<string, "active" | "trialing" | "past-due" | "cancelled" | "pending" | "unpaid"> = {
  active: "active",
  trialing: "trialing",
  past_due: "past-due",
  canceled: "cancelled",
  incomplete: "pending",
  unpaid: "unpaid",
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_TEXT: Record<Tone, string> = {
  success: "text-success-600",
  warning: "text-warning-600",
  danger: "text-danger-600",
  neutral: "text-surface-400",
};

const TONE_BAR: Record<Tone, string> = {
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
  neutral: "bg-surface-300",
};

function usageState(used: number, cap: number): { pct: number | null; label: string; tone: Tone } {
  if (cap <= 0) return { pct: null, label: "Not configured", tone: "neutral" };
  const pct = (used / cap) * 100;
  if (pct >= 95) return { pct, label: "Exceeded", tone: "danger" };
  if (pct >= 70) return { pct, label: "Approaching", tone: "warning" };
  return { pct, label: "Healthy", tone: "success" };
}

export default async function UsageLimitsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const [
    usage,
    plan,
    dailyUsage,
    byModule,
    integrations,
    webhookEventsRes,
    approvalTasksRes,
    storageRes,
    membersRes,
    subRes,
    retryPolicyRes,
  ] = await Promise.all([
    getUsageSnapshot(workspaceId),
    getPlanLimits(workspaceId),
    getUsageOverTime(workspaceId, 30),
    getUsageByModule(workspaceId),
    listIntegrations(workspaceId),
    supabase.from("automation_usage_events").select("quantity").eq("workspace_id", workspaceId).eq("kind", "webhook_event").gte("created_at", monthStart),
    supabase.from("automation_usage_events").select("quantity").eq("workspace_id", workspaceId).eq("kind", "approval_task").gte("created_at", monthStart),
    supabase.from("automation_usage_events").select("quantity").eq("workspace_id", workspaceId).eq("kind", "storage_mb"),
    supabase.from("workspace_members").select("id", { count: "exact" }).eq("workspace_id", workspaceId).is("deleted_at", null),
    supabase.from("billing_subscriptions").select("status").eq("workspace_id", workspaceId).maybeSingle(),
    supabase
      .from("integration_webhooks")
      .select("retry_policy")
      .eq("workspace_id", workspaceId)
      .eq("direction", "outgoing")
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  const webhookEventsUsed = (webhookEventsRes.data ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  const approvalTasksUsed = (approvalTasksRes.data ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  const storageUsedMb = (storageRes.data ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  const storageUsedGb = Math.round((storageUsedMb / 1024) * 100) / 100;
  const activeSeatsUsed = membersRes.count ?? 0;
  const connectedIntegrations = integrations.filter((i) => i.status === "connected").length;
  const subscriptionStatus = subRes.data?.status ?? "active";

  const moduleData = byModule.map((m) => ({
    label: capitalize(m.module),
    value: m.count,
    color: MODULE_COLORS[m.module] ?? "#94a3b8",
  }));
  const totalModuleUsage = byModule.reduce((s, m) => s + m.count, 0);

  const retryPolicy = retryPolicyRes.data?.retry_policy as
    | { strategy?: string; max_retries?: number; initial_delay_ms?: number; max_delay_ms?: number }
    | null
    | undefined;

  const thresholds: { key: string; label: string; used: number; cap: number; icon: typeof Gauge }[] = [
    { key: "runs", label: "Automation runs", used: usage.runsUsed, cap: usage.runsCap, icon: Zap },
    { key: "ai", label: "AI credits", used: usage.aiCreditsUsed, cap: usage.aiCreditsCap, icon: BrainCircuit },
    { key: "webhook", label: "Webhook events", used: webhookEventsUsed, cap: plan.webhookEventsCap, icon: Webhook },
    { key: "approval", label: "Approval tasks", used: approvalTasksUsed, cap: plan.approvalTasksCap, icon: ClipboardCheck },
    { key: "storage", label: "Storage for logs (GB)", used: storageUsedGb, cap: plan.storageGbCap, icon: HardDrive },
    { key: "integrations", label: "Active integrations", used: connectedIntegrations, cap: plan.activeIntegrationsCap, icon: Boxes },
  ];

  const recommendations = thresholds
    .map((t) => ({ ...t, state: usageState(t.used, t.cap) }))
    .filter((t) => t.state.pct !== null && t.state.pct >= 70);

  const entitlementRows: { metric: string; used: number | null; cap: number; note?: string }[] = [
    { metric: "Automation runs / month", used: usage.runsUsed, cap: plan.smartRuleRunsCap },
    { metric: "AI credits / month", used: usage.aiCreditsUsed, cap: plan.aiCreditsCap },
    { metric: "Webhook events / month", used: webhookEventsUsed, cap: plan.webhookEventsCap },
    { metric: "Approval tasks / month", used: approvalTasksUsed, cap: plan.approvalTasksCap },
    { metric: "Storage (GB)", used: storageUsedGb, cap: plan.storageGbCap },
    { metric: "Execution concurrency (parallel runs)", used: null, cap: plan.concurrencyCap, note: "Concurrency is a runtime ceiling, not a metered usage counter — usage isn't tracked per-slot." },
    { metric: "Active integrations", used: connectedIntegrations, cap: plan.activeIntegrationsCap },
    { metric: "Active seats", used: activeSeatsUsed, cap: plan.activeSeatsCap },
  ];

  const exportSummary: UsageExportSummary = {
    planCode: plan.planCode,
    subscriptionStatus,
    runsUsed: usage.runsUsed,
    runsCap: plan.smartRuleRunsCap,
    aiCreditsUsed: usage.aiCreditsUsed,
    aiCreditsCap: plan.aiCreditsCap,
    webhookEventsUsed,
    webhookEventsCap: plan.webhookEventsCap,
    approvalTasksUsed,
    approvalTasksCap: plan.approvalTasksCap,
    storageUsedGb,
    storageGbCap: plan.storageGbCap,
    connectedIntegrations,
    activeIntegrationsCap: plan.activeIntegrationsCap,
    activeSeatsUsed,
    activeSeatsCap: plan.activeSeatsCap,
    generatedAt: new Date().toISOString(),
  };

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Automations"
        description="Track how this workspace is using automation runs, AI credits, webhook events and plan entitlements."
        tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />}
        actions={
          <>
            <span className="hidden sm:inline-flex items-center px-3 py-2 text-xs font-medium text-surface-500 bg-surface-100 rounded-lg">
              {monthLabel}
            </span>
            <ExportUsageButton summary={exportSummary} daily={dailyUsage} />
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
        {/* KPI row */}
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Monthly runs used" value={formatNumber(usage.runsUsed)} icon={Zap} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard
            label="Remaining runs"
            value={plan.smartRuleRunsCap > 0 ? formatNumber(Math.max(0, plan.smartRuleRunsCap - usage.runsUsed)) : "No cap set"}
            icon={Gauge}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard label="AI credits used" value={formatNumber(usage.aiCreditsUsed)} icon={BrainCircuit} iconColor="text-violet-600" iconBg="bg-violet-50" />
          <MetricCard label="Webhook events" value={formatNumber(webhookEventsUsed)} icon={Webhook} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Approval tasks" value={formatNumber(approvalTasksUsed)} icon={ClipboardCheck} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard
            label="Workspace plan"
            value={capitalize(plan.planCode)}
            icon={CreditCard}
            iconColor="text-surface-600"
            iconBg="bg-surface-100"
          />
        </KPIGrid>
        <div className="-mt-4 flex items-center gap-2 text-xs text-surface-500">
          <span>Subscription status:</span>
          <StatusBadge status={SUB_STATUS_BADGE[subscriptionStatus] ?? "active"} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <ChartCard title="Usage over time" action={<span className="text-xs text-surface-400">Last 30 days</span>}>
              <UsageChartClient points={dailyUsage} />
            </ChartCard>

            {/* Limit thresholds */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
              <h3 className="text-sm font-semibold text-surface-900 mb-4">Limit thresholds</h3>
              <div className="space-y-4">
                {thresholds.map((t) => {
                  const state = usageState(t.used, t.cap);
                  const Icon = t.icon;
                  return (
                    <div key={t.key}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-2 text-surface-700 font-medium">
                          <Icon className="w-3.5 h-3.5 text-surface-400" />
                          {t.label}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-surface-800 tabular-nums">
                            {formatNumber(t.used)}
                            {t.cap > 0 ? ` / ${formatNumber(t.cap)}` : ""}
                          </span>
                          <span className={cn("font-semibold", TONE_TEXT[state.tone])}>{state.label}</span>
                        </span>
                      </div>
                      <ProgressBar pct={state.pct ?? 0} color={TONE_BAR[state.tone]} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Plan entitlements table */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-200">
                <h3 className="text-sm font-semibold text-surface-900">Plan entitlements — {capitalize(plan.planCode)}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Metric</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Included</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Used</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {entitlementRows.map((row) => {
                      const pct = row.cap > 0 && row.used !== null ? Math.round((row.used / row.cap) * 100) : null;
                      return (
                        <tr key={row.metric} className="hover:bg-surface-50 transition-colors">
                          <td className="px-5 py-3 font-medium text-surface-900">
                            {row.metric}
                            {row.note && <p className="text-[11px] text-surface-400 mt-0.5">{row.note}</p>}
                          </td>
                          <td className="px-5 py-3 text-surface-600 tabular-nums">
                            {row.cap > 0 ? formatNumber(row.cap) : <span className="text-surface-400">Not configured</span>}
                          </td>
                          <td className="px-5 py-3 text-surface-600 tabular-nums">
                            {row.used === null ? <span className="text-surface-400">Not tracked</span> : formatNumber(row.used)}
                          </td>
                          <td className="px-5 py-3 tabular-nums">{pct === null ? <span className="text-surface-400">—</span> : `${pct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <InsightCard title="Usage by module">
              {moduleData.length === 0 ? (
                <p className="text-xs text-surface-400">No run usage recorded by module yet.</p>
              ) : (
                <div className="flex items-center gap-5">
                  <DonutChart data={moduleData} centerValue={formatNumber(totalModuleUsage)} centerLabel="Runs" size={140} thickness={20} />
                  <div className="flex-1 min-w-0">
                    <DonutLegend data={moduleData} />
                  </div>
                </div>
              )}
            </InsightCard>

            <InsightCard title="Execution concurrency">
              {plan.concurrencyCap > 0 ? (
                <p className="text-xs text-surface-600">
                  Up to <span className="font-semibold text-surface-900">{plan.concurrencyCap}</span> automation{plan.concurrencyCap === 1 ? "" : "s"} can run in
                  parallel for this workspace on the {capitalize(plan.planCode)} plan.
                </p>
              ) : (
                <p className="text-xs text-surface-400">Execution concurrency is not configured for this plan.</p>
              )}
            </InsightCard>

            <InsightCard title="Webhook retry policy" action={<RotateCw className="w-3.5 h-3.5 text-surface-300" />}>
              {retryPolicy ? (
                <ul className="space-y-1.5 text-xs text-surface-600">
                  <li className="flex justify-between"><span>Strategy</span><span className="font-semibold text-surface-900 capitalize">{(retryPolicy.strategy ?? "—").replace(/_/g, " ")}</span></li>
                  <li className="flex justify-between"><span>Max retries</span><span className="font-semibold text-surface-900 tabular-nums">{retryPolicy.max_retries ?? "—"}</span></li>
                  <li className="flex justify-between"><span>Initial delay</span><span className="font-semibold text-surface-900 tabular-nums">{retryPolicy.initial_delay_ms ? `${retryPolicy.initial_delay_ms}ms` : "—"}</span></li>
                  <li className="flex justify-between"><span>Max delay</span><span className="font-semibold text-surface-900 tabular-nums">{retryPolicy.max_delay_ms ? `${(retryPolicy.max_delay_ms / 1000).toFixed(0)}s` : "—"}</span></li>
                </ul>
              ) : (
                <p className="text-xs text-surface-400">No active outgoing webhook is configured yet, so there&apos;s no retry policy to show. Configure one in Integrations.</p>
              )}
            </InsightCard>

            <InsightCard title="Overage pricing">
              <p className="text-xs text-surface-400">Overage pricing is not configured for this plan. Contact billing if you need a custom entitlement above the caps shown here.</p>
            </InsightCard>

            <InsightCard title="Top active seats by usage" action={<Users className="w-3.5 h-3.5 text-surface-300" />}>
              <p className="text-xs text-surface-600 mb-1">
                <span className="font-semibold text-surface-900">{activeSeatsUsed}</span> active seat{activeSeatsUsed === 1 ? "" : "s"} on this workspace
                {plan.activeSeatsCap > 0 ? ` (of ${plan.activeSeatsCap} included)` : ""}.
              </p>
              <p className="text-[11px] text-surface-400">Per-seat usage isn&apos;t tracked in this release — automation usage events are recorded at the workspace level, not per user.</p>
            </InsightCard>

            <InsightCard title="Recommendations">
              {recommendations.length === 0 ? (
                <p className="text-xs text-success-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> You&apos;re well within your plan limits this month.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recommendations.map((r) => (
                    <li key={r.key} className="flex items-start gap-2 text-xs">
                      {r.state.tone === "danger" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-danger-600 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-warning-600 shrink-0 mt-0.5" />
                      )}
                      <span className="text-surface-600">
                        You&apos;re approaching your <span className="font-medium text-surface-900">{r.label.toLowerCase()}</span> limit
                        ({Math.round(r.state.pct ?? 0)}% used). Consider upgrading your plan in{" "}
                        <Link href="/event-manager/settings/billing" className="text-brand-600 hover:text-brand-700 font-medium">
                          Billing settings
                        </Link>
                        .
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>
          </div>
        </div>
      </div>
    </div>
  );
}
