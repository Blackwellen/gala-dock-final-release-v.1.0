import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingSummary({
  rating,
  reviewCount,
  size = "sm",
  className,
}: {
  rating: number;
  reviewCount: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const starSize = size === "md" ? "w-4 h-4" : size === "sm" ? "w-3.5 h-3.5" : "w-3 h-3";
  const textSize = size === "md" ? "text-sm" : "text-xs";
  return (
    <span className={cn("inline-flex items-center gap-1", textSize, className)}>
      <Star className={cn(starSize, "fill-warning-500 text-warning-500")} />
      <span className="font-semibold text-surface-900">{rating.toFixed(1)}</span>
      <span className="text-surface-400">({reviewCount})</span>
    </span>
  );
}

export function RatingBreakdownBars({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 text-xs">
          <span className="w-28 shrink-0 text-surface-500">{item.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(item.value / 5) * 100}%` }} />
          </div>
          <span className="w-8 text-right font-medium text-surface-700">{item.value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export function RatingDistribution({ distribution }: { distribution: { stars: number; pct: number }[] }) {
  return (
    <div className="space-y-1.5">
      {distribution.map((d) => (
        <div key={d.stars} className="flex items-center gap-2 text-xs">
          <span className="w-6 text-surface-500">{d.stars} ★</span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div className="h-full rounded-full bg-warning-500" style={{ width: `${d.pct}%` }} />
          </div>
          <span className="w-9 text-right text-surface-400">{d.pct}%</span>
        </div>
      ))}
    </div>
  );
}
