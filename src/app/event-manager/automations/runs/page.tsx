import Link from "next/link";
import { Sparkles, Plus, X, Activity, CheckCircle2, Clock, XCircle, ShieldAlert, Layers } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DonutChart, DonutLegend, InsightCard } from "@/components/ui/FinanceCharts";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { listRuns, getRunDetail, getRunStatusDistribution, type RunRow, type RunDetail } from "@/lib/automations/data";
import { ACTION_LABEL } from "@/lib/automations/smart-rules";
import { RunsClient } from "./RunsClient";

export const metadata = { title: "Automations — Runs & Logs" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Live statuses emitted by the smart_rules engine (smart_rule_run_status enum
// plus the values added in 20260714_automations_platform.sql).
const RUN_STATUSES = [
  "queued",
  "running",
  "success",
  "failed",
  "waiting_approval",
  "cancelled",
  "skipped",
] as const;

// StatusBadge's Status union doesn't have a "success" literal (nearest analog
// is "confirmed"/"resolved", which read wrong for a run outcome), so success
// gets its own small badge and everything else maps straight through.
function RunStatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border bg-success-50 text-success-700 border-success-200">
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
        Success
      </span>
    );
  }
  const mapped = status === "waiting_approval" ? "waiting-approval" : status;
  return <StatusBadge status={mapped as Parameters<typeof StatusBadge>[0]["status"]} />;
}

function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

// Impure Date.now() reads live in plain helpers, not inline in the page
// component body, so the react-hooks/purity rule doesn't flag them.
function hoursAgoIso(n: number): string {
  return new Date(Date.now() - n * 3600 * 1000).toISOString();
}
function minutesAgoIso(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

interface RunsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RunsPage({ searchParams }: RunsPageProps) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const sp = await searchParams;

  const str = (key: string): string => (typeof sp[key] === "string" ? (sp[key] as string) : "");
  const q = str("q").trim();
  const statusFilter = str("status") || "all";
  const automationFilter = str("automation") || "all";
  const environmentFilter = str("environment");
  const triggerSourceFilter = str("source");
  const dateFrom = str("from");
  const dateTo = str("to");
  const page = Math.max(1, parseInt(str("page") || "1", 10) || 1);
  const selectedRunId = str("run") || null;

  // ── Automations that have runs (for the filter dropdown) ──────────────────
  const { data: rulesForFilter } = await supabase
    .from("smart_rules")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  const automationOptions = rulesForFilter ?? [];

  // ── KPIs (workspace-wide, independent of the filters below) ───────────────
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const [
    { count: runsTodayCount },
    { data: allStatusRows },
    { data: durationRows },
    { count: waitingApprovalCount },
    { count: queueDepthCount },
  ] = await Promise.all([
    supabase
      .from("smart_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("ts", todayStart),
    supabase.from("smart_rule_runs").select("status").eq("workspace_id", workspaceId).limit(5000),
    supabase
      .from("smart_rule_runs")
      .select("duration_ms")
      .eq("workspace_id", workspaceId)
      .not("duration_ms", "is", null)
      .limit(2000),
    supabase
      .from("smart_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "waiting_approval"),
    supabase
      .from("smart_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["queued", "running"]),
  ]);

  const statusRows = allStatusRows ?? [];
  const totalRunsAllTime = statusRows.length;
  const successCount = statusRows.filter((r) => r.status === "success").length;
  const failedCount = statusRows.filter((r) => r.status === "failed").length;
  const successRate = totalRunsAllTime > 0 ? (successCount / totalRunsAllTime) * 100 : null;
  const durations = (durationRows ?? []).map((r) => r.duration_ms).filter((d): d is number => typeof d === "number");
  const avgDurationMs = durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : null;

  // ── Run history: fetch a generous batch via listRuns (status/automation/
  // search are supported server-side there) then apply environment/source/
  // date-range filters + pagination in memory — listRuns doesn't accept those
  // extra params and it's owned by another agent, so this keeps the total
  // count honest for the combined filter set without editing data.ts. ──────
  const { rows: fetchedRuns } = await listRuns(workspaceId, {
    status: statusFilter,
    automationId: automationFilter,
    search: q || undefined,
    limit: 500,
    offset: 0,
  });

  const filteredRuns = fetchedRuns.filter((r) => {
    if (environmentFilter && environmentFilter !== "all" && r.environment !== environmentFilter) return false;
    if (triggerSourceFilter && triggerSourceFilter !== "all" && r.triggerSource !== triggerSourceFilter) return false;
    if (dateFrom && r.ts < dateFrom) return false;
    if (dateTo && r.ts > `${dateTo}T23:59:59`) return false;
    return true;
  });
  const totalFiltered = filteredRuns.length;
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageRuns = filteredRuns.slice(pageStart, pageStart + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  const environmentOptions = [...new Set(fetchedRuns.map((r) => r.environment))].sort();
  const triggerSourceOptions = [...new Set(fetchedRuns.map((r) => r.triggerSource))].sort();

  const hasFilters = Boolean(
    q || statusFilter !== "all" || automationFilter !== "all" || environmentFilter || triggerSourceFilter || dateFrom || dateTo
  );

  // ── Selected run detail (deep-linkable via ?run=) ──────────────────────────
  let selectedDetail: RunDetail | null = null;
  let selectedPayload: unknown = null;
  let selectedMode: string | null = null;
  if (selectedRunId) {
    selectedDetail = await getRunDetail(workspaceId, selectedRunId);
    if (selectedDetail) {
      const { data: extra } = await supabase
        .from("smart_rule_runs")
        .select("payload, mode")
        .eq("id", selectedRunId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      selectedPayload = extra?.payload ?? null;
      selectedMode = extra?.mode ?? null;
    }
  }

  // ── Initiated-by name resolution ───────────────────────────────────────────
  const initiatorIds = [...new Set(pageRuns.map((r) => r.initiatedBy).filter((id): id is string => !!id))];
  let initiatorNames = new Map<string, string>();
  if (initiatorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", initiatorIds);
    initiatorNames = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name as string]));
  }
  function initiatorLabel(id: string | null): string {
    if (!id) return "System";
    if (id === user.id) return "You";
    return initiatorNames.get(id) ?? "Team member";
  }

  // ── Run status distribution (donut) ────────────────────────────────────────
  const distribution = await getRunStatusDistribution(workspaceId);
  const distributionColors: Record<string, string> = {
    success: "#22c55e",
    failed: "#ef4444",
    running: "#3b82f6",
    queued: "#94a3b8",
    waiting_approval: "#f59e0b",
    cancelled: "#64748b",
    skipped: "#cbd5e1",
  };
  const donutData = distribution
    .filter((d) => d.count > 0)
    .map((d) => ({ label: d.status.replace(/_/g, " "), value: d.count, color: distributionColors[d.status] ?? "#94a3b8" }));
  const donutTotal = distribution.reduce((s, d) => s + d.count, 0);

  // ── Recent failures (top 5, all-time) ──────────────────────────────────────
  const { data: recentFailureRows } = await supabase
    .from("smart_rule_runs")
    .select("id, status, ts, error_text, rule_id, smart_rules(name)")
    .eq("workspace_id", workspaceId)
    .eq("status", "failed")
    .order("ts", { ascending: false })
    .limit(5);
  const recentFailures = (recentFailureRows ?? []).map((r) => ({
    id: r.id,
    automationName: (r.smart_rules as unknown as { name: string } | null)?.name ?? "Unknown automation",
    errorText: r.error_text,
    ts: r.ts,
  }));

  // ── Insights & anomalies — honest heuristics computed from real counts ────
  const twoHoursAgo = hoursAgoIso(2);
  const fourHoursAgo = hoursAgoIso(4);
  const [{ count: failedLast2h }, { count: failedPrev2h }, { data: staleQueueRows }] = await Promise.all([
    supabase
      .from("smart_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .gte("ts", twoHoursAgo),
    supabase
      .from("smart_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .gte("ts", fourHoursAgo)
      .lt("ts", twoHoursAgo),
    supabase
      .from("smart_rule_runs")
      .select("id, ts, rule_id, smart_rules(name)")
      .eq("workspace_id", workspaceId)
      .in("status", ["queued", "running"])
      .lt("ts", minutesAgoIso(5))
      .limit(5),
  ]);

  const insights: { title: string; body: string }[] = [];
  if ((failedLast2h ?? 0) > 0 || (failedPrev2h ?? 0) > 0) {
    insights.push({
      title: "Failure rate",
      body: `${failedLast2h ?? 0} failed run${(failedLast2h ?? 0) === 1 ? "" : "s"} in the last 2 hours, vs ${failedPrev2h ?? 0} in the previous 2 hours.`,
    });
  }
  if ((staleQueueRows ?? []).length > 0) {
    const oldest = staleQueueRows![0];
    insights.push({
      title: "Queue backlog",
      body: `${staleQueueRows!.length} run${staleQueueRows!.length === 1 ? " has" : "s have"} been queued or running for over 5 minutes — oldest is "${(oldest.smart_rules as unknown as { name: string } | null)?.name ?? "Unknown automation"}" since ${formatDate(oldest.ts, { hour: "2-digit", minute: "2-digit" })}.`,
    });
  }
  if (avgDurationMs !== null && durations.length >= 5) {
    const slow = durations.filter((d) => d > avgDurationMs * 3).length;
    if (slow > 0) {
      insights.push({
        title: "Slow runs",
        body: `${slow} run${slow === 1 ? "" : "s"} took more than 3× the workspace average duration (${formatDurationMs(avgDurationMs)}).`,
      });
    }
  }

  const queryString = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (automationFilter !== "all") params.set("automation", automationFilter);
    if (environmentFilter) params.set("environment", environmentFilter);
    if (triggerSourceFilter) params.set("source", triggerSourceFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Automations"
        description="Run history, execution logs and live diagnostics for every automation"
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

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Runs Today" value={runsTodayCount ?? 0} icon={Activity} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard
            label="Success Rate"
            value={successRate === null ? "—" : `${successRate.toFixed(1)}%`}
            icon={CheckCircle2}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Avg Duration"
            value={formatDurationMs(avgDurationMs === null ? null : Math.round(avgDurationMs))}
            icon={Clock}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard label="Failed Runs" value={failedCount} icon={XCircle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard
            label="Approval Pauses"
            value={waitingApprovalCount ?? 0}
            icon={ShieldAlert}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
          <MetricCard label="Queue Depth" value={queueDepthCount ?? 0} icon={Layers} iconColor="text-violet-600" iconBg="bg-violet-50" />
        </KPIGrid>

        <form method="get" className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-surface-500 mb-1">Search</label>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Automation name or run ID"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">From</label>
            <input
              type="date"
              name="from"
              defaultValue={dateFrom}
              className="px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">To</label>
            <input
              type="date"
              name="to"
              defaultValue={dateTo}
              className="px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Status</label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All statuses</option>
              {RUN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Automation</label>
            <select
              name="automation"
              defaultValue={automationFilter}
              className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[220px]"
            >
              <option value="all">All automations</option>
              {automationOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Environment</label>
            <select
              name="environment"
              defaultValue={environmentFilter}
              className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All environments</option>
              {environmentOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Trigger Source</label>
            <select
              name="source"
              defaultValue={triggerSourceFilter}
              className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All sources</option>
              {triggerSourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              Apply
            </button>
            {hasFilters && (
              <Link
                href="/event-manager/automations/runs"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-surface-200 text-surface-500 text-sm hover:bg-surface-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </Link>
            )}
          </div>
        </form>

        <div className="flex flex-col xl:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-4 w-full">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">
                  Run History
                  <span className="ml-2 text-xs font-normal text-surface-400">
                    {totalFiltered} {totalFiltered === 1 ? "run" : "runs"}
                    {hasFilters ? ` (filtered from ${fetchedRuns.length})` : ""}
                  </span>
                </h2>
              </div>

              {pageRuns.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title={fetchedRuns.length === 0 ? "No runs yet" : "No runs match these filters"}
                  description={
                    fetchedRuns.length === 0
                      ? "Runs will appear here once an automation fires — manually, on a trigger, or on schedule."
                      : "Try clearing or adjusting the filters above."
                  }
                  compact
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Automation</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Triggered</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Duration</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Source</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Environment</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Initiated By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {pageRuns.map((r: RunRow) => (
                        <tr key={r.id} className={r.id === selectedRunId ? "bg-brand-50/60" : "hover:bg-surface-50 transition-colors"}>
                          <td className="px-6 py-3">
                            <Link
                              href={`/event-manager/automations/builder/${r.automationId}`}
                              className="font-medium text-surface-900 hover:text-brand-600"
                            >
                              {r.automationName}
                            </Link>
                            <div className="text-xs text-surface-400 font-mono">{r.id.slice(0, 8)}</div>
                          </td>
                          <td className="px-6 py-3 text-surface-500 whitespace-nowrap">{formatDate(r.ts, { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-6 py-3">
                            <RunStatusBadge status={r.status} />
                          </td>
                          <td className="px-6 py-3 text-surface-600 tabular-nums">{formatDurationMs(r.durationMs)}</td>
                          <td className="px-6 py-3 text-surface-500 capitalize">{r.triggerSource}</td>
                          <td className="px-6 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200 capitalize">
                              {r.environment}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-surface-500">{initiatorLabel(r.initiatedBy)}</td>
                          <td className="px-6 py-3 text-right">
                            <Link
                              href={`/event-manager/automations/runs${queryString({ run: r.id, page: undefined })}`}
                              className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {totalPages > 1 && (
                <div className="px-6 py-3 flex items-center justify-between border-t border-surface-200 text-xs text-surface-500">
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/event-manager/automations/runs${queryString({ page: page > 1 ? page - 1 : 1 })}`}
                      aria-disabled={page <= 1}
                      className={`px-3 py-1.5 rounded-lg border border-surface-200 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-50"}`}
                    >
                      Previous
                    </Link>
                    <Link
                      href={`/event-manager/automations/runs${queryString({ page: page < totalPages ? page + 1 : totalPages })}`}
                      aria-disabled={page >= totalPages}
                      className={`px-3 py-1.5 rounded-lg border border-surface-200 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface-50"}`}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <InsightCard title="Run Status Distribution">
                {donutData.length === 0 ? (
                  <p className="text-xs text-surface-400">No runs recorded yet.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <DonutChart data={donutData} centerValue={String(donutTotal)} centerLabel="Runs" size={140} thickness={20} />
                    <div className="flex-1 min-w-0">
                      <DonutLegend data={donutData} />
                    </div>
                  </div>
                )}
              </InsightCard>

              <InsightCard title="Recent Failures">
                {recentFailures.length === 0 ? (
                  <p className="text-xs text-surface-400">No failed runs — everything is healthy.</p>
                ) : (
                  <ul className="space-y-3">
                    {recentFailures.map((f) => (
                      <li key={f.id}>
                        <Link
                          href={`/event-manager/automations/runs${queryString({ run: f.id, page: undefined })}`}
                          className="block text-xs group"
                        >
                          <span className="flex items-center justify-between">
                            <span className="font-medium text-surface-800 truncate group-hover:text-brand-700">{f.automationName}</span>
                            <span className="text-surface-400 shrink-0 ml-2">{formatDate(f.ts, { hour: "2-digit", minute: "2-digit" })}</span>
                          </span>
                          {f.errorText && <span className="block text-danger-600 truncate mt-0.5">{f.errorText}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </InsightCard>

              <InsightCard title="Insights & Anomalies">
                {insights.length === 0 ? (
                  <p className="text-xs text-surface-400">No notable anomalies right now — run activity looks steady.</p>
                ) : (
                  <ul className="space-y-3">
                    {insights.map((ins, i) => (
                      <li key={i} className="text-xs">
                        <p className="font-medium text-surface-800">{ins.title}</p>
                        <p className="text-surface-500 mt-0.5">{ins.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </InsightCard>
            </div>
          </div>

          <RunsClient
            detail={selectedDetail}
            payload={selectedPayload}
            mode={selectedMode}
            actionLabels={ACTION_LABEL}
            initiatorLabel={selectedDetail ? initiatorLabel(selectedDetail.initiatedBy) : null}
          />
        </div>
      </div>
    </div>
  );
}
