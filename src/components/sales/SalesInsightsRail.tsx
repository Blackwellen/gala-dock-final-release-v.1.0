import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { SlidersHorizontal } from "lucide-react";

// Re-exported for convenience so consumers can import chart primitives from
// either sales/SalesPrimitives or sales/SalesInsightsRail.
export { MiniDonut } from "./SalesPrimitives";

/** Chart palette matching Gala Dock design tokens (hex, for SVG stroke/fill). */
export const CHART_COLORS = {
  brand: "#6366f1",
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  violet: "#8b5cf6",
  surface: "#cbd5e1",
};

export const CHART_PALETTE = [
  CHART_COLORS.brand,
  CHART_COLORS.info,
  CHART_COLORS.violet,
  CHART_COLORS.warning,
  CHART_COLORS.success,
  CHART_COLORS.surface,
];

/** Right-hand insights rail shell — fixed width, sticky-friendly, wraps to a stack on narrow viewports. */
export function InsightsRail({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <aside className={cn("w-full shrink-0 space-y-4 xl:w-[280px]", className)}>
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-surface-900">Insights</h2>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700"
          aria-label="Configure insights"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
      {children}
    </aside>
  );
}

export function InsightCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-surface-200 bg-white p-4 shadow-card", className)}>
      <p className="text-xs font-semibold text-surface-900">{title}</p>
      {subtitle && <p className="text-[11px] text-surface-400">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function LegendRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex min-w-0 items-center gap-1.5 text-surface-600">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-medium text-surface-800 tabular-nums">{value}</span>
    </div>
  );
}

/** Minimal SVG sparkline/area chart for 6-point trend series. */
export function Sparkline({
  points,
  height = 90,
  color = CHART_COLORS.brand,
}: {
  points: number[];
  height?: number;
  color?: string;
}) {
  const width = 240;
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const step = width / Math.max(1, points.length - 1);

  const coords = points.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[70px] w-full" preserveAspectRatio="none">
      <path d={areaPath} fill={color} fillOpacity={0.08} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3 : 0} fill={color} />
      ))}
    </svg>
  );
}

/** Vertical funnel bars (widest → narrowest) used for signature/conversion funnels. */
export function FunnelChart({
  stages,
}: {
  stages: { label: string; value: number; pct: string; color?: string }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => {
        const widthPct = Math.max(12, Math.round((s.value / max) * 100));
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex h-7 flex-1 items-center justify-center overflow-hidden">
              <div
                className={cn("flex h-7 items-center justify-center rounded text-[10px] font-semibold text-white", s.color ?? "bg-brand-500")}
                style={{ width: `${widthPct}%` }}
              >
                {s.value}
              </div>
            </div>
            <span className="w-[84px] shrink-0 text-[11px] text-surface-500">{s.label}</span>
            <span className="w-8 shrink-0 text-right text-[11px] font-medium text-surface-700">{s.pct}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InsightListItem({
  icon: Icon,
  title,
  subtitle,
  value,
  accent = "text-surface-900",
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-danger-500" strokeWidth={2} />}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-surface-800">{title}</p>
          {subtitle && <p className="truncate text-[10px] text-surface-400">{subtitle}</p>}
        </div>
      </div>
      <span className={cn("shrink-0 text-xs font-semibold tabular-nums", accent)}>{value}</span>
    </div>
  );
}
