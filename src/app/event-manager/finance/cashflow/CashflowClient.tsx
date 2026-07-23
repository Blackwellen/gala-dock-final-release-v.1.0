"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Download,
  SlidersHorizontal,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Scale,
  Gauge,
  Clock,
  Landmark,
} from "lucide-react";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, FINANCE_TABS } from "@/components/ui/SectionTabs";
import {
  GroupedBarChart,
  ChartCard,
  InsightsRail,
  InsightCard,
  ProgressBar,
  Sparkline,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { cn, formatCurrency } from "@/lib/utils";
import { dueLabel, formatCentsCompact, FINANCE_CHART_COLORS as C } from "../_lib/finance";

// ── Shared item shapes (mirrors the server-computed rows in page.tsx) ──────
export interface InflowItem {
  id: string;
  kind: "invoice" | "deposit";
  eventId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  description: string;
  partyLabel: string;
  dueDate: string | null;
  amountCents: number;
}

export interface OutflowItem {
  id: string;
  kind: "expense" | "timesheet";
  eventId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  description: string;
  partyLabel: string;
  dueDate: string | null;
  amountCents: number;
}

interface Option {
  id: string;
  name: string;
}

interface CashflowClientProps {
  inflowItems: InflowItem[];
  outflowItems: OutflowItem[];
  eventOptions: Option[];
  ownerOptions: Option[];
  historicalPaidOutflowCents: number;
}

type WindowWeeks = 4 | 8 | 12;
type Scenario = "base" | "conservative" | "upside";
type ObligationTab = "all" | "receipts" | "payments";

const WINDOW_OPTIONS: WindowWeeks[] = [4, 8, 12];

const SCENARIOS: Record<Scenario, { label: string; inflow: number; outflow: number }> = {
  base: { label: "Base", inflow: 1, outflow: 1 },
  conservative: { label: "Conservative", inflow: 0.85, outflow: 1.1 },
  upside: { label: "Upside", inflow: 1.15, outflow: 0.93 },
};

const DAY_MS = 86_400_000;

/** Whole days from today (00:00 local) to `date`; negative = in the past/overdue. */
function daysFromToday(date: string | null, today: Date): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

/** Which weekly bucket (0-indexed) a due date falls into, or null if outside the window. Overdue/undated items land in bucket 0 ("due now"). */
function bucketIndexFor(date: string | null, today: Date, weeksCount: number): number | null {
  const days = daysFromToday(date, today);
  if (days === null) return 0; // undated → treat as due now
  if (days < 0) return 0; // overdue → treat as due now
  const idx = Math.floor(days / 7);
  return idx < weeksCount ? idx : null;
}

function sumCents<T extends { amountCents: number }>(items: T[]): number {
  return items.reduce((s, i) => s + i.amountCents, 0);
}

export default function CashflowClient({
  inflowItems,
  outflowItems,
  eventOptions,
  ownerOptions,
  historicalPaidOutflowCents,
}: CashflowClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [weeks, setWeeks] = useState<WindowWeeks>(12);
  const [scenario, setScenario] = useState<Scenario>("base");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [obligationTab, setObligationTab] = useState<ObligationTab>("all");
  const [refreshing, setRefreshing] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  function pushQuery(next: Partial<Record<"weeks" | "scenario" | "event" | "owner", string>>) {
    const params = new URLSearchParams();
    params.set("weeks", String(next.weeks ?? weeks));
    params.set("scenario", next.scenario ?? scenario);
    if ((next.event ?? eventFilter) !== "all") params.set("event", next.event ?? eventFilter);
    if ((next.owner ?? ownerFilter) !== "all") params.set("owner", next.owner ?? ownerFilter);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleWeeksChange(w: WindowWeeks) {
    setWeeks(w);
    pushQuery({ weeks: String(w) });
  }
  function handleScenarioChange(s: Scenario) {
    setScenario(s);
    pushQuery({ scenario: s });
  }
  function handleEventChange(v: string) {
    setEventFilter(v);
    pushQuery({ event: v });
  }
  function handleOwnerChange(v: string) {
    setOwnerFilter(v);
    pushQuery({ owner: v });
  }
  function cycleScenario() {
    const order: Scenario[] = ["base", "conservative", "upside"];
    const next = order[(order.indexOf(scenario) + 1) % order.length];
    handleScenarioChange(next);
  }
  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 600);
  }

  // ── Filtered base data (event + owner filters apply everywhere) ─────────
  const filteredInflow = useMemo(
    () =>
      inflowItems.filter(
        (i) => (eventFilter === "all" || i.eventId === eventFilter) && (ownerFilter === "all" || i.ownerId === ownerFilter)
      ),
    [inflowItems, eventFilter, ownerFilter]
  );
  const filteredOutflow = useMemo(
    () =>
      outflowItems.filter(
        (o) => (eventFilter === "all" || o.eventId === eventFilter) && (ownerFilter === "all" || o.ownerId === ownerFilter)
      ),
    [outflowItems, eventFilter, ownerFilter]
  );

  const scen = SCENARIOS[scenario];

  // ── Weekly buckets across the selected window ────────────────────────────
  const weekBuckets = useMemo(() => {
    const buckets = Array.from({ length: weeks }, (_, i) => {
      const start = new Date(today);
      start.setDate(start.getDate() + i * 7);
      return { label: `W${i + 1}`, start, inflowCents: 0, outflowCents: 0 };
    });
    for (const item of filteredInflow) {
      const idx = bucketIndexFor(item.dueDate, today, weeks);
      if (idx !== null) buckets[idx].inflowCents += item.amountCents;
    }
    for (const item of filteredOutflow) {
      const idx = bucketIndexFor(item.dueDate, today, weeks);
      if (idx !== null) buckets[idx].outflowCents += item.amountCents;
    }
    return buckets.map((b) => ({
      ...b,
      inflowScaledCents: b.inflowCents * scen.inflow,
      outflowScaledCents: b.outflowCents * scen.outflow,
      netScaledCents: b.inflowCents * scen.inflow - b.outflowCents * scen.outflow,
    }));
  }, [filteredInflow, filteredOutflow, today, weeks, scen]);

  // ── Base (unscaled, window-scoped) aggregates — feed both the KPI row and
  //     the always-Base/Conservative/Upside Scenario Comparison table. ─────
  const baseInflowWindow = weekBuckets.reduce((s, b) => s + b.inflowCents, 0);
  const baseOutflowWindow = weekBuckets.reduce((s, b) => s + b.outflowCents, 0);

  const dueIn30OutflowItems = useMemo(
    () => filteredOutflow.filter((o) => { const d = daysFromToday(o.dueDate, today); return d === null || d <= 30; }),
    [filteredOutflow, today]
  );
  const baseDueIn30Cents = sumCents(dueIn30OutflowItems);

  const baseCommittedCostsCents = sumCents(filteredOutflow); // unbounded — total open payables
  const committedPct =
    baseCommittedCostsCents + historicalPaidOutflowCents > 0
      ? (baseCommittedCostsCents / (baseCommittedCostsCents + historicalPaidOutflowCents)) * 100
      : 0;

  // ── Scenario-scaled headline KPIs (reflect the toolbar's active scenario) ─
  const forecastInflowCents = baseInflowWindow * scen.inflow;
  const forecastOutflowCents = baseOutflowWindow * scen.outflow;
  const netPositionCents = forecastInflowCents - forecastOutflowCents;
  const dueIn30Cents = baseDueIn30Cents * scen.outflow;
  const committedCostsCents = baseCommittedCostsCents * scen.outflow;
  const runwayAtRisk = forecastOutflowCents > forecastInflowCents;

  // ── Scenario Comparison table — all three columns, always computed from
  //     the same real base numbers. ────────────────────────────────────────
  const scenarioRows: { metric: string; values: Record<Scenario, number>; format: (v: number) => string }[] = [
    {
      metric: "Total Inflow",
      values: { base: baseInflowWindow, conservative: baseInflowWindow * SCENARIOS.conservative.inflow, upside: baseInflowWindow * SCENARIOS.upside.inflow },
      format: (v) => formatCurrency(v / 100),
    },
    {
      metric: "Total Outflow",
      values: { base: baseOutflowWindow, conservative: baseOutflowWindow * SCENARIOS.conservative.outflow, upside: baseOutflowWindow * SCENARIOS.upside.outflow },
      format: (v) => formatCurrency(v / 100),
    },
    {
      metric: "Net Position",
      values: {
        base: baseInflowWindow - baseOutflowWindow,
        conservative: baseInflowWindow * SCENARIOS.conservative.inflow - baseOutflowWindow * SCENARIOS.conservative.outflow,
        upside: baseInflowWindow * SCENARIOS.upside.inflow - baseOutflowWindow * SCENARIOS.upside.outflow,
      },
      format: (v) => formatCurrency(v / 100),
    },
    {
      metric: "Due in 30 Days",
      values: { base: baseDueIn30Cents, conservative: baseDueIn30Cents * SCENARIOS.conservative.outflow, upside: baseDueIn30Cents * SCENARIOS.upside.outflow },
      format: (v) => formatCurrency(v / 100),
    },
    {
      metric: "Committed Costs",
      values: { base: baseCommittedCostsCents, conservative: baseCommittedCostsCents * SCENARIOS.conservative.outflow, upside: baseCommittedCostsCents * SCENARIOS.upside.outflow },
      format: (v) => formatCurrency(v / 100),
    },
  ];

  // ── Due Obligations (combined, chronological) ────────────────────────────
  type Obligation = { id: string; type: "receipt" | "payment"; dueDate: string | null; description: string; partyLabel: string; amountCents: number };
  const obligations: Obligation[] = useMemo(() => {
    const combined: Obligation[] = [
      ...filteredInflow.map((i) => ({ id: i.id, type: "receipt" as const, dueDate: i.dueDate, description: i.description, partyLabel: i.partyLabel, amountCents: i.amountCents })),
      ...filteredOutflow.map((o) => ({ id: o.id, type: "payment" as const, dueDate: o.dueDate, description: o.description, partyLabel: o.partyLabel, amountCents: o.amountCents })),
    ];
    return combined.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
  }, [filteredInflow, filteredOutflow]);
  const visibleObligations = obligations.filter((o) => obligationTab === "all" || (obligationTab === "receipts" ? o.type === "receipt" : o.type === "payment"));

  // ── Cashflow by Event ─────────────────────────────────────────────────────
  const cashflowByEvent = useMemo(() => {
    const map = new Map<string, { eventId: string; name: string; inflowCents: number; outflowCents: number }>();
    const nameFor = (id: string) => eventOptions.find((e) => e.id === id)?.name ?? "Unassigned";
    for (const i of filteredInflow) {
      const key = i.eventId ?? "unassigned";
      const row = map.get(key) ?? { eventId: key, name: i.eventId ? nameFor(i.eventId) : "Unassigned", inflowCents: 0, outflowCents: 0 };
      row.inflowCents += i.amountCents;
      map.set(key, row);
    }
    for (const o of filteredOutflow) {
      const key = o.eventId ?? "unassigned";
      const row = map.get(key) ?? { eventId: key, name: o.eventId ? nameFor(o.eventId) : "Unassigned", inflowCents: 0, outflowCents: 0 };
      row.outflowCents += o.amountCents;
      map.set(key, row);
    }
    return [...map.values()]
      .map((r) => {
        const net = r.inflowCents - r.outflowCents;
        const netPct = r.inflowCents > 0 ? (net / r.inflowCents) * 100 : net < 0 ? -100 : 0;
        return { ...r, net, netPct };
      })
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [filteredInflow, filteredOutflow, eventOptions]);

  // ── Right rail: alerts, biggest items, weekly net trend ──────────────────
  const negativeWeeks = weekBuckets.filter((b) => b.netScaledCents < 0);
  const highCommitment = committedPct > 40;
  const liquidityAlerts: { text: string; tone: "danger" | "warning" }[] = [
    ...negativeWeeks.map((b) => ({
      text: `Net position goes negative for the week starting ${b.start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} (${formatCurrency(b.netScaledCents / 100)}).`,
      tone: "danger" as const,
    })),
    ...(highCommitment
      ? [{ text: `High commitment ratio — ${committedPct.toFixed(0)}% of total outflow (paid + open) is still open.`, tone: "warning" as const }]
      : []),
  ];

  const biggestPayments = [...filteredOutflow].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5);
  const biggestReceipts = [...filteredInflow].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5);
  const netTrendValues = weekBuckets.map((b) => b.netScaledCents / 100);
  const latestNet = netTrendValues.length > 0 ? netTrendValues[netTrendValues.length - 1] : 0;

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Cashflow"
        description="Forecast inflows, outflows and liquidity across upcoming events"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <span
              title="Export isn't wired to a report generator yet"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-surface-50 text-surface-400 text-sm font-medium cursor-not-allowed"
              aria-disabled="true"
            >
              <Download className="w-4 h-4" />
              Export Forecast
            </span>
            <button
              type="button"
              onClick={cycleScenario}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
              title="Cycle Base → Conservative → Upside (same selector as the toolbar below)"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Scenario Plan: {scen.label}
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Forecast Inflow" value={formatCentsCompact(forecastInflowCents)} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Forecast Outflow" value={formatCentsCompact(forecastOutflowCents)} icon={TrendingDown} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="Net Position" value={formatCentsCompact(netPositionCents)} icon={Scale} iconColor={netPositionCents >= 0 ? "text-success-600" : "text-danger-600"} iconBg={netPositionCents >= 0 ? "bg-success-50" : "bg-danger-50"} />

          {/* Cash Runway — no cash-balance ledger exists anywhere in this schema, so we
              deliberately do not fabricate a "N weeks of runway" figure implying a real
              bank balance. We show the honest direction (at risk / stable) instead. */}
          <div className="bg-white rounded-xl border border-surface-200 px-5 py-4 flex items-start gap-4 shadow-card">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", runwayAtRisk ? "bg-danger-50" : "bg-success-50")}>
              <Gauge className={cn("w-5 h-5", runwayAtRisk ? "text-danger-600" : "text-success-600")} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Cash Runway</p>
              <p className="mt-0.5 text-lg font-bold text-surface-900">N/A — no balance data</p>
              <div className="mt-1">
                <StatusBadge status={runwayAtRisk ? "at-risk-cashflow" : "healthy"} />
              </div>
            </div>
          </div>

          <MetricCard
            label="Due in 30 Days"
            value={formatCentsCompact(dueIn30Cents)}
            delta={{ value: `${dueIn30OutflowItems.length} item${dueIn30OutflowItems.length === 1 ? "" : "s"}`, positive: false }}
            icon={Clock}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
          <MetricCard
            label="Committed Costs"
            value={formatCentsCompact(committedCostsCents)}
            delta={{ value: `${committedPct.toFixed(0)}% of total outflow`, positive: committedPct <= 40 }}
            icon={Landmark}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
        </KPIGrid>

        {/* Toolbar */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-surface-200 overflow-hidden">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => handleWeeksChange(w)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  weeks === w ? "bg-brand-600 text-white" : "bg-white text-surface-600 hover:bg-surface-50"
                )}
              >
                {w} weeks
              </button>
            ))}
          </div>

          <select
            value={eventFilter}
            onChange={(e) => handleEventChange(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 bg-white text-surface-700 hover:bg-surface-50"
          >
            <option value="all">All events</option>
            {eventOptions.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          <select
            value={scenario}
            onChange={(e) => handleScenarioChange(e.target.value as Scenario)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 bg-white text-surface-700 hover:bg-surface-50"
          >
            <option value="base">Scenario: Base</option>
            <option value="conservative">Scenario: Conservative</option>
            <option value="upside">Scenario: Upside</option>
          </select>

          <select
            value={ownerFilter}
            onChange={(e) => handleOwnerChange(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 bg-white text-surface-700 hover:bg-surface-50"
          >
            <option value="all">All owners</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          <span
            title="Saved views aren't available on this tab yet"
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 bg-surface-50 text-surface-400 cursor-not-allowed"
          >
            Saved Views
          </span>

          <button
            type="button"
            onClick={handleRefresh}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <ChartCard title={`${weeks}-Week Cashflow Forecast`}>
              {weekBuckets.every((b) => b.inflowCents === 0 && b.outflowCents === 0) ? (
                <p className="text-xs text-surface-400">No open receivables or payables in this window.</p>
              ) : (
                <>
                  <GroupedBarChart
                    groups={weekBuckets.map((b) => ({
                      label: b.label,
                      bars: [
                        { key: "inflow", value: b.inflowScaledCents / 100, color: C.success },
                        { key: "outflow", value: b.outflowScaledCents / 100, color: C.danger },
                      ],
                    }))}
                    formatValue={(v) => formatCurrency(v)}
                    height={200}
                  />
                  <div className="flex gap-4 mt-3 pt-3 border-t border-surface-100">
                    {weekBuckets.map((b) => (
                      <span
                        key={b.label}
                        className={cn(
                          "flex-1 text-center text-[10px] font-semibold tabular-nums",
                          b.netScaledCents >= 0 ? "text-success-600" : "text-danger-600"
                        )}
                        title={`Net for ${b.label}`}
                      >
                        {formatCentsCompact(b.netScaledCents)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-surface-900">Due Obligations</h2>
                <div className="flex items-center rounded-lg border border-surface-200 overflow-hidden">
                  {(["all", "receipts", "payments"] as ObligationTab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setObligationTab(t)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                        obligationTab === t ? "bg-brand-600 text-white" : "bg-white text-surface-600 hover:bg-surface-50"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {visibleObligations.length === 0 ? (
                <EmptyState icon={Scale} title="Nothing outstanding" description="No receivables or payables match the current filters." compact />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event / Supplier</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {visibleObligations.slice(0, 50).map((o) => (
                        <tr key={`${o.type}-${o.id}`} className="hover:bg-surface-50 transition-colors">
                          <td className="px-6 py-3 text-surface-600 whitespace-nowrap">
                            {o.dueDate ? new Date(o.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Not scheduled"}
                            <span className="block text-[11px] text-surface-400">{dueLabel(o.dueDate)}</span>
                          </td>
                          <td className="px-6 py-3">
                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", o.type === "receipt" ? "bg-success-50 text-success-700 border-success-200" : "bg-danger-50 text-danger-700 border-danger-200")}>
                              {o.type === "receipt" ? "Receipt" : "Payment"}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-medium text-surface-900 truncate max-w-[240px]">{o.description}</td>
                          <td className="px-6 py-3 text-surface-600">{o.partyLabel}</td>
                          <td className="px-6 py-3 text-right tabular-nums font-semibold text-surface-900">{formatCurrency(o.amountCents / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Cashflow by Event">
                {cashflowByEvent.length === 0 ? (
                  <p className="text-xs text-surface-400">No events with open receivables or payables.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-surface-400 uppercase tracking-wider">
                          <th className="text-left py-2">Event</th>
                          <th className="text-right py-2">Inflow</th>
                          <th className="text-right py-2">Outflow</th>
                          <th className="text-right py-2">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-100">
                        {cashflowByEvent.slice(0, 8).map((r) => (
                          <tr key={r.eventId}>
                            <td className="py-2 font-medium text-surface-900 truncate max-w-[140px]">{r.name}</td>
                            <td className="py-2 text-right tabular-nums text-success-600">{formatCurrency(r.inflowCents / 100)}</td>
                            <td className="py-2 text-right tabular-nums text-danger-600">{formatCurrency(r.outflowCents / 100)}</td>
                            <td className="py-2 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className={cn("tabular-nums font-semibold", r.net >= 0 ? "text-success-700" : "text-danger-700")}>{formatCurrency(r.net / 100)}</span>
                                <ProgressBar pct={Math.min(100, Math.abs(r.netPct))} color={r.net >= 0 ? "bg-success-500" : "bg-danger-500"} className="w-20" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Scenario Comparison">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-surface-400 uppercase tracking-wider">
                        <th className="text-left py-2">Metric</th>
                        <th className="text-right py-2">Base</th>
                        <th className="text-right py-2">Conservative</th>
                        <th className="text-right py-2">Upside</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {scenarioRows.map((row) => (
                        <tr key={row.metric}>
                          <td className="py-2 text-surface-600">{row.metric}</td>
                          <td className="py-2 text-right tabular-nums font-medium text-surface-900">{row.format(row.values.base)}</td>
                          <td className="py-2 text-right tabular-nums text-surface-700">{row.format(row.values.conservative)}</td>
                          <td className="py-2 text-right tabular-nums text-surface-700">{row.format(row.values.upside)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>

            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Liquidity Alerts">
              {liquidityAlerts.length === 0 ? (
                <p className="text-xs text-surface-400">No liquidity risks detected in the current window.</p>
              ) : (
                <ul className="space-y-2.5">
                  {liquidityAlerts.map((a, i) => (
                    <li key={i} className={cn("text-xs rounded-lg border px-3 py-2", a.tone === "danger" ? "bg-danger-50 border-danger-200 text-danger-700" : "bg-warning-50 border-warning-200 text-warning-700")}>
                      {a.text}
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Biggest Upcoming Payments">
              {biggestPayments.length === 0 ? (
                <p className="text-xs text-surface-400">No open payables.</p>
              ) : (
                <ul className="space-y-2">
                  {biggestPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="min-w-0 truncate text-surface-600">{p.partyLabel}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-surface-900">{formatCurrency(p.amountCents / 100)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Biggest Expected Receipts">
              {biggestReceipts.length === 0 ? (
                <p className="text-xs text-surface-400">No open receivables.</p>
              ) : (
                <ul className="space-y-2">
                  {biggestReceipts.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="min-w-0 truncate text-surface-600">{r.partyLabel}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-surface-900">{formatCurrency(r.amountCents / 100)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Weekly Net Trend">
              {netTrendValues.length < 2 ? (
                <p className="text-xs text-surface-400">Not enough weeks in this window to trend.</p>
              ) : (
                <div className="space-y-2">
                  <Sparkline data={netTrendValues} color={latestNet >= 0 ? C.success : C.danger} width={240} height={48} />
                  <p className={cn("text-sm font-semibold tabular-nums", latestNet >= 0 ? "text-success-700" : "text-danger-700")}>
                    Latest week: {formatCurrency(latestNet)}
                  </p>
                </div>
              )}
            </InsightCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
