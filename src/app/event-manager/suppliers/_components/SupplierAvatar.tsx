import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export function SupplierAvatar({
  initials,
  color,
  size = 36,
}: {
  initials: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      className={cn("rounded-lg flex items-center justify-center text-white font-semibold shrink-0", color)}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials}
    </div>
  );
}

export function RatingStars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-surface-500">
      <Star className="w-3 h-3 text-warning-500 fill-warning-500" strokeWidth={0} />
      <span className="font-medium text-surface-700 tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}
