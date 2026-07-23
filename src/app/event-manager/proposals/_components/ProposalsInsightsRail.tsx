"use client";

import { AlertTriangle, Trophy } from "lucide-react";
import {
  InsightsRail,
  InsightCard,
  LegendRow,
  FunnelChart,
  MiniDonut,
  InsightListItem,
  CHART_COLORS,
} from "@/components/sales/SalesInsightsRail";
import { formatMoney } from "@/components/sales/SalesPrimitives";
import type { Proposal } from "@/lib/supabase/types";
import { effectiveStatus, isExpiringSoon, daysUntil } from "./proposalHelpers";

function pct(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function ProposalsInsightsRail({ proposals }: { proposals: Proposal[] }) {
  const total = proposals.length;

  const sent = proposals.filter((p) => p.status !== "draft").length;
  const viewed = proposals.filter((p) => {
    const status = effectiveStatus(p);
    return p.viewed_at !== null || ["viewed", "signed", "declined", "converted"].includes(status);
  }).length;
  const awaitingSignature = proposals.filter((p) => {
    const status = effectiveStatus(p);
    return status === "sent" || status === "viewed";
  }).length;
  const signed = proposals.filter((p) => {
    const status = effectiveStatus(p);
    return status === "signed" || status === "converted";
  }).length;

  const funnelStages = [
    { label: "Total", value: total, pct: pct(total, total), color: "bg-surface-400" },
    { label: "Sent", value: sent, pct: pct(sent, total), color: "bg-info-500" },
    { label: "Viewed", value: viewed, pct: pct(viewed, total), color: "bg-violet-500" },
    { label: "Awaiting Sig.", value: awaitingSignature, pct: pct(awaitingSignature, total), color: "bg-warning-500" },
    { label: "Signed", value: signed, pct: pct(signed, total), color: "bg-success-500" },
  ];

  const accepted = proposals.filter((p) => ["signed", "converted"].includes(effectiveStatus(p))).length;
  const declined = proposals.filter((p) => effectiveStatus(p) === "declined").length;
  const distribution = [
    { label: "Accepted", value: accepted, color: CHART_COLORS.success },
    { label: "Awaiting Signature", value: awaitingSignature, color: CHART_COLORS.warning },
    { label: "Sent (not yet viewed)", value: Math.max(0, sent - viewed), color: CHART_COLORS.info },
    { label: "Declined", value: declined, color: CHART_COLORS.danger },
  ].filter((d) => d.value > 0);

  const expiringSoon = proposals
    .filter((p) => isExpiringSoon(p, 30))
    .sort((a, b) => new Date(a.valid_until!).getTime() - new Date(b.valid_until!).getTime())
    .slice(0, 3);

  const topValue = [...proposals]
    .sort((a, b) => (b.total_cents ?? 0) - (a.total_cents ?? 0))
    .slice(0, 3);

  return (
    <InsightsRail>
      <InsightCard title="Signature Funnel" subtitle={`${total} total proposal${total === 1 ? "" : "s"}`}>
        <FunnelChart stages={funnelStages} />
      </InsightCard>

      <InsightCard title="Proposal Status Mix" subtitle="Share of non-draft proposals">
        {distribution.length === 0 ? (
          <p className="text-xs text-surface-400">No sent proposals yet.</p>
        ) : (
          <div className="flex items-center gap-4">
            <MiniDonut
              segments={distribution.map((d) => ({ value: d.value, color: d.color }))}
              centerLabel={sent}
              centerSubLabel="sent"
            />
            <div className="flex-1 space-y-1.5">
              {distribution.map((d) => (
                <LegendRow key={d.label} label={d.label} value={String(d.value)} color={d.color} />
              ))}
            </div>
          </div>
        )}
      </InsightCard>

      <InsightCard title="Expiring Soon" subtitle="Next 30 days, not yet signed">
        {expiringSoon.length === 0 ? (
          <p className="text-xs text-surface-400">Nothing expiring soon.</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {expiringSoon.map((p) => (
              <InsightListItem
                key={p.id}
                icon={AlertTriangle}
                title={p.title}
                subtitle={formatMoney(p.total_cents, p.currency)}
                value={`${daysUntil(p.valid_until!)}d`}
                accent="text-warning-600"
              />
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard title="Top Value Proposals" subtitle="Highest total value">
        {topValue.length === 0 ? (
          <p className="text-xs text-surface-400">No proposals yet.</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {topValue.map((p) => (
              <InsightListItem
                key={p.id}
                icon={Trophy}
                title={p.title}
                subtitle={p.client_name}
                value={formatMoney(p.total_cents, p.currency)}
                accent="text-surface-900"
              />
            ))}
          </div>
        )}
      </InsightCard>
    </InsightsRail>
  );
}
