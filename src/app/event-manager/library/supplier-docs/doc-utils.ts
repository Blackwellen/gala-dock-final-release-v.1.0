import type { VerificationStatus } from "./types";

const EXPIRING_SOON_WINDOW_DAYS = 30;

export function daysUntil(iso: string, now = Date.now()): number {
  const t = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((t - now) / (1000 * 60 * 60 * 24));
}

/**
 * Effective (displayed) verification status. `missing` and `rejected` are
 * terminal — they always win. Otherwise an expiry date within the window
 * (or already passed) overrides a stored `verified`/`pending_review` value,
 * because a verified-but-now-expired document is not actually compliant.
 */
export function effectiveStatus(
  stored: VerificationStatus,
  expiryDate: string | null,
  now = Date.now()
): VerificationStatus {
  if (stored === "missing" || stored === "rejected") return stored;
  if (expiryDate) {
    const d = daysUntil(expiryDate, now);
    if (d < 0) return "expired";
    if (d <= EXPIRING_SOON_WINDOW_DAYS) return "expiring_soon";
  }
  return stored === "verified" ? "verified" : "pending_review";
}

/**
 * Badge styling reused verbatim from the colour vocabulary already
 * established in src/components/ui/StatusBadge.tsx (success/warning/danger/
 * surface tokens) — kept local because the labels here ("Expiring Soon",
 * "Pending Review", "Missing") don't all have a matching key in that shared
 * component's fixed Status union, and this folder is scoped to only add
 * exports to _shared.tsx/library-utils.ts, not modify StatusBadge.tsx.
 */
export const VERIFICATION_BADGE: Record<VerificationStatus, { label: string; classes: string }> = {
  verified:        { label: "Verified",        classes: "bg-success-50 text-success-700 border-success-200" },
  pending_review:  { label: "Pending Review",   classes: "bg-warning-50 text-warning-600 border-warning-200" },
  expiring_soon:   { label: "Expiring Soon",    classes: "bg-warning-50 text-warning-600 border-warning-200" },
  expired:         { label: "Expired",          classes: "bg-danger-50  text-danger-600  border-danger-200" },
  rejected:        { label: "Rejected",         classes: "bg-danger-50  text-danger-600  border-danger-200" },
  missing:         { label: "Missing",          classes: "bg-danger-50  text-danger-600  border-danger-200" },
};

export const VISIBILITY_BADGE: Record<string, { label: string; classes: string }> = {
  workspace:     { label: "Internal", classes: "bg-surface-100 text-surface-600 border-surface-200" },
  restricted:    { label: "Restricted", classes: "bg-violet-50 text-violet-600 border-violet-200" },
  link:          { label: "Shared", classes: "bg-info-50 text-info-600 border-info-200" },
  public_token:  { label: "Public", classes: "bg-brand-50 text-brand-700 border-brand-200" },
};

export const RISK_BADGE: Record<string, { label: string; classes: string }> = {
  critical: { label: "Critical", classes: "bg-danger-50 text-danger-700 border-danger-200" },
  high:     { label: "High",     classes: "bg-danger-50 text-danger-600 border-danger-200" },
  medium:   { label: "Medium",   classes: "bg-warning-50 text-warning-600 border-warning-200" },
  low:      { label: "Low",      classes: "bg-success-50 text-success-700 border-success-200" },
};

export function expiryDisplay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function expiryDetail(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const d = daysUntil(iso, now);
  if (d < 0) return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return "Today";
  return `${d} days`;
}
