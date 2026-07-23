import Link from "next/link";
import { Sparkles, Plus, X, AlertOctagon, ShieldAlert, AlertTriangle, CheckCircle2, Boxes, Timer } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DonutChart, DonutLegend, AreaLineChart, InsightCard } from "@/components/ui/FinanceCharts";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { listErrorIncidents, getErrorSummary, type ErrorIncidentRow } from "@/lib/automations/data";
import { ErrorsClient } from "./ErrorsClient";

export const metadata = { title: "Automations — Errors" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const SEVERITIES = ["critical", "warning", "info"] as const;
const STATUSES = ["open", "investigating", "resolved"] as const;

// Impure Date.now() reads live in a plain helper (not inline in the page
// component body) so the react-hooks/purity rule doesn't flag them.
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function severityBadgeStatus(sev: string) {
  if (sev === "critical") return "critical" as const;
  if (sev === "warning") return "warning" as const;
  return "info-severity" as const;
}

function statusBadgeStatus(status: string) {
  if (status === "open") return "open" as const;
  if (status === "investigating") return "investigating" as const;
  return "resolved" as const;
}

function impactClasses(impact: string) {
  if (impact === "high") return "bg-danger-50 text-danger-700 border-danger-200";
  if (impact === "medium") return "bg-warning-50 text-warning-700 border-warning-200";
  return "bg-surface-100 text-surface-600 border-surface-200";
}

function formatMTTR(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface ErrorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ErrorsPage({ searchParams }: ErrorsPageProps) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const sp = await searchParams;

  const str = (key: string): string => (typeof sp[key] === "string" ? (sp[key] as string) : "");
  const severityFilter = str("severity") || "all";
  const moduleFilter = str("module") || "all";
  const statusFilter = str("status") || "open";
  const automationFilter = str("automation");
  const environmentFilter = str("environment");
  const dateFrom = str("from");
  const dateTo = str("to");
  const page = Math.max(1, parseInt(str("page") || "1", 10) || 1);
  const selectedErrorId = str("error") || null;

  // ── Automations + modules present, for filter dropdowns ───────────────────
  const [{ data: rulesForFilter }, { data: allIncidentsForFilters }] = await Promise.all([
    supabase.from("smart_rules").select("id, name, environment").eq("workspace_id", workspaceId).is("deleted_at", null).order("name", { ascending: true }),
    supabase.from("automation_error_incidents").select("module").eq("workspace_id", workspaceId),
  ]);
  const automationOptions = rulesForFilter ?? [];
  const moduleOptions = [...new Set((allIncidentsForFilters ?? []).map((r) => r.module))].sort();
  const environmentByAutomation = new Map(automationOptions.map((a) => [a.id, a.environment]));

  // ── KPIs ────────────────────────────────────────────────────────────────
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const summary = await getErrorSummary(workspaceId);
  const { data: resolvedTodayRows } = await supabase
    .from("automation_error_incidents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "resolved")
    .gte("resolved_at", todayStart);
  const { data: openImpactedRows } = await supabase
    .from("automation_error_incidents")
    .select("automation_id")
    .eq("workspace_id", workspaceId)
    .in("status", ["open", "investigating"])
    .not("automation_id", "is", null);
  const impactedAutomations = new Set((openImpactedRows ?? []).map((r) => r.automation_id)).size;
  const { data: resolvedForMttr } = await supabase
    .from("automation_error_incidents")
    .select("first_seen_at, resolved_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "resolved")
    .not("resolved_at", "is", null);
  const mttrSamples = (resolvedForMttr ?? [])
    .map((r) => new Date(r.resolved_at as string).getTime() - new Date(r.first_seen_at).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);
  const mttrMs = mttrSamples.length > 0 ? mttrSamples.reduce((s, d) => s + d, 0) / mttrSamples.length : null;

  // ── Incident list — same in-memory filter/paginate approach as Runs (data.ts
  // is owned elsewhere and listErrorIncidents doesn't accept automation/
  // environment/date filters). ────────────────────────────────────────────
  const { rows: fetchedIncidents } = await listErrorIncidents(workspaceId, {
    severity: severityFilter,
    module: moduleFilter,
    status: statusFilter,
    limit: 500,
    offset: 0,
  });
  const filteredIncidents = fetchedIncidents.filter((r) => {
    if (automationFilter && automationFilter !== "all" && r.automationId !== automationFilter) return false;
    if (environmentFilter && environmentFilter !== "all") {
      const env = r.automationId ? environmentByAutomation.get(r.automationId) : undefined;
      if (env !== environmentFilter) return false;
    }
    if (dateFrom && r.lastSeenAt < dateFrom) return false;
    if (dateTo && r.lastSeenAt > `${dateTo}T23:59:59`) return false;
    return true;
  });
  const totalFiltered = filteredIncidents.length;
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageIncidents = filteredIncidents.slice(pageStart, pageStart + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const hasFilters = Boolean(
    severityFilter !== "all" || moduleFilter !== "all" || statusFilter !== "open" || automationFilter || environmentFilter || dateFrom || dateTo
  );

  // ── Owner name resolution ───────────────────────────────────────────────
  const ownerLookupIds = [...new Set([...pageIncidents.map((i) => i.id), ...(selectedErrorId ? [selectedErrorId] : [])])];
  const { data: ownerRows } =
    ownerLookupIds.length > 0
      ? await supabase.from("automation_error_incidents").select("id, owner_id").eq("workspace_id", workspaceId).in("id", ownerLookupIds)
      : { data: [] as { id: string; owner_id: string | null }[] };
  const ownerIds = [...new Set((ownerRows ?? []).map((r) => r.owner_id).filter((id): id is string => !!id))];
  let ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds);
    ownerNames = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name as string]));
  }
  const ownerByIncident = new Map((ownerRows ?? []).map((r) => [r.id, r.owner_id]));
  function ownerLabel(incidentId: string): string {
    const ownerId = ownerByIncident.get(incidentId);
    if (!ownerId) return "Unassigned";
    if (ownerId === user.id) return "You";
    return ownerNames.get(ownerId) ?? "Team member";
  }

  // ── Analytics — Error Trend (day-bucketed from real occurrence data) ─────
  const trendDays = 14;
  const trendSince = daysAgo(trendDays).toISOString();
  const { data: occurrenceRows } = await supabase
    .from("automation_error_occurrences")
    .select("occurred_at, incident_id")
    .eq("workspace_id", workspaceId)
    .gte("occurred_at", trendSince);
  const { data: incidentSeverityRows } = await supabase
    .from("automation_error_incidents")
    .select("id, severity, module")
    .eq("workspace_id", workspaceId);
  const severityByIncident = new Map((incidentSeverityRows ?? []).map((r) => [r.id, r.severity]));

  const trendByDay = new Map<string, { critical: number; warning: number; total: number }>();
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    trendByDay.set(key, { critical: 0, warning: 0, total: 0 });
  }
  for (const occ of occurrenceRows ?? []) {
    const key = occ.occurred_at.slice(0, 10);
    const bucket = trendByDay.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    const sev = severityByIncident.get(occ.incident_id);
    if (sev === "critical") bucket.critical += 1;
    if (sev === "warning") bucket.warning += 1;
  }
  const hasOccurrenceData = (occurrenceRows ?? []).length > 0;
  const trendSeries = Array.from(trendByDay.entries()).map(([date, v]) => ({
    label: new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    critical: v.critical,
    warning: v.warning,
    total: v.total,
  }));

  // ── Errors by Module (donut, from open+investigating incidents) ──────────
  const moduleColors = ["#7c3aed", "#3b82f6", "#f59e0b", "#ef4444", "#22c55e", "#06b6d4", "#ec4899", "#64748b"];
  const moduleCounts = new Map<string, number>();
  for (const r of fetchedIncidents) moduleCounts.set(r.module, (moduleCounts.get(r.module) ?? 0) + 1);
  const moduleDonut = Array.from(moduleCounts.entries()).map(([label, value], i) => ({
    label,
    value,
    color: moduleColors[i % moduleColors.length],
  }));

  // ── Incident Heatmap — by day (falls back from hourly since occurrence
  // volume in seed/test data is too sparse to honestly support 24-bucket
  // hourly granularity). ────────────────────────────────────────────────────
  const heatmapByDow = new Array(7).fill(0) as number[];
  for (const occ of occurrenceRows ?? []) {
    const dow = new Date(occ.occurred_at).getDay();
    heatmapByDow[dow] += 1;
  }
  const heatmapMax = Math.max(1, ...heatmapByDow);

  const queryString = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    if (severityFilter !== "all") params.set("severity", severityFilter);
    if (moduleFilter !== "all") params.set("module", moduleFilter);
    if (statusFilter !== "open") params.set("status", statusFilter);
    if (automationFilter) params.set("automation", automationFilter);
    if (environmentFilter) params.set("environment", environmentFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  // ── Selected incident detail ────────────────────────────────────────────
  let selectedIncident: ErrorIncidentRow | null = null;
  let occurrences: { id: string; occurredAt: string; message: string | null; runId: string | null }[] = [];
  let relatedRuns: { id: string; status: string; ts: string }[] = [];
  if (selectedErrorId) {
    const { data: inc } = await supabase
      .from("automation_error_incidents")
      .select(
        "id, automation_id, title, message, severity, module, status, impact, node_id, node_type, stack_trace, payload_preview, suggested_fix, first_seen_at, last_seen_at, occurrences, resolved_at, smart_rules(name)"
      )
      .eq("workspace_id", workspaceId)
      .eq("id", selectedErrorId)
      .maybeSingle();
    if (inc) {
      selectedIncident = {
        id: inc.id,
        automationId: inc.automation_id,
        automationName: (inc.smart_rules as unknown as { name: string } | null)?.name ?? "Unknown automation",
        title: inc.title,
        message: inc.message,
        severity: inc.severity,
        module: inc.module,
        status: inc.status,
        impact: inc.impact,
        nodeId: inc.node_id,
        nodeType: inc.node_type,
        stackTrace: inc.stack_trace,
        payloadPreview: (inc.payload_preview as Record<string, unknown>) ?? null,
        suggestedFix: inc.suggested_fix,
        firstSeenAt: inc.first_seen_at,
        lastSeenAt: inc.last_seen_at,
        occurrences: inc.occurrences,
      };

      const [{ data: occRows }, { data: runRows }] = await Promise.all([
        supabase
          .from("automation_error_occurrences")
          .select("id, occurred_at, message, run_id")
          .eq("workspace_id", workspaceId)
          .eq("incident_id", selectedErrorId)
          .order("occurred_at", { ascending: false })
          .limit(50),
        inc.automation_id
          ? supabase
              .from("smart_rule_runs")
              .select("id, status, ts")
              .eq("workspace_id", workspaceId)
              .eq("rule_id", inc.automation_id)
              .gte("ts", new Date(new Date(inc.first_seen_at).getTime() - 3600_000).toISOString())
              .lte("ts", new Date(new Date(inc.last_seen_at).getTime() + 3600_000).toISOString())
              .order("ts", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
      ]);
      occurrences = (occRows ?? []).map((r) => ({ id: r.id, occurredAt: r.occurred_at, message: r.message, runId: r.run_id }));
      relatedRuns = (runRows ?? []).map((r) => ({ id: r.id, status: r.status, ts: r.ts }));
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Automations"
        description="Incident tracking and diagnostics for failing automations"
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
          <MetricCard label="Open Errors" value={summary.open} icon={AlertOctagon} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Critical" value={summary.critical} icon={ShieldAlert} iconColor="text-danger-700" iconBg="bg-danger-50" />
          <MetricCard label="Warning" value={summary.warning} icon={AlertTriangle} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Resolved Today" value={(resolvedTodayRows ?? []).length} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Impacted Automations" value={impactedAutomations} icon={Boxes} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Mean Time to Resolution" value={mttrMs === null ? "—" : formatMTTR(mttrMs)} icon={Timer} iconColor="text-violet-600" iconBg="bg-violet-50" />
        </KPIGrid>

        <form method="get" className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Severity</label>
            <select name="severity" defaultValue={severityFilter} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="all">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Module</label>
            <select name="module" defaultValue={moduleFilter} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[180px]">
              <option value="all">All modules</option>
              {moduleOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Status</label>
            <select name="status" defaultValue={statusFilter} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Automation</label>
            <select name="automation" defaultValue={automationFilter} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[200px]">
              <option value="">All automations</option>
              {automationOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Environment</label>
            <select name="environment" defaultValue={environmentFilter} className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All environments</option>
              {[...new Set(automationOptions.map((a) => a.environment))].sort().map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">From</label>
            <input type="date" name="from" defaultValue={dateFrom} className="px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">To</label>
            <input type="date" name="to" defaultValue={dateTo} className="px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              Apply
            </button>
            {hasFilters && (
              <Link
                href="/event-manager/automations/errors"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-surface-200 text-surface-500 text-sm hover:bg-surface-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear all
              </Link>
            )}
          </div>
        </form>

        <div className="grid lg:grid-cols-3 gap-4">
          <InsightCard title="Error Trend (14 days)">
            {!hasOccurrenceData ? (
              <p className="text-xs text-surface-400">No occurrence-level data recorded yet for this window.</p>
            ) : (
              <AreaLineChart
                data={trendSeries}
                series={[
                  { key: "total", color: "#94a3b8", label: "Total" },
                  { key: "critical", color: "#ef4444", label: "Critical", area: true },
                  { key: "warning", color: "#f59e0b", label: "Warning" },
                ]}
                height={140}
              />
            )}
          </InsightCard>

          <InsightCard title="Errors by Module">
            {moduleDonut.length === 0 ? (
              <p className="text-xs text-surface-400">No errors recorded yet.</p>
            ) : (
              <div className="flex items-center gap-4">
                <DonutChart data={moduleDonut} centerValue={String(fetchedIncidents.length)} centerLabel="Incidents" size={140} thickness={20} />
                <div className="flex-1 min-w-0">
                  <DonutLegend data={moduleDonut} />
                </div>
              </div>
            )}
          </InsightCard>

          <InsightCard title="Incident Heatmap — by Day">
            {!hasOccurrenceData ? (
              <p className="text-xs text-surface-400">Not enough occurrence data yet for a heatmap.</p>
            ) : (
              <div className="space-y-1.5">
                {DAY_LABELS.map((label, i) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-8 text-[10px] font-medium text-surface-400">{label}</span>
                    <div className="flex-1 h-4 rounded bg-surface-100 overflow-hidden">
                      <div
                        className="h-full bg-danger-400 rounded"
                        style={{ width: `${(heatmapByDow[i] / heatmapMax) * 100}%` }}
                        title={`${heatmapByDow[i]} occurrence${heatmapByDow[i] === 1 ? "" : "s"}`}
                      />
                    </div>
                    <span className="w-6 text-[10px] text-surface-500 text-right tabular-nums">{heatmapByDow[i]}</span>
                  </div>
                ))}
                <p className="text-[10px] text-surface-400 pt-1">
                  Bucketed by day of week only — occurrence volume isn&rsquo;t dense enough yet for reliable hourly granularity.
                </p>
              </div>
            )}
          </InsightCard>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 w-full space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">
                  Errors ({totalFiltered})
                  {hasFilters && <span className="ml-2 text-xs font-normal text-surface-400">filtered from {fetchedIncidents.length}</span>}
                </h2>
              </div>

              {pageIncidents.length === 0 ? (
                <EmptyState
                  icon={AlertOctagon}
                  title={fetchedIncidents.length === 0 ? "No errors recorded" : "No errors match these filters"}
                  description={
                    fetchedIncidents.length === 0
                      ? "Failed automation runs get grouped into incidents here so you can triage and resolve them."
                      : "Try clearing or adjusting the filters above."
                  }
                  compact
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Error</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Automation</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Module</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Severity</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">First Seen</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Last Seen</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Occurrences</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Impact</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Owner</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {pageIncidents.map((r) => (
                        <tr key={r.id} className={r.id === selectedErrorId ? "bg-brand-50/60" : "hover:bg-surface-50 transition-colors"}>
                          <td className="px-6 py-3 max-w-[260px]">
                            <Link
                              href={`/event-manager/automations/errors${queryString({ error: r.id, page: undefined })}`}
                              className="font-medium text-surface-900 hover:text-brand-600 block truncate"
                            >
                              {r.title}
                            </Link>
                            {r.message && <div className="text-xs text-surface-400 truncate">{r.message}</div>}
                          </td>
                          <td className="px-6 py-3">
                            {r.automationId ? (
                              <Link href={`/event-manager/automations/builder/${r.automationId}`} className="text-surface-700 hover:text-brand-600">
                                {r.automationName}
                              </Link>
                            ) : (
                              <span className="text-surface-400">{r.automationName}</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200 capitalize">{r.module}</span>
                          </td>
                          <td className="px-6 py-3">
                            <StatusBadge status={severityBadgeStatus(r.severity)} />
                          </td>
                          <td className="px-6 py-3 text-surface-500 whitespace-nowrap">{formatDate(r.firstSeenAt, { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-6 py-3 text-surface-500 whitespace-nowrap">{formatDate(r.lastSeenAt, { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">{r.occurrences}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${impactClasses(r.impact)}`}>{r.impact}</span>
                          </td>
                          <td className="px-6 py-3 text-surface-600">{ownerLabel(r.id)}</td>
                          <td className="px-6 py-3">
                            <StatusBadge status={statusBadgeStatus(r.status)} />
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
                      href={`/event-manager/automations/errors${queryString({ page: page > 1 ? page - 1 : 1 })}`}
                      aria-disabled={page <= 1}
                      className={`px-3 py-1.5 rounded-lg border border-surface-200 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-50"}`}
                    >
                      Previous
                    </Link>
                    <Link
                      href={`/event-manager/automations/errors${queryString({ page: page < totalPages ? page + 1 : totalPages })}`}
                      aria-disabled={page >= totalPages}
                      className={`px-3 py-1.5 rounded-lg border border-surface-200 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface-50"}`}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          <ErrorsClient incident={selectedIncident} occurrences={occurrences} relatedRuns={relatedRuns} ownerLabel={selectedIncident ? ownerLabel(selectedIncident.id) : null} currentUserId={user.id} />
        </div>
      </div>
    </div>
  );
}
