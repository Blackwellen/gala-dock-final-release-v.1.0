import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/FinanceCharts";
import type { KpiDatum } from "../data";

interface HomeKpiCardProps {
  label: string;
  data: KpiDatum;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  sparklineColor: string;
  href: string;
  warn?: boolean;
}

export function HomeKpiCard({ label, data, icon: Icon, iconColor, iconBg, sparklineColor, href, warn }: HomeKpiCardProps) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-xl border border-surface-200 shadow-card hover:shadow-md hover:border-brand-200 transition-all p-5 flex flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
            <Icon className={cn("w-4.5 h-4.5", iconColor)} strokeWidth={1.8} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 truncate">{label}</p>
        </div>
        <Sparkline data={data.sparkline.length > 1 ? data.sparkline : [0, 0]} width={88} height={28} color={sparklineColor} className="shrink-0" />
      </div>

      <p className="mt-3 text-[26px] leading-none font-bold text-surface-900 tabular-nums">{data.formattedValue}</p>

      {data.deltaPct !== null && (
        <p className={cn("mt-2 text-xs font-medium flex items-center gap-1", data.positive ? "text-success-600" : "text-danger-600")}>
          <span>{data.positive ? "↑" : "↓"}</span>
          <span>{Math.abs(data.deltaPct)}% vs last month</span>
        </p>
      )}

      <div className="mt-auto pt-3">
        <p className={cn("text-xs font-medium flex items-center gap-1.5", warn ? "text-danger-600" : "text-surface-500")}>
          {warn ? (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          ) : (
            <TrendingUp className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          )}
          <span className="truncate">{data.secondaryLabel}</span>
        </p>
      </div>
    </Link>
  );
}

export function HomeKpiSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 animate-pulse">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-surface-100" />
        <div className="h-3 w-24 bg-surface-100 rounded" />
      </div>
      <div className="mt-4 h-7 w-16 bg-surface-100 rounded" />
      <div className="mt-3 h-3 w-28 bg-surface-100 rounded" />
      <div className="mt-4 pt-3 h-3 w-32 bg-surface-100 rounded" />
    </div>
  );
}
