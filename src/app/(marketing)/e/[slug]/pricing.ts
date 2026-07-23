// Gala Dock — public ticket checkout pricing policy. Single source of truth shared by the
// checkout review UI (display) and the server action that creates the charge (authority) so the
// two can never drift. Rates are a provisional platform policy pending a finance-configured fee
// table — see docs/release-gated/user-fixes/public-event-commerce.md for the follow-up.

export const SERVICE_FEE_PCT = 0.06; // 6% of ticket subtotal
export const BOOKING_FEE_CENTS_PER_TICKET = 150; // £1.50/ticket
export const ORDER_PROTECTION_CENTS = 199; // flat, optional, opt-out

export interface PriceLine {
  ticketTypeId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface PriceBreakdown {
  subtotalCents: number;
  bookingFeeCents: number;
  serviceFeeCents: number;
  protectionCents: number;
  discountCents: number;
  totalCents: number;
}

export function computeBreakdown(
  lines: PriceLine[],
  opts: { discountCents?: number; includeProtection?: boolean } = {}
): PriceBreakdown {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const ticketCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const bookingFeeCents = ticketCount * BOOKING_FEE_CENTS_PER_TICKET;
  const serviceFeeCents = Math.round(subtotalCents * SERVICE_FEE_PCT);
  const protectionCents = opts.includeProtection ? ORDER_PROTECTION_CENTS : 0;
  const discountCents = Math.min(opts.discountCents ?? 0, subtotalCents);
  const totalCents = Math.max(0, subtotalCents - discountCents + bookingFeeCents + serviceFeeCents + protectionCents);
  return { subtotalCents, bookingFeeCents, serviceFeeCents, protectionCents, discountCents, totalCents };
}

/** Short, human-friendly order reference (not a security token — the DB id is authoritative). */
export function generateOrderReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "GD-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
