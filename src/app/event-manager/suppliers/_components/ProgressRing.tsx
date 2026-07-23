import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string; // stroke color, e.g. "stroke-brand-500"
  trackColor?: string;
  label?: string;
  className?: string;
}

/** Small SVG circular-progress ring used for onboarding %, compliance %, performance score. */
export function ProgressRing({
  value,
  size = 40,
  strokeWidth = 4,
  color = "stroke-brand-500",
  trackColor = "stroke-surface-100",
  label,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const ringColor =
    clamped >= 80 ? color : clamped >= 50 ? "stroke-warning-500" : "stroke-danger-500";

  return (
    <div className={cn("relative inline-flex items-center justify-center shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} className={trackColor} strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn(ringColor, "transition-all")}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold text-surface-700 tabular-nums">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
