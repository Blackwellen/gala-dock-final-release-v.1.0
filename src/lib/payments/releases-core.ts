/**
 * DEC-107 release planning (pure; unit-tested in tests/payments/dec107-rules.spec.ts). Groups due releases into one payout per
 * seller account × event × currency, so ticket sales, resales and merch of one event are paid out (and reported) together.
 * Main release = the charge's net in the seller's balance (gross − refunds − Gala Dock's kept application fee − open card
 * disputes) less the objective reserve; a reserve part pays exactly the reserve recorded when its main release was paid.
 * Q76 (C13): a charge in one currency can settle in another (a EUR ticket on a GBP-settling account is credited in GBP). The
 * net is then converted with the charge's own balance transaction and the payout is made in the SETTLEMENT currency.
 */
export type DueRelease = { id: string; part: "main" | "reserve"; workspace_id: string; stripe_account_id: string; payment_intent: string | null; event_id: string | null;
  sale_kind: string; currency: string; source_type: string; source_ref: string; reserve_minor: number | null; trigger: string | null };
/** netMinor is in `currency` (the settlement currency) when set, else in the release row's (charge) currency. */
export type ChargeNet = { netMinor: number; currency?: string; error?: string };
export type Reserve = { kind: string; bps: number; days: number } | null;
export type ReleaseItem = { id: string; amount_minor: number; currency?: string; reserve_kind?: string; reserve_bps?: number; reserve_minor?: number; reserve_days?: number };

export type BalanceTxn = { amount: number; net: number; currency: string } | null | undefined;
/**
 * Net of a charge in the currency it SETTLED in on the seller's balance. Same currency → gross − refunds − kept fee − disputed
 * (unchanged). Different currency → that net scaled by the charge's own conversion (balance_transaction.amount / charge amount),
 * floored, and never more than the balance transaction credited (bt.net). All amounts are integer minor units of their currency.
 */
export function settlementNet(c: { amount: number; refunded: number; feeKept: number; disputed: number; currency: string; bt?: BalanceTxn }): { netMinor: number; currency: string } {
  const chargeCur = c.currency.toUpperCase();
  const net = Math.max(0, c.amount - c.refunded - c.feeKept - c.disputed);
  const bt = c.bt;
  if (!bt || !bt.currency || bt.currency.toUpperCase() === chargeCur) return { netMinor: net, currency: chargeCur };
  const cur = bt.currency.toUpperCase();
  if (!(c.amount > 0) || !Number.isFinite(bt.amount) || bt.amount <= 0) return { netMinor: 0, currency: cur };
  const scaled = Math.floor((net * bt.amount) / c.amount);
  return { netMinor: Math.max(0, Math.min(scaled, Math.max(0, Math.trunc(bt.net)))), currency: cur };
}
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
    // Main parts pay out in the currency their charge settled in; reserve parts were recorded in it (dec107_release_paid).
    const cur = ((r.part === "main" && r.payment_intent ? nets.get(r.payment_intent)?.currency : null) ?? r.currency).toUpperCase();
    const key = `${r.stripe_account_id}|${r.event_id ?? "-"}|${cur}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, account: r.stripe_account_id, workspaceId: r.workspace_id, eventId: r.event_id, currency: cur, payoutMinor: 0, trigger: r.trigger ?? "release",
        description: `Gala Dock release${r.event_id ? " · event " + r.event_id.slice(0, 8) : ""}`, items: [] };
      groups.set(key, g);
    }
    if (r.part === "reserve") {
      const amt = Math.max(0, Number(r.reserve_minor ?? 0));
      g.items.push({ id: r.id, amount_minor: amt, currency: cur });
      g.payoutMinor += amt;
      continue;
    }
    const net = r.payment_intent ? nets.get(r.payment_intent) : undefined;
    if (!net || net.error) { g.error = net?.error ?? "no_payment_intent"; continue; }
    const { payMinor, reserveMinor } = reserveSplit(net.netMinor, reserves.get(r.workspace_id) ?? null);
    const res = reserves.get(r.workspace_id);
    g.items.push(reserveMinor > 0 && res ? { id: r.id, amount_minor: payMinor, currency: cur, reserve_kind: res.kind, reserve_bps: res.bps, reserve_minor: reserveMinor, reserve_days: res.days }
      : { id: r.id, amount_minor: payMinor, currency: cur });
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
