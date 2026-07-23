import { cn } from "@/lib/utils";
import { VERIFICATION_BADGE, VISIBILITY_BADGE, RISK_BADGE } from "./doc-utils";
import type { RiskLevel, VerificationStatus } from "./types";

export function VerificationBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const { label, classes } = VERIFICATION_BADGE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap", classes, className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
      {label}
    </span>
  );
}

export function VisibilityBadge({ visibility, className }: { visibility: string; className?: string }) {
  const { label, classes } = VISIBILITY_BADGE[visibility] ?? { label: visibility, classes: "bg-surface-100 text-surface-600 border-surface-200" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap", classes, className)}>
      {label}
    </span>
  );
}

export function RiskBadge({ risk, className }: { risk: RiskLevel | null; className?: string }) {
  if (!risk) return <span className="text-xs text-surface-400">—</span>;
  const { label, classes } = RISK_BADGE[risk] ?? { label: risk, classes: "bg-surface-100 text-surface-600 border-surface-200" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap", classes, className)}>
      {label}
    </span>
  );
}
