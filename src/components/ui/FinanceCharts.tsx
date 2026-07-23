import { cn } from "@/lib/utils";

/**
 * Zero-dependency SVG/CSS chart primitives for the Finance section, following
 * the same "no chart library, pure CSS/SVG" convention as CSSBarChart.tsx.
 * Kept intentionally small and composable — each chart takes plain
 * {label, value}-shaped data so callers can wire in real Supabase-derived
 * numbers without any adapter layer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline — tiny inline trend line used inside KPI/MetricCards.
// ─────────────────────────────────────────────────────────────────────────────
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "#7c3aed",
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
    >
      <polygon points={areaPoints} fill={color} opacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Area/Line chart — Revenue vs Payments, Sales Trend, Margin Trend, etc.
// ─────────────────────────────────────────────────────────────────────────────
export interface SeriesDatum {
  label: string;
  [seriesKey: string]: number | string;
}
export interface SeriesDef {
  key: string;
  color: string;
  label: string;
  area?: boolean;
}

export function AreaLineChart({
  data,
  series,
  height = 220,
  className,
  formatValue,
}: {
  data: SeriesDatum[];
  series: SeriesDef[];
  height?: number;
  className?: string;
  formatValue?: (v: number) => string;
}) {
  const width = 100; // percentage-based viewBox; scales via container width
  if (data.length === 0) return null;
  const allValues = data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0));
  const max = Math.max(1, ...allValues);
  const step = width / (data.length - 1 || 1);

  const linePoints = (key: string) =>
    data.map((d, i) => `${i * step},${height - ((Number(d[key]) || 0) / max) * height}`).join(" ");

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={width}
            y1={height - t * height}
            y2={height - t * height}
            stroke="currentColor"
            className="text-surface-100"
            strokeWidth={0.3}
          />
        ))}
        {series.map((s) => (
          <g key={s.key}>
            {s.area && (
              <polygon
                points={`0,${height} ${linePoints(s.key)} ${width},${height}`}
                fill={s.color}
                opacity={0.08}
              />
            )}
            <polyline
              points={linePoints(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {data.map((d, i) => (
              <circle
                key={i}
                cx={i * step}
                cy={height - ((Number(d[s.key]) || 0) / max) * height}
                r={0.9}
                vectorEffect="non-scaling-stroke"
                fill={s.color}
              >
                <title>{`${d.label} — ${s.label}: ${formatValue ? formatValue(Number(d[s.key]) || 0) : d[s.key]}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="flex justify-between mt-2">
        {data
          .filter((_, i) => i % Math.max(1, Math.ceil(data.length / 8)) === 0)
          .map((d, i) => (
            <span key={i} className="text-[10px] font-medium text-surface-400">
              {d.label}
            </span>
          ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Donut chart — Quote Pipeline, Revenue by Ticket Tier, Payments by Method...
// ─────────────────────────────────────────────────────────────────────────────
export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  size = 180,
  thickness = 26,
  centerLabel,
  centerValue,
  className,
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Precompute each slice's dash length + cumulative offset before rendering
  // (no mutation during render — React Compiler requires pure render bodies).
  const slices = data.reduce<{ dash: number; offset: number; fraction: number }[]>((acc, d) => {
    const fraction = d.value / total;
    const dash = fraction * circumference;
    const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    acc.push({ dash, offset, fraction });
    return acc;
  }, []);

  return (
    <div className={cn("flex items-center justify-center relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-surface-100" strokeWidth={thickness} />
        {data.map((d, i) => {
          const { dash, offset, fraction } = slices[i];
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            >
              <title>{`${d.label}: ${d.value.toLocaleString()} (${Math.round(fraction * 100)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          {centerValue && <span className="text-lg font-bold text-surface-900 tabular-nums">{centerValue}</span>}
          {centerLabel && <span className="text-[11px] font-medium text-surface-500 mt-0.5">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function DonutLegend({ data, formatValue }: { data: DonutDatum[]; formatValue?: (v: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={i} className="text-xs">
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-surface-600 truncate">{d.label}</span>
          </span>
          <span className="block pl-[18px] mt-0.5 font-semibold text-surface-800 tabular-nums">
            {formatValue ? formatValue(d.value) : d.value.toLocaleString()}
            <span className="text-surface-400 font-normal ml-1">({Math.round((d.value / total) * 100)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stacked bar chart — Hours by Department, Ticket Tier Mix, Deposit Milestones
// ─────────────────────────────────────────────────────────────────────────────
export interface StackedBarSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}
export interface StackedBarGroup {
  label: string;
  segments: StackedBarSegment[];
}

export function StackedBarChart({
  groups,
  height = 220,
  orientation = "vertical",
  showTotals = true,
  formatValue,
  className,
}: {
  groups: StackedBarGroup[];
  height?: number;
  orientation?: "vertical" | "horizontal";
  showTotals?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const totals = groups.map((g) => g.segments.reduce((s, seg) => s + seg.value, 0));
  const max = Math.max(1, ...totals);

  if (orientation === "horizontal") {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {groups.map((g, gi) => {
          const total = totals[gi];
          return (
            <div key={g.label} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-surface-600 truncate text-right">{g.label}</span>
              <div className="flex-1 h-6 rounded-md bg-surface-100 overflow-hidden flex">
                {g.segments.map((seg) => (
                  <div
                    key={seg.key}
                    className="h-full transition-all"
                    style={{ width: `${(seg.value / max) * 100}%`, background: seg.color }}
                    title={`${seg.label}: ${formatValue ? formatValue(seg.value) : seg.value.toLocaleString()}`}
                  />
                ))}
              </div>
              {showTotals && (
                <span className="w-24 shrink-0 text-xs font-semibold text-surface-700 tabular-nums text-right">
                  {formatValue ? formatValue(total) : total.toLocaleString()}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-end gap-3" style={{ height }}>
        {groups.map((g) => {
          return (
            <div key={g.label} className="flex-1 flex flex-col items-center justify-end gap-1.5 group h-full">
              <div className="w-full flex-1 flex flex-col justify-end rounded-t-md overflow-hidden">
                {[...g.segments].reverse().map((seg) => (
                  <div
                    key={seg.key}
                    className="w-full transition-all min-h-[1px]"
                    style={{ height: `${(seg.value / max) * 100}%`, background: seg.color }}
                    title={`${seg.label}: ${formatValue ? formatValue(seg.value) : seg.value.toLocaleString()}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2">
        {groups.map((g) => (
          <span key={g.label} className="flex-1 text-center text-[10px] font-medium text-surface-400 truncate">
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouped bar chart — Revenue vs Cost by Event
// ─────────────────────────────────────────────────────────────────────────────
export function GroupedBarChart({
  groups,
  height = 220,
  formatValue,
  className,
}: {
  groups: { label: string; bars: { key: string; value: number; color: string }[] }[];
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value)));
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-end gap-4" style={{ height }}>
        {groups.map((g) => (
          <div key={g.label} className="flex-1 flex items-end justify-center gap-1 h-full">
            {g.bars.map((b) => (
              <div
                key={b.key}
                className="flex-1 rounded-t-md min-h-[2px] transition-all max-w-[18px]"
                style={{ height: `${(b.value / max) * 100}%`, background: b.color }}
                title={`${g.label} — ${b.key}: ${formatValue ? formatValue(b.value) : b.value.toLocaleString()}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2">
        {groups.map((g) => (
          <span key={g.label} className="flex-1 text-center text-[10px] font-medium text-surface-400 truncate">
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Waterfall chart — Profit Bridge
// ─────────────────────────────────────────────────────────────────────────────
export interface WaterfallStep {
  label: string;
  value: number; // negative for "less" steps
  isTotal?: boolean;
  color?: string;
}

export function WaterfallChart({
  steps,
  height = 220,
  formatValue,
  className,
}: {
  steps: WaterfallStep[];
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  // Precompute running totals before rendering (no mutation during render —
  // each accumulator step is a fresh object, never reassigning a shared var).
  const bars = steps.reduce<{ step: WaterfallStep; start: number; end: number; running: number }[]>(
    (acc, s) => {
      const carry = acc.length > 0 ? acc[acc.length - 1].running : 0;
      const start = s.isTotal ? 0 : carry;
      const end = s.isTotal ? s.value : carry + s.value;
      return [...acc, { step: s, start: Math.min(start, end), end: Math.max(start, end), running: end }];
    },
    []
  ).map((b) => ({ ...b.step, start: b.start, end: b.end }));
  const max = Math.max(1, ...bars.map((b) => b.end));

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-end gap-3" style={{ height }}>
        {bars.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[10px] font-semibold text-surface-600 tabular-nums mb-1">
              {formatValue ? formatValue(Math.abs(b.value)) : Math.abs(b.value).toLocaleString()}
            </span>
            <div className="w-full relative" style={{ height: "100%" }}>
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-md min-h-[2px]"
                style={{
                  height: `${(b.end / max) * 100}%`,
                  background: b.color ?? (b.isTotal ? "#7c3aed" : b.value < 0 ? "#ef4444" : "#22c55e"),
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-2">
        {bars.map((b, i) => (
          <span key={i} className="flex-1 text-center text-[10px] font-medium text-surface-400 truncate">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funnel chart — Quote Pipeline (Quotes tab)
// ─────────────────────────────────────────────────────────────────────────────
export function FunnelChart({
  steps,
  className,
}: {
  steps: { label: string; value: number; color: string }[];
  className?: string;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {steps.map((s, i) => {
        const pct = Math.max(8, (s.value / max) * 100);
        return (
          <div key={i} className="flex justify-center">
            <div
              className="h-9 rounded-md flex items-center justify-center text-[11px] font-semibold text-white transition-all"
              style={{ width: `${pct}%`, background: s.color }}
              title={`${s.label}: ${s.value.toLocaleString()}`}
            >
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar — Deposit progress, Deposit coverage, Payables aging, etc.
// ─────────────────────────────────────────────────────────────────────────────
export function ProgressBar({
  pct,
  color = "bg-brand-500",
  trackColor = "bg-surface-100",
  height = "h-2",
  className,
}: {
  pct: number;
  color?: string;
  trackColor?: string;
  height?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("w-full rounded-full overflow-hidden", trackColor, height, className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights rail — shared right-hand panel shell + card
// ─────────────────────────────────────────────────────────────────────────────
export function InsightsRail({ children, className }: { children: React.ReactNode; className?: string }) {
  return <aside className={cn("w-full xl:w-[320px] shrink-0 space-y-4", className)}>{children}</aside>;
}

export function InsightCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-white rounded-xl border border-surface-200 shadow-card p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ChartCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-white rounded-xl border border-surface-200 shadow-card p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function FinanceFooter({ currency = "GBP", asOf }: { currency?: string; asOf?: string }) {
  return (
    <div className="flex items-center justify-between text-xs text-surface-400 pt-2">
      <span>All amounts in {currency}</span>
      <span>Data as of {asOf ?? new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}
