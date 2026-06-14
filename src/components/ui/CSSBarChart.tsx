import { cn } from "@/lib/utils";

export interface CSSBarDatum {
  label: string;
  value: number;
  /** Tailwind bg class, e.g. "bg-brand-500". Defaults to brand. */
  color?: string;
  /** Optional pre-formatted value label (e.g. "£8,200"). Defaults to value. */
  valueLabel?: string;
}

interface CSSBarChartProps {
  data: CSSBarDatum[];
  maxValue?: number;
  /** Chart body height in px for vertical orientation. Default 220. */
  height?: number;
  showValues?: boolean;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/**
 * Pure-CSS bar chart (flexbox + percentage widths/heights). No chart library,
 * zero bundle cost. Suitable for revenue trends, pipeline funnels, breakdowns.
 */
export function CSSBarChart({
  data,
  maxValue,
  height = 220,
  showValues = true,
  orientation = "vertical",
  className,
}: CSSBarChartProps) {
  const max = maxValue ?? Math.max(1, ...data.map((d) => d.value));

  if (orientation === "horizontal") {
    return (
      <div className={cn("flex flex-col gap-2.5", className)}>
        {data.map((d, i) => {
          const pct = Math.round((d.value / max) * 100);
          return (
            <div key={`${d.label}-${i}`} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-surface-600 truncate text-right">
                {d.label}
              </span>
              <div className="flex-1 h-6 rounded-md bg-surface-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-md transition-all", d.color ?? "bg-brand-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {showValues && (
                <span className="w-20 shrink-0 text-xs font-semibold text-surface-700 tabular-nums">
                  {d.valueLabel ?? d.value.toLocaleString()}
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
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const pct = Math.round((d.value / max) * 100);
          return (
            <div key={`${d.label}-${i}`} className="flex-1 flex flex-col items-center justify-end gap-1.5 group">
              {showValues && (
                <span className="text-[10px] font-semibold text-surface-600 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.valueLabel ?? d.value.toLocaleString()}
                </span>
              )}
              <div
                className={cn("w-full rounded-t-md transition-all min-h-[2px]", d.color ?? "bg-brand-500")}
                style={{ height: `${pct}%` }}
                title={`${d.label}: ${d.valueLabel ?? d.value.toLocaleString()}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        {data.map((d, i) => (
          <span key={`${d.label}-lbl-${i}`} className="flex-1 text-center text-[10px] font-medium text-surface-400 truncate">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
