import { cn } from "@/lib/utils";

export interface DonutSegment {
  label: string;
  value: number;
  /** Tailwind class pair: stroke-* for the arc, bg-* for the legend dot. */
  color: string; // e.g. "bg-success-500" — stroke derived via colorToStroke()
}

function colorToStroke(bgClass: string): string {
  return bgClass.replace("bg-", "stroke-");
}

interface MiniDonutProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
  showLegend?: boolean;
  className?: string;
}

/** Reusable SVG donut chart for right-rail insight cards. No chart library. */
export function MiniDonut({
  segments,
  size = 120,
  strokeWidth = 14,
  centerLabel,
  centerSubLabel,
  showLegend = true,
  className,
}: MiniDonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Precompute each segment's cumulative start fraction without mutating
  // state during render.
  const cumulativeStarts: number[] = [];
  segments.reduce((acc, s) => {
    cumulativeStarts.push(acc);
    return acc + s.value / total;
  }, 0);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-surface-100" strokeWidth={strokeWidth} fill="none" />
          {segments.map((s, i) => {
            const fraction = s.value / total;
            const dash = fraction * circumference;
            const offset = circumference - cumulativeStarts[i] * circumference;
            if (s.value === 0) return null;
            return (
              <circle
                key={`${s.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                className={colorToStroke(s.color)}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        {(centerLabel || centerSubLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerLabel && <span className="text-lg font-bold text-surface-900 tabular-nums leading-none">{centerLabel}</span>}
            {centerSubLabel && <span className="text-[10px] text-surface-400 mt-0.5">{centerSubLabel}</span>}
          </div>
        )}
      </div>
      {showLegend && (
        <ul className="flex-1 min-w-0 space-y-1.5">
          {segments.map((s, i) => (
            <li key={`${s.label}-legend-${i}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 min-w-0 text-surface-600">
                <span className={cn("w-2 h-2 rounded-full shrink-0", s.color)} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="font-semibold text-surface-800 tabular-nums shrink-0">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
