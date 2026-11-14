/**
 * DEC-107 release planning (pure; unit-tested in tests/payments/dec107-rules.spec.ts). Groups due releases into one payout per
 * seller account × event × currency, so ticket sales, resales and merch of one event are paid out (and reported) together.
 * Main release = the charge's net in the seller's balance (gross − refunds − Gala Dock's kept application fee − open card
 * disputes) less the objective reserve; a reserve part pays exactly the reserve recorded when its main release was paid.
 */
export type DueRelease = { id: string; part: "main" | "reserve"; workspace_id: string; stripe_account_id: string; payment_intent: string | null; event_id: string | null;
  sale_kind: string; currency: string; source_type: string; source_ref: string; reserve_minor: number | null; trigger: string | null };
export type ChargeNet = { netMinor: number; error?: string };
export type Reserve = { kind: string; bps: number; days: number } | null;
export type ReleaseItem = { id: string; amount_minor: number; reserve_kind?: string; reserve_bps?: number; reserve_minor?: number; reserve_days?: number };
export type ReleaseGroup = { key: string; account: string; workspaceId: string; eventId: string | null; currency: string; payoutMinor: number; trigger: string;
  description: string; items: ReleaseItem[]; error?: string };

export function reserveSplit(netMinor: number, reserve: Reserve) {
  if (!Number.isSafeInteger(netMinor) || netMinor < 0) throw new Error("invalid_net");
  if (!reserve || reserve.bps <= 0) return { payMinor: netMinor, reserveMinor: 0 };
  if (reserve.bps > 5000) throw new Error("reserve_above_cap");
  const reserveMinor = Math.floor((netMinor * reserve.bps) / 10000);
  return { payMinor: netMinor - reserveMinor, reserveMinor };
}

export function planReleaseGroups(rows: DueRelease[], nets: Map<string, ChargeNet>, reserves: Map<string, Reserve>): ReleaseGroup[] {
  const groups = new Map<string, ReleaseGroup>();
  for (const r of rows) {
    const key = `${r.stripe_account_id}|${r.event_id ?? "-"}|${r.currency.toUpperCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, account: r.stripe_account_id, workspaceId: r.workspace_id, eventId: r.event_id, currency: r.currency.toUpperCase(), payoutMinor: 0, trigger: r.trigger ?? "release",
        description: `Gala Dock release${r.event_id ? " · event " + r.event_id.slice(0, 8) : ""}`, items: [] };
      groups.set(key, g);
    }
    if (r.part === "reserve") {
      const amt = Math.max(0, Number(r.reserve_minor ?? 0));
      g.items.push({ id: r.id, amount_minor: amt });
      g.payoutMinor += amt;
      continue;
    }
    const net = r.payment_intent ? nets.get(r.payment_intent) : undefined;
    if (!net || net.error) { g.error = net?.error ?? "no_payment_intent"; continue; }
    const { payMinor, reserveMinor } = reserveSplit(net.netMinor, reserves.get(r.workspace_id) ?? null);
    const res = reserves.get(r.workspace_id);
    g.items.push(reserveMinor > 0 && res ? { id: r.id, amount_minor: payMinor, reserve_kind: res.kind, reserve_bps: res.bps, reserve_minor: reserveMinor, reserve_days: res.days }
      : { id: r.id, amount_minor: payMinor });
    g.payoutMinor += payMinor;
  }
  return [...groups.values()];
}

/**
 * Covered liability (DEC-107 Payment Terms; Gigvora 1013 recovery order "available balance → reserve → later releases"): when the
 * seller's own balance is short because Stripe debited a chargeback (or a refund) from it, a release pays out what is actually
 * available and the shortfall stays recovered from that seller's money — Gala Dock never tops it up and never overdraws the
 * balance. Items are reduced in order; the shortfall is reported so the seller can be told.
 */
export function capGroupToAvailable(g: ReleaseGroup, availableMinor: number): { group: ReleaseGroup; shortfallMinor: number } {
  if (!Number.isSafeInteger(availableMinor) || availableMinor < 0) throw new Error("invalid_available");
  // The reserve of these releases stays in the balance, so only what is above it can be paid out.
  const reserve = g.items.reduce((t, i) => t + (i.reserve_minor ?? 0), 0);
  const payable = Math.max(0, availableMinor - reserve);
  if (payable >= g.payoutMinor) return { group: g, shortfallMinor: 0 };
  let left = payable;
  const items = g.items.map(i => { const pay = Math.min(i.amount_minor, left); left -= pay; return { ...i, amount_minor: pay }; });
  return { group: { ...g, items, payoutMinor: payable }, shortfallMinor: g.payoutMinor - payable };
}
/** Disputed money gone from a charge: open card disputes (withdrawn, outcome pending) plus lost ones (withdrawn for good). */
export function disputedMinor(rows: { amount_minor: number; outcome: string | null }[]) {
  return rows.filter(d => d.outcome == null || d.outcome === "lost").reduce((a, d) => a + Number(d.amount_minor), 0);
}
