/**
 * One rule for "can this page offer Buy?" (§50 launch state + Q07 seller readiness), shared by the ticket card (TicketPicker)
 * and the hero call-to-action so the two can never disagree.
 */
export const SELLABLE_LAUNCH = ["presale", "on_sale", "final_release", "low_availability"];
export const CLOSED_LABEL: Record<string, string> = { draft: "Not on sale", coming_soon: "Tickets on sale soon", countdown: "Tickets on sale soon", sold_out: "Sold out", waitlist: "Sold out — join the waiting list", postponed: "Event postponed", cancelled: "Event cancelled", ended: "This event has ended" };

export const isSellable = (launch: string | null) => !launch || SELLABLE_LAUNCH.includes(launch);

/** Hero primary button: the organiser's label when tickets can be bought, otherwise the same state the ticket card shows. href null = not actionable. */
export function heroTicketCta(o: { label: string; launch: string | null; sellerReady: boolean; buyable: number; waitlist: boolean; anySoldOut: boolean }): { label: string; href: string | null } {
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
