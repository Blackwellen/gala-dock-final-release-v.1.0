import { cn } from "@/lib/utils";
import type { OutreachStatus, RfqStatus, RiskLevel, SupplierStatus, SupplierTier } from "../_data/types";

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Coverage-tier chip: Premium / Preferred / Verified. Distinct from StatusBadge's fixed union. */
export function CoverageTierChip({ tier }: { tier: SupplierTier }) {
  if (!tier) return <span className="text-xs text-surface-300">—</span>;
  const styles: Record<NonNullable<SupplierTier>, string> = {
    premium: "bg-violet-50 text-violet-700 border-violet-200",
    preferred: "bg-brand-50 text-brand-700 border-brand-200",
    verified: "bg-success-50 text-success-700 border-success-200",
  };
  const labels: Record<NonNullable<SupplierTier>, string> = {
    premium: "Premium",
    preferred: "Preferred",
    verified: "Verified",
  };
  return <Chip className={styles[tier]}>{labels[tier]}</Chip>;
}

/** Supplier lifecycle status chip: draft / invited / onboarding / suspended aren't in StatusBadge's union. */
export function SupplierStatusChip({ status }: { status: SupplierStatus }) {
  const map: Record<SupplierStatus, { label: string; classes: string }> = {
    active: { label: "Active", classes: "bg-success-50 text-success-700 border-success-200" },
    paused: { label: "Paused", classes: "bg-warning-50 text-warning-700 border-warning-200" },
    archived: { label: "Archived", classes: "bg-surface-100 text-surface-500 border-surface-200" },
    draft: { label: "Draft", classes: "bg-surface-100 text-surface-500 border-surface-200" },
    invited: { label: "Invited", classes: "bg-info-50 text-info-700 border-info-200" },
    onboarding: { label: "Onboarding", classes: "bg-brand-50 text-brand-700 border-brand-200" },
    suspended: { label: "Suspended", classes: "bg-danger-50 text-danger-700 border-danger-200" },
  };
  const s = map[status];
  return <Chip className={s.classes}>{s.label}</Chip>;
}

export function RiskLevelChip({ level }: { level: RiskLevel }) {
  const map: Record<RiskLevel, { label: string; dot: string; classes: string }> = {
    high: { label: "High", dot: "bg-danger-500", classes: "bg-danger-50 text-danger-700 border-danger-200" },
    medium: { label: "Medium", dot: "bg-warning-500", classes: "bg-warning-50 text-warning-700 border-warning-200" },
    low: { label: "Low", dot: "bg-info-500", classes: "bg-info-50 text-info-700 border-info-200" },
  };
  const s = map[level];
  return (
    <Chip className={s.classes}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {s.label}
    </Chip>
  );
}

export function PauseReasonChip({ reason }: { reason: string }) {
  return <Chip className="bg-warning-50 text-warning-700 border-warning-200">{reason}</Chip>;
}

export function OutreachStatusChip({ status }: { status: OutreachStatus }) {
  const map: Record<OutreachStatus, { label: string; dot: string; classes: string }> = {
    "not-contacted": { label: "Not Contacted", dot: "bg-surface-400", classes: "bg-surface-100 text-surface-600 border-surface-200" },
    "chaser-sent": { label: "Chaser Sent", dot: "bg-info-500", classes: "bg-info-50 text-info-700 border-info-200" },
    "awaiting-response": { label: "Awaiting Response", dot: "bg-warning-500", classes: "bg-warning-50 text-warning-700 border-warning-200" },
    responded: { label: "Responded", dot: "bg-success-500", classes: "bg-success-50 text-success-700 border-success-200" },
    escalated: { label: "Escalated", dot: "bg-danger-500", classes: "bg-danger-50 text-danger-700 border-danger-200" },
  };
  const s = map[status];
  return (
    <Chip className={s.classes}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {s.label}
    </Chip>
  );
}

export function MissingDocChip({ label }: { label: string }) {
  return <Chip className="bg-danger-50 text-danger-700 border-danger-200 text-[11px]">{label}</Chip>;
}

export function DocsCompleteChip({ approved, required }: { approved: number; required: number }) {
  const complete = approved >= required;
  return (
    <Chip className={complete ? "bg-success-50 text-success-700 border-success-200" : "bg-danger-50 text-danger-700 border-danger-200"}>
      {complete ? "Complete" : "Missing"}
      <span className="opacity-70">
        {approved}/{required}
      </span>
    </Chip>
  );
}

export function CanBeRestoredChip({ can }: { can: boolean }) {
  return (
    <Chip className={can ? "bg-success-50 text-success-700 border-success-200" : "bg-surface-100 text-surface-500 border-surface-200"}>
      {can ? "✓ Yes" : "✗ No"}
    </Chip>
  );
}

export function RfqStatusChip({ status }: { status: RfqStatus }) {
  const map: Record<RfqStatus, { label: string; classes: string }> = {
    draft: { label: "Draft", classes: "bg-surface-100 text-surface-500 border-surface-200" },
    sent: { label: "Sent", classes: "bg-info-50 text-info-700 border-info-200" },
    "responses-received": { label: "Responses Received", classes: "bg-brand-50 text-brand-700 border-brand-200" },
    "under-review": { label: "Under Review", classes: "bg-violet-50 text-violet-700 border-violet-200" },
    awarded: { label: "Awarded", classes: "bg-success-50 text-success-700 border-success-200" },
    closed: { label: "Closed", classes: "bg-surface-100 text-surface-500 border-surface-200" },
  };
  const s = map[status];
  return <Chip className={s.classes}>{s.label}</Chip>;
}

export function FitBadge({ fit }: { fit: "High" | "Medium" }) {
  return (
    <Chip className={fit === "High" ? "bg-success-50 text-success-700 border-success-200" : "bg-warning-50 text-warning-700 border-warning-200"}>
      {fit} fit
    </Chip>
  );
}
