/**
 * One rule for "can this page offer Buy?" (§50 launch state + Q07 seller readiness), shared by the ticket card (TicketPicker)
 * and the hero call-to-action so the two can never disagree.
 */
export const SELLABLE_LAUNCH = ["presale", "on_sale", "final_release", "low_availability"];
export const CLOSED_LABEL: Record<string, string> = { draft: "Not on sale", coming_soon: "Tickets on sale soon", countdown: "Tickets on sale soon", sold_out: "Sold out", waitlist: "Sold out — join the waiting list", postponed: "Event postponed", cancelled: "Event cancelled", ended: "This event has ended" };

export const isSellable = (launch: string | null) => !launch || SELLABLE_LAUNCH.includes(launch);

/** Q57: fan resale can be bought whenever listings exist and the event is still upcoming and published — in particular when new
 *  tickets are sold out (hold_resale doesn't look at the primary launch state). Never for a postponed/cancelled/ended/draft event or a
 *  seller who can't take payments yet (a resale is a new direct charge to the same organiser). */
export const RESALE_CLOSED_LAUNCH = ["draft", "postponed", "cancelled", "ended", "seller_not_ready"];
export const resaleBuyable = (launch: string | null) => !launch || !RESALE_CLOSED_LAUNCH.includes(launch);

/**
 * Q57: what a ticket tier row can offer right now. The public event page used to treat every status other than on_sale/scheduled as
 * "Sold out" (a paused tier read "Sold out") and ignored the sale window, so a tier whose sales had ended still offered Buy that
 * checkout then refused (hold_tickets checks sale_start / sale_end).
 */
export function tierOffer(t: { status: string; left: number; sale_start?: string | null; sale_end?: string | null }, now: number): { buyable: boolean; label: string | null; soldOut: boolean } {
  const soldOut = t.status === "sold_out" || (t.status === "on_sale" && t.left <= 0);
  if (soldOut) return { buyable: false, label: "Sold out", soldOut: true };
  if (t.status === "scheduled" || (t.status === "on_sale" && t.sale_start && Date.parse(t.sale_start) > now)) return { buyable: false, label: "Coming soon", soldOut: false };
  if (t.status === "on_sale" && t.sale_end && Date.parse(t.sale_end) <= now) return { buyable: false, label: "Sales ended", soldOut: false };
  if (t.status === "on_sale") return { buyable: true, label: null, soldOut: false };
  return { buyable: false, label: t.status === "paused" ? "Paused" : "Not on sale", soldOut: false };
}

/** Hero primary button: the organiser's label when tickets can be bought, otherwise the same state the ticket card shows. href null = not actionable. */
export function heroTicketCta(o: { label: string; launch: string | null; sellerReady: boolean; buyable: number; waitlist: boolean; anySoldOut: boolean; resale?: number; resaleHref?: string }): { label: string; href: string | null } {
  // Q57: sold out (or nothing buyable) but fans are reselling at face value — point at resale instead of a dead "Sold out".
  if ((o.resale ?? 0) > 0 && o.resaleHref && o.sellerReady && resaleBuyable(o.launch) && (!isSellable(o.launch) || o.buyable === 0)) return { label: "Buy fan resale tickets", href: o.resaleHref };
  if (isSellable(o.launch) && !o.sellerReady) return o.waitlist ? { label: "Join the waitlist", href: "#tickets" } : { label: "Tickets on sale soon", href: null };
  if (!isSellable(o.launch)) return { label: CLOSED_LABEL[o.launch!] ?? "Not on sale", href: o.waitlist && o.anySoldOut ? "#tickets" : null };
  if (o.buyable > 0) return { label: o.label || "Buy tickets", href: "#tickets" };
  return o.waitlist && o.anySoldOut ? { label: "Join the waiting list", href: "#tickets" } : { label: "Not on sale", href: null };
}


/** Organiser's external merch store (settings.merch_url, saved by saveMerchUrl), re-checked for display: https, no credentials, no markup characters. */
export function safeMerchUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500 || !/^https:\/\/[^\s"'<>\\]+$/i.test(v)) return null;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null; } catch { return null; }
}
