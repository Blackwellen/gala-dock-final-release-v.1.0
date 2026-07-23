import Link from "next/link";
import { Plus, FileText, Download, Target, TrendingUp, Percent, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, FINANCE_TABS } from "@/components/ui/SectionTabs";
import {
  FunnelChart,
  AreaLineChart,
  ChartCard,
  InsightsRail,
  InsightCard,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Proposal } from "@/lib/supabase/types";
import { proposalBadgeStatus, formatCentsCompact, dueLabel, FINANCE_CHART_COLORS as C } from "../_lib/finance";

export const metadata = { title: "Finance — Quotes" };
export const dynamic = "force-dynamic";

type ProposalRow = Pick<
  Proposal,
  | "id"
  | "event_id"
  | "title"
  | "client_name"
  | "status"
  | "total_cents"
  | "currency"
  | "valid_until"
  | "margin_pct"
  | "owner_id"
  | "created_at"
>;

/**
 * Synthesize a human-friendly quote code since proposals has no `code` column.
 * Uses the LAST 4 hex chars of the id rather than the first 4 — seed data (and
 * some hand-authored fixtures generally) share a common id prefix, so slicing
 * from the front produced duplicate-looking codes across otherwise-distinct rows.
 */
function quoteCode(p: Pick<ProposalRow, "id" | "created_at">): string {
  const year = new Date(p.created_at).getFullYear();
  const suffix = p.id.replace(/-/g, "").slice(-4).toUpperCase();
  return `Q-${year}-${suffix}`;
}

/** Derive a suggested next action from the proposal's current status. */
function nextActionFor(status: string): string {
  switch (status) {
    case "draft":
      return "Complete quote";
    case "sent":
      return "Follow up";
    case "viewed":
      return "Send case study";
    case "signed":
      return "Create project";
    default:
      return "—";
  }
}

export default async function QuotesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: proposalData }, { data: eventsData }, { data: expenseData }, { data: members }] =
    await Promise.all([
      supabase
        .from("proposals")
        .select(
          "id, event_id, title, client_name, status, total_cents, currency, valid_until, margin_pct, owner_id, created_at"
        )
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
      supabase.from("event_expenses").select("amount_cents, event_id").eq("workspace_id", workspaceId),
      supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).is("deleted_at", null),
    ]);

  const proposals = (proposalData ?? []) as ProposalRow[];
  const eventNames = new Map((eventsData ?? []).map((e) => [e.id, e.name]));
  const expenses = expenseData ?? [];

  // Owner display names (same pattern as proposals/page.tsx).
  const memberIds = (members ?? []).map((m) => m.user_id);
  const nameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    for (const p of profiles ?? []) {
      if (p.display_name) nameById.set(p.user_id, p.display_name);
    }
  }

  // Estimated cost-per-event, used only when a proposal has no real margin_pct.
  const costByEvent = new Map<string, number>();
  for (const e of expenses) {
    if (!e.event_id) continue;
    costByEvent.set(e.event_id, (costByEvent.get(e.event_id) ?? 0) + e.amount_cents);
  }

  function estimatedMarginPct(p: ProposalRow): number | null {
    if (p.margin_pct !== null && p.margin_pct !== undefined) return p.margin_pct;
    if (!p.event_id || p.total_cents <= 0) return null;
    const cost = costByEvent.get(p.event_id);
    if (cost === undefined) return null;
    return ((p.total_cents - cost) / p.total_cents) * 100;
  }

  const CLOSED_LOST = new Set(["declined", "expired"]);
  const CLOSED_WON = new Set(["signed", "converted"]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const totalQuotes = proposals.length;
  const pipelineValue = proposals
    .filter((p) => !CLOSED_LOST.has(p.status))
    .reduce((s, p) => s + p.total_cents, 0);
  // No sent_at column exists on proposals, so "Active" (anything past draft,
  // not yet closed) is the most honest count rather than faking a monthly cadence.
  const activeCount = proposals.filter((p) => !CLOSED_LOST.has(p.status) && !CLOSED_WON.has(p.status) && p.status !== "draft").length;
  const closedCount = proposals.filter((p) => CLOSED_WON.has(p.status) || CLOSED_LOST.has(p.status)).length;
  const wonCount = proposals.filter((p) => CLOSED_WON.has(p.status)).length;
  const winRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0;
  const marginValues = proposals.map((p) => estimatedMarginPct(p)).filter((v): v is number => v !== null);
  const avgMargin = marginValues.length > 0 ? marginValues.reduce((s, v) => s + v, 0) / marginValues.length : null;

  // ── Quote Pipeline funnel ─────────────────────────────────────────────
  const funnelSteps = [
    { label: "Draft", status: "draft", color: C.slate },
    { label: "Sent", status: "sent", color: C.info },
    { label: "Viewed", status: "viewed", color: C.warning },
    { label: "Signed", status: "signed", color: C.success },
  ].map((s) => ({
    label: s.label,
    value: proposals.filter((p) => p.status === s.status).length,
    color: s.color,
  }));

  // ── Win Rate by Month (last 6 months) ─────────────────────────────────
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }) };
  });
  const winRateSeries = months.map((m) => {
    const inMonth = proposals.filter((p) => {
      const d = new Date(p.created_at);
      return `${d.getFullYear()}-${d.getMonth()}` === m.key && (CLOSED_WON.has(p.status) || CLOSED_LOST.has(p.status));
    });
    const won = inMonth.filter((p) => CLOSED_WON.has(p.status)).length;
    return { label: m.label, winRate: inMonth.length > 0 ? Math.round((won / inMonth.length) * 100) : 0 };
  });

  // ── Expiring quotes (next 14 days) ────────────────────────────────────
  const now = new Date().getTime();
  const expiringQuotes = proposals
    .filter((p) => {
      if (!p.valid_until || CLOSED_WON.has(p.status) || CLOSED_LOST.has(p.status)) return false;
      const days = Math.round((new Date(p.valid_until).getTime() - now) / 86_400_000);
      return days >= 0 && days <= 14;
    })
    .sort((a, b) => new Date(a.valid_until!).getTime() - new Date(b.valid_until!).getTime())
    .slice(0, 5);

  // ── Top value opportunities ───────────────────────────────────────────
  const topOpportunities = proposals
    .filter((p) => !CLOSED_LOST.has(p.status) && p.status !== "converted")
    .sort((a, b) => b.total_cents - a.total_cents)
    .slice(0, 5);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Quotes"
        description="Create and manage event quotes"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/proposals/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Quote
            </Link>
            <button
              type="button"
              disabled
              title="CSV export isn't wired up yet"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-400 text-sm font-medium cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Total Quotes" value={totalQuotes} icon={FileText} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Pipeline Value" value={formatCentsCompact(pipelineValue)} icon={Target} iconColor="text-info-600" iconBg="bg-info-50" />
          <MetricCard label="Active Quotes" value={activeCount} icon={Send} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Win Rate" value={`${winRate.toFixed(0)}%`} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Est. Avg Margin" value={avgMargin !== null ? `${avgMargin.toFixed(1)}%` : "—"} icon={Percent} iconColor="text-violet-600" iconBg="bg-violet-50" />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200 gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-surface-900">All Quotes</h2>
                <span className="text-xs text-surface-400">
                  {proposals.length} {proposals.length === 1 ? "quote" : "quotes"}
                </span>
              </div>

              {proposals.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No quotes yet"
                  description="Create your first quote to start tracking your sales pipeline."
                  action={
                    <Link
                      href="/event-manager/proposals/new"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Create Quote
                    </Link>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Quote ID</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event / Client</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Sent Date</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Expiry</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Value</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Est. Margin</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Owner</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Next Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {proposals.map((p) => {
                        const margin = estimatedMarginPct(p);
                        const ownerName = p.owner_id ? nameById.get(p.owner_id) : undefined;
                        return (
                          <tr key={p.id} className="group hover:bg-surface-50 transition-colors">
                            <td className="px-6 py-3 font-mono text-xs text-surface-500">
                              <Link href={`/event-manager/proposals/${p.id}`} className="block">
                                {quoteCode(p)}
                              </Link>
                            </td>
                            <td className="px-6 py-3">
                              <Link href={`/event-manager/proposals/${p.id}`} className="block">
                                <span className="font-medium text-surface-900">{p.client_name}</span>
                                <span className="block text-xs text-surface-400">
                                  {(p.event_id && eventNames.get(p.event_id)) ?? p.title ?? "Untitled event"}
                                </span>
                              </Link>
                            </td>
                            <td className="px-6 py-3">
                              <StatusBadge status={proposalBadgeStatus(p.status)} />
                            </td>
                            <td className="px-6 py-3 text-surface-500">{formatDate(p.created_at)}</td>
                            <td className="px-6 py-3 text-surface-500">
                              {p.valid_until ? (
                                <>
                                  {formatDate(p.valid_until)}
                                  <span className="block text-xs text-surface-400">{dueLabel(p.valid_until)}</span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">
                              {formatCurrency(p.total_cents / 100, p.currency)}
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums text-surface-600">
                              {margin !== null ? `${margin.toFixed(1)}%` : "—"}
                            </td>
                            <td className="px-6 py-3 text-surface-600">{ownerName ?? "—"}</td>
                            <td className="px-6 py-3 text-surface-600">{nextActionFor(p.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <FinanceFooter />
          </div>

          <InsightsRail>
            <ChartCard title="Quote Pipeline">
              <FunnelChart steps={funnelSteps} />
            </ChartCard>

            <ChartCard title="Win Rate by Month">
              <AreaLineChart
                data={winRateSeries}
                series={[{ key: "winRate", color: C.success, label: "Win rate", area: true }]}
                formatValue={(v) => `${v.toFixed(0)}%`}
                height={140}
              />
            </ChartCard>

            <InsightCard title="Expiring Quotes (Next 14 Days)">
              <ul className="space-y-2.5">
                {expiringQuotes.length === 0 ? (
                  <li className="text-xs text-surface-400">Nothing expiring soon.</li>
                ) : (
                  expiringQuotes.map((p) => (
                    <li key={p.id}>
                      <Link href={`/event-manager/proposals/${p.id}`} className="flex items-center justify-between text-xs hover:text-brand-700">
                        <span className="truncate text-surface-600">{p.client_name}</span>
                        <span className="font-semibold text-warning-600 shrink-0 ml-2">{dueLabel(p.valid_until)}</span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </InsightCard>

            <InsightCard title="Top Value Opportunities">
              <ul className="space-y-2.5">
                {topOpportunities.length === 0 ? (
                  <li className="text-xs text-surface-400">No open opportunities.</li>
                ) : (
                  topOpportunities.map((p) => (
                    <li key={p.id}>
                      <Link href={`/event-manager/proposals/${p.id}`} className="flex items-center justify-between text-xs hover:text-brand-700">
                        <span className="truncate text-surface-600">{p.client_name}</span>
                        <span className="font-semibold text-surface-800 tabular-nums shrink-0 ml-2">
                          {formatCurrency(p.total_cents / 100, p.currency)}
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </InsightCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
