/**
 * Owner decision 2026-11-11: ticket money is never released before the event, so paid tickets can only go on sale once the
 * post-event payout (event end + 5 UK business days) falls inside the payment provider's hold limit. The database refuses
 * earlier sales with `tickets_on_sale_from:YYYY-MM-DD` (ticket_tier_sale_window_guard / dec107_bind_release_model).
 */
export function ticketWindowMessage(error: { message?: string } | string | null | undefined): string | null {
  const msg = typeof error === "string" ? error : error?.message ?? "";
  const m = /tickets_on_sale_from:(\d{4}-\d{2}-\d{2})/.exec(msg);
  if (!m) return null;
  const date = new Date(`${m[1]}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `Tickets can go on sale from ${date}. Ticket money stays in your own Stripe account until after the event, and the payment provider only holds it for a limited time, so sales open closer to the date.`;
}
