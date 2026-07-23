// Shared helpers for the Venues section.

/** Format an ISO timestamp/date as a short UK date, or "—" when empty. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format a *_cents value as GBP (£). Returns "—" when null/undefined. */
export function formatGBP(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Compose the human-readable location line from venue address parts. */
export function composeLocation(parts: {
  city?: string | null;
  region?: string | null;
  address_line1?: string | null;
  postal_code?: string | null;
}): string {
  const bits = [parts.city, parts.region].filter(Boolean) as string[];
  if (bits.length > 0) return bits.join(", ");
  if (parts.address_line1) return parts.address_line1;
  if (parts.postal_code) return parts.postal_code;
  return "—";
}

/**
 * Derive a document health status from an optional expiry date.
 * Mirrors the plan: expired / expiring-soon (<= 30 days) / active.
 */
export function docHealth(
  expiry: string | null | undefined,
  stored?: string | null
): "active" | "expiring-soon" | "expired" {
  if (!expiry) {
    // Fall back to a stored status if present and valid.
    if (stored === "expired" || stored === "expiring-soon") return stored;
    return "active";
  }
  const t = new Date(expiry).getTime();
  if (Number.isNaN(t)) return "active";
  const now = Date.now();
  if (t < now) return "expired";
  if (t <= now + 1000 * 60 * 60 * 24 * 30) return "expiring-soon";
  return "active";
}

/** Human label for a venue document type. */
export const DOC_TYPE_LABEL: Record<string, string> = {
  "hire-agreement": "Hire Agreement",
  floorplan: "Floor Plan",
  "health-safety": "H&S Policy",
  insurance: "Insurance",
  "capacity-certificate": "Capacity Certificate",
  "site-map": "Site Map",
  other: "Other",
};

/** True when `value` is a date in the future (used for "upcoming" splits in server components). */
export function isFutureDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t >= Date.now();
}

/** True when `value` is within `days` days from now (inclusive), and not already past. */
export function isWithinDays(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  const diffDays = (t - Date.now()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

/** True when `value` is within the last `days` days (used for "this month" activity splits). */
export function isWithinPastDays(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 1000 * 60 * 60 * 24 * days;
}

/** Format a byte count as a compact size string. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
