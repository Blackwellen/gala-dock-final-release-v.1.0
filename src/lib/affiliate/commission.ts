// Gala Dock — two-tier affiliate commission maths (pure, unit-tested).
//
// Tier-1: an affiliate earns commission on conversions they referred directly.
// Tier-2: the affiliate who RECRUITED them earns an override on those same conversions.
// All money in minor units (pence). Rates are whole percentages (e.g. 20 = 20%).

/** Override pence a parent earns on a child conversion of `invoiceCents` at `overrideRatePct`. */
export function computeOverrideCents(invoiceCents: number, overrideRatePct: number): number {
  if (invoiceCents <= 0 || overrideRatePct <= 0) return 0;
  return Math.floor((invoiceCents * overrideRatePct) / 100);
}

export interface EarningRow {
  amountCents: number;
  status: string; // pending | approved | paid | void
}

export interface EarningsSummary {
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  /** pending + approved + paid (excludes void). */
  totalCents: number;
}

/** Roll up a set of earning rows (conversions or overrides) into status buckets. */
export function summariseEarnings(rows: EarningRow[]): EarningsSummary {
  const s: EarningsSummary = { pendingCents: 0, approvedCents: 0, paidCents: 0, totalCents: 0 };
  for (const r of rows) {
    if (r.status === "void") continue;
    if (r.status === "paid") s.paidCents += r.amountCents;
    else if (r.status === "approved") s.approvedCents += r.amountCents;
    else s.pendingCents += r.amountCents; // pending / unknown -> pending bucket
    s.totalCents += r.amountCents;
  }
  return s;
}

/** Combined lifetime earnings across tier-1 (direct) and tier-2 (override) rows. */
export function combinedEarningsCents(direct: EarningRow[], override: EarningRow[]): number {
  return summariseEarnings(direct).totalCents + summariseEarnings(override).totalCents;
}
