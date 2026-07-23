import { formatCurrency } from "@/lib/utils";

// Marketplace money values are stored in minor units (pence) per AGENTS.md marketplace brief
// ("Use currency minor units for financial values"). Always go through this helper rather than
// dividing by 100 inline so the convention stays enforceable in one place.
export function formatMoneyFromCents(cents: number, currency = "GBP"): string {
  return formatCurrency(cents / 100, currency);
}

const UNIT_SUFFIX: Record<string, string> = {
  per_event: "per event",
  per_head: "per head",
  per_day: "per day",
  per_hour: "per hour",
  per_staff: "per staff",
  fixed: "",
};

export function formatPriceFrom(cents: number, unit: string, currency = "GBP"): string {
  const suffix = UNIT_SUFFIX[unit] ?? "";
  return suffix ? `${formatMoneyFromCents(cents, currency)} ${suffix}` : formatMoneyFromCents(cents, currency);
}
