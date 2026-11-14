// Q57: a ticket under a card-payment dispute keeps status "valid" in the DB (same codes; migration 202611146203) but carries
// dispute_hold_at. Customer screens show it as "on_hold" so Transfer / Official resale / print are not offered for a ticket the
// DB will refuse (gd_0_dispute_hold_guard) and the door turns away ("see box office"). Pure module.
export const ON_HOLD = "on_hold";
export const HOLD_MESSAGE = "This ticket is on hold while a card payment dispute is reviewed. It can't be transferred, resold or used for entry until the hold is lifted.";

/** The status a customer screen should act on: "on_hold" for a held valid ticket, else the stored status. */
export function customerTicketStatus(status: string, disputeHoldAt: string | null | undefined): string {
  return status === "valid" && disputeHoldAt ? ON_HOLD : status;
}
