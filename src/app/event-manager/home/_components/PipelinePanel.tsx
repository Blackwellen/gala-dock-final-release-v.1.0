import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { DonutChart, DonutLegend } from "@/components/ui/FinanceCharts";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PipelineOpportunity, PipelineStage } from "../data";
import { exactCurrency, compactCurrency } from "../format";

export function PipelinePanel({
  totalCents,
  stages,
  topOpportunities,
  currency,
  locale,
}: {
  totalCents: number;
  stages: PipelineStage[];
  topOpportunities: PipelineOpportunity[];
  currency: string;
  locale: string;
}) {
  const currencyFmt = (cents: number) => exactCurrency(cents, currency, locale);
  const compactCurrencyFmt = (cents: number) => compactCurrency(cents, currency, locale);

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-surface-900">Event Pipeline</h2>
        <Link href="/event-manager/events?view=board" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          View pipeline <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {stages.length === 0 ? (
        <EmptyState compact icon={TrendingUp} title="No active pipeline" description="Events that are enquiring, quoting or awaiting approval will appear here." />
      ) : (
        <div className="px-5 pb-4 flex-1 flex flex-col">
          <div className="flex items-center gap-4">
            <DonutChart
              data={stages.map((s) => ({ label: s.label, value: s.valueCents, color: s.color }))}
              size={128}
              thickness={18}
              centerValue={compactCurrencyFmt(totalCents)}
              centerLabel="Pipeline Value"
            />
            <div className="flex-1 min-w-0">
              <DonutLegend data={stages.map((s) => ({ label: s.label, value: s.valueCents, color: s.color }))} formatValue={compactCurrencyFmt} />
            </div>
          </div>

          {topOpportunities.length > 0 && (
            <div className="mt-4 pt-4 border-t border-surface-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-400 mb-2">Top Opportunities</p>
              <ul className="space-y-2">
                {topOpportunities.map((op) => (
                  <li key={op.id}>
                    <Link
                      href={`/event-manager/events/${op.id}`}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-surface-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-900 truncate">{op.name}</p>
                        <p className="text-xs text-surface-400">
                          {op.stageLabel} · {op.dateLabel}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-surface-800 tabular-nums shrink-0">{currencyFmt(op.valueCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
