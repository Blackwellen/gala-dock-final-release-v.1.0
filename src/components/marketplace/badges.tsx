import { BadgeCheck, Star, Zap, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Gala Dock marketplace — shared listing badges. Kept visually distinct from StatusBadge
// (src/components/ui/StatusBadge.tsx) which is for record/workflow status, not marketplace trust
// signals. These render as solid pill chips over hero imagery per the reference designs.

export function VerifiedBadge({ label = "Verified", className, solid = true }: { label?: string; className?: string; solid?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide",
        solid ? "bg-white/95 text-brand-700 shadow-sm backdrop-blur-sm" : "bg-brand-50 text-brand-700 border border-brand-200",
        className
      )}
    >
      <BadgeCheck className="w-3.5 h-3.5" />
      {label.toUpperCase()}
    </span>
  );
}

export function FeaturedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-success-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm", className)}>
      FEATURED
    </span>
  );
}

export function TopRatedBadge({ className, solid = true }: { className?: string; solid?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
        solid ? "bg-white/95 text-warning-700 shadow-sm backdrop-blur-sm" : "bg-warning-50 text-warning-700 border border-warning-200",
        className
      )}
    >
      <Star className="w-3.5 h-3.5 fill-current" />
      TOP RATED
    </span>
  );
}

export function PreferredBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 border border-brand-200", className)}>Preferred Partner</span>;
}

export function NewBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-surface-900 px-2.5 py-1 text-[11px] font-semibold text-white", className)}>NEW</span>;
}

const AVAILABILITY_MAP = {
  available: { label: "Available", classes: "text-success-600", dot: "bg-success-500" },
  limited: { label: "Limited availability", classes: "text-warning-600", dot: "bg-warning-500" },
  unavailable: { label: "Unavailable", classes: "text-danger-600", dot: "bg-danger-500" },
  contact: { label: "Contact to confirm", classes: "text-surface-500", dot: "bg-surface-400" },
} as const;

export function AvailabilityBadge({
  status,
  date,
  className,
}: {
  status: keyof typeof AVAILABILITY_MAP;
  date?: string;
  className?: string;
}) {
  const cfg = AVAILABILITY_MAP[status];
  return (
    <div className={cn("flex items-center gap-1.5 text-xs font-medium", cfg.classes, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
      {date && <span className="text-surface-400 font-normal">· {date}</span>}
    </div>
  );
}

const COMPLIANCE_MAP = {
  A: { label: "Risk A", classes: "text-success-600 bg-success-50 border-success-200" },
  B: { label: "Risk B", classes: "text-warning-600 bg-warning-50 border-warning-200" },
  C: { label: "Risk C", classes: "text-danger-600 bg-danger-50 border-danger-200" },
} as const;

export function ComplianceBadge({ grade, className }: { grade: "A" | "B" | "C"; className?: string }) {
  const cfg = COMPLIANCE_MAP[grade];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.classes, className)}>
      <ShieldCheck className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export function EventFitBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-700", className)}>
      <Zap className="w-3 h-3" />
      {score}% event fit
    </span>
  );
}

export function ResponseTimeBadge({ time, className }: { time: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-surface-500", className)}>
      <Clock className="w-3 h-3" />
      {time} response
    </span>
  );
}
