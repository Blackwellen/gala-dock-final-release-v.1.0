"use client";

import { Flame } from "lucide-react";
import {
  InsightsRail,
  InsightCard,
  LegendRow,
  Sparkline,
  FunnelChart,
  InsightListItem,
  CHART_COLORS,
  CHART_PALETTE,
} from "@/components/sales/SalesInsightsRail";
import { MiniDonut, formatMoney } from "@/components/sales/SalesPrimitives";
import { STAGE_LABELS, sourceLabel, type LeadStage } from "./lib";
import type { LeadRow } from "./LeadsClient";

const STAGE_HEX: Record<string, string> = {
  "new-enquiry": CHART_COLORS.info,
  contacted: CHART_COLORS.info,
  "proposal-sent": CHART_COLORS.violet,
  negotiating: CHART_COLORS.warning,
  won: CHART_COLORS.success,
  lost: CHART_COLORS.surface,
};

function leadValue(l: LeadRow): number {
  if (l.budgetCents != null) return l.budgetCents;
  if (l.budgetMinCents != null || l.budgetMaxCents != null) {
    const min = l.budgetMinCents ?? l.budgetMaxCents ?? 0;
    const max = l.budgetMaxCents ?? l.budgetMinCents ?? 0;
    return Math.round((min + max) / 2);
  }
  return 0;
}

/**
 * Right-hand insights rail for the Leads page. Every number here is computed
 * directly from the `leads` array passed in — no hardcoded or mock figures.
 */
export function InsightsRailContent({
  leads,
  variant,
}: {
  leads: LeadRow[];
  variant: "list" | "kanban";
}) {
  const total = leads.length;

  // ---- Hot Opportunities (shared by both variants) ----
  const hotOpportunities = leads
    .filter((l) => l.priority === "high" && l.stage !== "won" && l.stage !== "lost")
    .sort((a, b) => leadValue(b) - leadValue(a))
    .slice(0, 3);

  // ---- Conversion Trend: last 6 calendar months, won / (won+lost) of leads CREATED that month ----
  const now = new Date();
  const trendPoints: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = monthDate.getTime();
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).getTime();
    let won = 0;
    let closed = 0;
    for (const l of leads) {
      const t = new Date(l.createdAt).getTime();
      if (t >= monthStart && t < monthEnd) {
        if (l.stage === "won") {
          won += 1;
          closed += 1;
        } else if (l.stage === "lost") {
          closed += 1;
        }
      }
    }
    trendPoints.push(closed === 0 ? 0 : Math.round((won / closed) * 100));
  }

  if (variant === "kanban") {
    // ---- Stage Distribution ----
    const stageCounts = new Map<string, number>();
    for (const l of leads) stageCounts.set(l.stage, (stageCounts.get(l.stage) ?? 0) + 1);
    const stageSegments = Array.from(stageCounts.entries()).map(([stage, count]) => ({
      value: count,
      color: STAGE_HEX[stage] ?? CHART_COLORS.surface,
    }));

    // ---- Pipeline Value by Stage (funnel: bar = lead count, right label = £ value) ----
    const stageValue = new Map<string, number>();
    const stageCountForFunnel = new Map<string, number>();
    for (const l of leads) {
      stageValue.set(l.stage, (stageValue.get(l.stage) ?? 0) + leadValue(l));
      stageCountForFunnel.set(l.stage, (stageCountForFunnel.get(l.stage) ?? 0) + 1);
    }
    const funnelStages = (Object.keys(STAGE_LABELS) as LeadStage[])
      .filter((s) => (stageCountForFunnel.get(s) ?? 0) > 0)
      .map((s) => ({
        label: STAGE_LABELS[s],
        value: stageCountForFunnel.get(s) ?? 0,
        pct: formatMoney(stageValue.get(s) ?? 0),
        color:
          s === "won" ? "bg-success-500" : s === "lost" ? "bg-surface-400" : "bg-brand-500",
      }));

    return (
      <InsightsRail>
        <InsightCard title="Stage Distribution" subtitle={`${total} leads`}>
          <div className="flex items-center gap-4">
            <MiniDonut segments={stageSegments} centerLabel={total} centerSubLabel="leads" />
            <div className="flex-1 space-y-1.5 min-w-0">
              {(Object.keys(STAGE_LABELS) as LeadStage[])
                .filter((s) => (stageCounts.get(s) ?? 0) > 0)
                .map((s) => (
                  <LegendRow
                    key={s}
                    label={STAGE_LABELS[s]}
                    value={`${Math.round(((stageCounts.get(s) ?? 0) / Math.max(1, total)) * 100)}%`}
                    color={STAGE_HEX[s] ?? CHART_COLORS.surface}
                  />
                ))}
            </div>
          </div>
        </InsightCard>

        <InsightCard title="Pipeline Value by Stage" subtitle="Lead count · total value">
          {funnelStages.length > 0 ? (
            <FunnelChart stages={funnelStages} />
          ) : (
            <p className="text-xs text-surface-400">No leads to summarise yet.</p>
          )}
        </InsightCard>

        <HotOpportunitiesCard hotOpportunities={hotOpportunities} />
        <ConversionTrendCard trendPoints={trendPoints} />
      </InsightsRail>
    );
  }

  // ---- List / Cards variant ----

  // Lead Source Mix
  const sourceCounts = new Map<string, number>();
  for (const l of leads) {
    const key = l.source ?? "other";
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const sourceEntries = Array.from(sourceCounts.entries());
  const sourceSegments = sourceEntries.map(([, count], i) => ({
    value: count,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));

  // Response SLA (honest proxy — see comment below)
  const onTrack = leads.filter((l) => {
    if (l.stage !== "new-enquiry") return true;
    if (!l.responseDueDate) return false;
    return new Date(l.responseDueDate).getTime() >= now.getTime();
  }).length;
  const slaPct = total === 0 ? 0 : Math.round((onTrack / total) * 100);

  return (
    <InsightsRail>
      <InsightCard title="Lead Source Mix" subtitle={`${total} leads`}>
        <div className="flex items-center gap-4">
          <MiniDonut segments={sourceSegments} centerLabel={total} centerSubLabel="leads" />
          <div className="flex-1 space-y-1.5 min-w-0">
            {sourceEntries.map(([source, count], i) => (
              <LegendRow
                key={source}
                label={sourceLabel(source)}
                value={`${Math.round((count / Math.max(1, total)) * 100)}%`}
                color={CHART_PALETTE[i % CHART_PALETTE.length]}
              />
            ))}
            {sourceEntries.length === 0 && (
              <p className="text-xs text-surface-400">No leads yet.</p>
            )}
          </div>
        </div>
      </InsightCard>

      <InsightCard
        title="Response SLA"
        subtitle="Contacted or within response window"
      >
        <div className="flex items-center gap-4">
          <MiniDonut
            segments={[
              { value: slaPct, color: CHART_COLORS.success },
              { value: 100 - slaPct, color: CHART_COLORS.surface },
            ]}
            centerLabel={`${slaPct}%`}
          />
          <p className="flex-1 text-[11px] text-surface-500">
            {onTrack} of {total} leads have been contacted or still sit within their
            response window.
          </p>
        </div>
      </InsightCard>

      <HotOpportunitiesCard hotOpportunities={hotOpportunities} />
      <ConversionTrendCard trendPoints={trendPoints} />
    </InsightsRail>
  );
}

function HotOpportunitiesCard({ hotOpportunities }: { hotOpportunities: LeadRow[] }) {
  return (
    <InsightCard title="Hot Opportunities" subtitle="High priority · open · by value">
      {hotOpportunities.length > 0 ? (
        <div className="divide-y divide-surface-100">
          {hotOpportunities.map((l) => (
            <InsightListItem
              key={l.id}
              icon={Flame}
              title={l.title}
              subtitle={STAGE_LABELS[l.stage as LeadStage] ?? l.stage}
              value={formatMoney(leadValue(l))}
              accent="text-danger-600"
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-surface-400">No high-priority open leads right now.</p>
      )}
    </InsightCard>
  );
}

function ConversionTrendCard({ trendPoints }: { trendPoints: number[] }) {
  const latest = trendPoints[trendPoints.length - 1] ?? 0;
  return (
    <InsightCard title="Conversion Trend" subtitle="Won ÷ (won + lost), by month created">
      <Sparkline points={trendPoints} color={CHART_COLORS.success} />
      <p className="mt-1 text-[11px] text-surface-400">Latest month: {latest}% won</p>
    </InsightCard>
  );
}
