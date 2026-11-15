/**
 * Customer-facing fee estimates for display before payment. The amount actually charged is computed by the database
 * (booking_admin_fee_minor / ticket_fee_config, from the published commerce settings, migration 202610280005; per currency via
 * ref_fee_catalogue, migration 202611147651); keep these in step with those settings.
 */
import { formatMoney, localFixedFeeMinor } from "@/lib/i18n/money";

export const BOOKING_ADMIN_FEE = { pct: 2.5, minimum: 1 } as const;

/** The admin-fee minimum in `currency` (major units): £1.00, €1.20, US$1.30 … (Q76 fee catalogue). */
export const bookingAdminMinimum = (currency: string = "GBP") => localFixedFeeMinor("booking_admin_min", Math.round(BOOKING_ADMIN_FEE.minimum * 100), currency) / 100;

/** Booking admin fee on a marketplace payment of `amount` (major units of `currency`): 2.5% rounded to the minor unit, local minimum. */
export const bookingAdminFee = (amount: number, currency: string = "GBP") => amount > 0 ? Math.max(bookingAdminMinimum(currency), Math.round(amount * BOOKING_ADMIN_FEE.pct) / 100) : 0;

/** Fee amount with minor units when needed (fees are rarely whole units): "£1", "£2.50", "€1.20". */
export const feeMoney = (n: number, currency: string = "GBP") => formatMoney(n, currency, { decimals: !Number.isInteger(n) });

/** £ with pence when needed. Kept for existing callers; new code uses feeMoney(n, currency). */
export const gbpPence = (n: number) => feeMoney(n, "GBP");
