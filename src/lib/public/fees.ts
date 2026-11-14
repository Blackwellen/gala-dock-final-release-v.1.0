// Q57 / DMCC Act 2024 (drip pricing): a ticket price shown as an invitation to buy must include the mandatory booking fee.
// Same formula as checkout (client estimate + checkout_quote): per paid ticket, fixed + pct_bps of the price. Free tickets: no fee.
// Pure module.
export type FeeConfig = { fixed: number; pct_bps: number };
export const NO_FEE: FeeConfig = { fixed: 0, pct_bps: 0 };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseFeeConfig(v: unknown): FeeConfig {
  const o = (v ?? {}) as { fixed?: unknown; pct_bps?: unknown };
  const fixed = Number(o.fixed), pct = Number(o.pct_bps);
  return { fixed: Number.isFinite(fixed) && fixed > 0 ? fixed : 0, pct_bps: Number.isFinite(pct) && pct > 0 ? pct : 0 };
}
/** The booking fee on one ticket at this price. */
export const bookingFee = (price: number, cfg: FeeConfig) => (price > 0 ? r2(cfg.fixed + (price * cfg.pct_bps) / 10000) : 0);
/** The price a buyer actually pays for one ticket (price + mandatory booking fee). */
export const priceWithFees = (price: number, cfg: FeeConfig) => r2(price + bookingFee(price, cfg));
