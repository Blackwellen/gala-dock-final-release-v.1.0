/**
 * Customer-facing fee estimates for display before payment. The amount actually charged is computed by the database
 * (booking_admin_fee_minor / ticket_fee_config, from the published commerce settings, migration 202610280005); keep these
 * in step with those settings.
 */
export const BOOKING_ADMIN_FEE = { pct: 2.5, minimum: 1 } as const;

/** Booking admin fee on a marketplace payment of `amount` pounds: 2.5% rounded to the penny, minimum £1. */
export const bookingAdminFee = (amount: number) => amount > 0 ? Math.max(BOOKING_ADMIN_FEE.minimum, Math.round(amount * BOOKING_ADMIN_FEE.pct) / 100) : 0;

/** £ with pence when needed (fees are rarely whole pounds). */
export const gbpPence = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
