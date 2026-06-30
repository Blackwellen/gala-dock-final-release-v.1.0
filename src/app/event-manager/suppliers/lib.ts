/** Format an ISO timestamp as e.g. "2 Jun 2026", or "—" when absent. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Derive a document health badge for a supplier from its file count and
 * insurance expiry. Live schema has no per-file verification flag, so we treat
 * an expired/absent insurance date as "missing", files-present as "verified",
 * and otherwise "pending".
 */
export function docsStatus(
  fileCount: number,
  insuranceExpiry: string | null
): "verified" | "pending" | "missing" {
  if (insuranceExpiry) {
    const expiry = new Date(insuranceExpiry);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return "missing";
    }
  }
  if (fileCount > 0) return "verified";
  return insuranceExpiry ? "pending" : "missing";
}
