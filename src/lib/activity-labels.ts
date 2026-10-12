/** Plain-English labels for audit-trail event codes shown in activity feeds. Entries that carry their own text keep it. */
const LABELS: Record<string, string> = {
  "booking.requested": "Booking requested", "booking.confirmed": "Booking confirmed", "booking.cancelled": "Booking cancelled",
  "build.primary_failed": "A supplier booking couldn’t be confirmed", "proposal.converted": "Proposal converted into this event",
  "ticket.resale_listed": "A ticket was listed for resale", "ticket.resale_withdrawn": "A resale listing was withdrawn", "ticket.purchased": "Tickets purchased",
  "order.created": "New ticket order", "event_plan.published": "Event layout published", "event_plan.saved": "Event layout draft saved",
  "portal.link_issued": "Client portal link sent", "portal.link_first_opened": "Client opened the portal", "portal.link_revoked": "Client portal link revoked",
  "portal.approval_approved": "Client approved an item", "portal.approval_rejected": "Client requested changes", "portal.client_message": "New message from the client",
  "crew.assigned": "Crew member assigned", "contract.signed": "Contract signed", "media.approved": "Media approved",
  "event.published": "Event published", "event.cancelled": "Event cancelled", "payment.succeeded": "Payment received", "refund.issued": "Refund issued",
};
const pretty = (code: string) => { const [area = "", ...rest] = code.split("."); const what = rest.join(" ").replace(/_/g, " "); const a = area.replace(/_/g, " ");
  return `${a.charAt(0).toUpperCase()}${a.slice(1)}${what ? ` · ${what}` : ""}`; };
export function activityLabel(code: string, text?: string | null) {
  if (text && text !== code) return text;
  return LABELS[code] ?? pretty(code);
}
