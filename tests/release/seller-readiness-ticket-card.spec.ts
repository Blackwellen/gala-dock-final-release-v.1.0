import { test, expect } from "@playwright/test";
import { anon, admin } from "../phase1/helpers";

// Coordinator decision 2 (W01/W13): while the seller's Stripe account can't take payments (event_payment_readiness, Q07),
// the public ticket card must not offer Buy — "Tickets on sale soon", or "Join the waitlist" when the event has one.
// Checkout keeps its own refusal. No browser: server-rendered HTML + the same anon readiness read the page uses.

test("event page never offers Buy while checkout would refuse the seller", async ({ request }) => {
  const sb = anon() as unknown as { from: (t: string) => any; rpc: (f: string, a: unknown) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const svc = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: events } = await sb.from("events").select("id,slug,settings").eq("visibility", "public").in("status", ["on_sale", "published", "live"]).not("slug", "is", null).limit(40);
  let checked = 0;
  for (const e of (events ?? []) as { id: string; slug: string; settings: Record<string, unknown> | null }[]) {
    const { data: readiness } = await sb.rpc("event_payment_readiness", { p_event: e.id });
    const { data: tiers } = await svc.from("ticket_tiers").select("price,status,quantity,sold,held").eq("event_id", e.id).eq("status", "on_sale");
    const paid = ((tiers ?? []) as { price: number; quantity: number; sold: number; held: number }[]).some(t => Number(t.price) > 0 && t.quantity - t.sold - t.held > 0);
    if (!paid) continue;
    const html = await (await request.get(`/events/${e.slug}`)).text();
    if (readiness === "ready") { expect(html, e.slug).toContain("Buy Tickets"); }
    else {
      expect(html, e.slug).not.toContain("Buy Tickets");
      const waitlist = e.settings?.waiting_list === true || (e.settings as { ticket_pro?: { sales?: { waiting_list?: boolean } } } | null)?.ticket_pro?.sales?.waiting_list === true;
      expect(html, e.slug).toMatch(waitlist ? /Join the waitlist/ : /Tickets on sale soon/);
      // Checkout's refusal is unchanged.
      expect(await (await request.get(`/checkout/${e.slug}`)).text(), e.slug).toMatch(/aren.t open yet/);
    }
    if (++checked >= 4) break;
  }
  expect(checked, "at least one public event with paid tiers on sale").toBeGreaterThan(0);
});
