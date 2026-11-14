import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { heroTicketCta, resaleBuyable, tierOffer } from "../../src/lib/public/ticket-cta";
import { customerTicketStatus, ON_HOLD } from "../../src/lib/tickets/hold";

// Q57 marketplace bug hunt (phase A, code level). Pure + source checks only: no browser, no dev server, no database.
// The DB half (held ticket can't be offered for transfer, unsupported country → enquiry-only, anon review columns) is the
// exercise scripts/db/exercises/202611146701_marketplace_bughunt.sql, run by migrate.mjs dry-run/apply.
const src = (p: string) => readFileSync(p, "utf8");
const NOW = Date.parse("2026-11-14T12:00:00Z");

test.describe("Q57 · ticket tiers offer what checkout will sell", () => {
  test("sale window is honoured (hold_tickets refuses outside it)", () => {
    expect(tierOffer({ status: "on_sale", left: 5, sale_end: "2026-11-13T00:00:00Z" }, NOW)).toEqual({ buyable: false, label: "Sales ended", soldOut: false });
    expect(tierOffer({ status: "on_sale", left: 5, sale_start: "2026-11-20T00:00:00Z" }, NOW)).toEqual({ buyable: false, label: "Coming soon", soldOut: false });
    expect(tierOffer({ status: "on_sale", left: 5, sale_start: "2026-11-01T00:00:00Z", sale_end: "2026-12-01T00:00:00Z" }, NOW)).toEqual({ buyable: true, label: null, soldOut: false });
  });
  test("paused / other states are not called Sold out", () => {
    expect(tierOffer({ status: "paused", left: 50 }, NOW).label).toBe("Paused");
    expect(tierOffer({ status: "scheduled", left: 50 }, NOW).label).toBe("Coming soon");
    expect(tierOffer({ status: "sold_out", left: 0 }, NOW)).toEqual({ buyable: false, label: "Sold out", soldOut: true });
    expect(tierOffer({ status: "on_sale", left: 0 }, NOW).soldOut).toBe(true);
  });
  test("the event page and picker use tierOffer", () => {
    const page = src("src/app/events/[slug]/page.tsx");
    expect(page).toContain("sale_start,sale_end");
    expect(page).toContain("tierOffer(");
    expect(src("src/components/customer/public-event-client.tsx")).toContain("x.offerLabel ??");
  });
});

test.describe("Q57 · fan resale is reachable when new tickets are sold out", () => {
  test("resale stays buyable on sold-out / waitlist events but not on closed ones", () => {
    for (const l of ["sold_out", "waitlist", "on_sale", "low_availability", null]) expect(resaleBuyable(l)).toBe(true);
    for (const l of ["postponed", "cancelled", "ended", "draft", "seller_not_ready"]) expect(resaleBuyable(l)).toBe(false);
  });
  test("hero CTA points at resale instead of a dead Sold out", () => {
    const base = { label: "Buy tickets", sellerReady: true, buyable: 0, waitlist: false, anySoldOut: true };
    expect(heroTicketCta({ ...base, launch: "sold_out", resale: 3, resaleHref: "/checkout/x?resale=1" })).toEqual({ label: "Buy fan resale tickets", href: "/checkout/x?resale=1" });
    expect(heroTicketCta({ ...base, launch: "sold_out", resale: 0, resaleHref: "/checkout/x?resale=1" }).href).toBeNull();
    expect(heroTicketCta({ ...base, launch: "cancelled", resale: 3, resaleHref: "/checkout/x?resale=1" }).label).toBe("Event cancelled");
    expect(heroTicketCta({ ...base, launch: "on_sale", buyable: 2, resale: 3, resaleHref: "/checkout/x?resale=1" }).label).toBe("Buy tickets");
    expect(heroTicketCta({ ...base, launch: "sold_out", sellerReady: false, resale: 3, resaleHref: "/checkout/x?resale=1" }).label).not.toBe("Buy fan resale tickets");
  });
  test("checkout Reserve no longer follows the primary launch state in resale mode", () => {
    const c = src("src/app/checkout/[event]/client.tsx");
    expect(c).toContain('const canReserve = mode === "resale" ? resaleOk : buyable;');
    expect(c).toContain("!canReserve} onClick={go}");
    expect(c).not.toMatch(/inQueue \|\| !buyable\} onClick=\{go\}/);
    const p = src("src/app/checkout/[event]/page.tsx");
    expect(p).toContain('resale={readiness !== "ready" ? []');
    expect(p).toContain('timeZone: "Europe/London" })}`');
  });
});

test.describe("Q57 · chargeback HOLD respected on listing and transfer paths", () => {
  test("held valid tickets are shown as on_hold; other statuses unchanged", () => {
    expect(customerTicketStatus("valid", "2026-11-14T10:00:00Z")).toBe(ON_HOLD);
    expect(customerTicketStatus("valid", null)).toBe("valid");
    expect(customerTicketStatus("used", "2026-11-14T10:00:00Z")).toBe("used");
    expect(customerTicketStatus("resale_listed", undefined)).toBe("resale_listed");
  });
  test("ticket screens read dispute_hold_at and map it; resale page refuses held tickets", () => {
    expect(src("src/lib/data/customer-tickets.ts")).toContain("customerTicketStatus(t.status, t.dispute_hold_at)");
    const detail = src("src/app/(customer)/account/tickets/[id]/page.tsx");
    expect(detail).toContain("customerTicketStatus(raw.status, raw.dispute_hold_at)");
    expect(detail).toContain("customerTicketStatus(x.status, x.dispute_hold_at)");
    const resale = src("src/app/(customer)/account/tickets/[id]/resale/page.tsx");
    expect(resale).toContain("id,code,event_id,status,dispute_hold_at,");
    expect(resale).toContain("t.dispute_hold_at ? HOLD_MESSAGE");
  });
  test("DB refusals get specific messages, not 'Could not update resale.'", () => {
    const a = src("src/lib/actions/tickets.ts");
    expect(a.match(/ticket_on_hold/g)?.length).toBe(2);
    expect(a).toContain('"resale_limit"');
    expect(src("src/lib/tickets/actions.ts")).toContain("[/ticket_on_hold/,");
    const m = src("supabase/migrations/202611146701_marketplace_bughunt.sql");
    expect(m).toContain("if tk.dispute_hold_at is not null then raise exception 'ticket_on_hold'");
  });
});

test.describe("Q57 · supplier & venue marketplace", () => {
  test("city filter matches the city column as well as the address line", () => {
    for (const p of ["src/app/organizer/marketplace/page.tsx", "src/app/(customer)/discover/page.tsx"]) {
      const s = src(p);
      expect(s).toContain("q.or(`city.ilike.%${city}%,location.ilike.%${city}%`)");
      expect(s).not.toMatch(/q\.ilike\("location", `%\$\{(str|s)\(sp\.city\)\}%`\)/);
    }
  });
  test("no phantom photo count on marketplace cards", () => {
    expect(src("src/app/organizer/marketplace/page.tsx")).not.toContain("+ 12)");
  });
  test("'Verified booking' only on reviews tied to a booking", () => {
    const s = src("src/components/customer/public-listing.tsx");
    expect(s).toContain("created_at,build_item_id");
    expect(s).toContain('r.build_item_id ? "Verified booking · " : ""');
  });
  test("quote comparison labels the quote total, not ex. VAT", () => {
    const s = src("src/app/organizer/marketplace/requests/[id]/page.tsx");
    expect(s).not.toContain("total_ex_vat");
    expect(s).toContain('"incl. VAT" : "total"');
    expect(s).not.toContain("av-alex-organizer");
    expect(s).not.toContain("Share link coming with provider portal");
  });
  test("an event's own badge can't claim Sponsored/Featured on Discover", () => {
    expect(src("src/app/(customer)/discover/page.tsx")).toContain("sponsor|promot|advert|featured");
  });
  test("ticket setup no longer offers resale caps/fees that nothing applies", () => {
    const s = src("src/components/organizer/ticket-pro/step-access.tsx");
    expect(s).not.toMatch(/\[100, 110, 120, 150\]/);
    expect(s).not.toContain("set({ fee_buyer");
    expect(s).not.toContain("set({ fee_seller");
    expect(src("src/components/organizer/ticket-pro/step-review.tsx")).toContain('"Official marketplace · face value"');
  });
  test("migration keeps unsupported-country sellers enquiry-only after a country change", () => {
    const m = src("supabase/migrations/202611146701_marketplace_bughunt.sql");
    expect(m).toContain("after update of settings on public.workspaces");
    expect(m).toContain("revoke select on public.reviews from anon");
    expect(m).not.toMatch(/grant select \([^)]*\buser_id\b/);
  });
});

// ── Q57 follow-ups (coordinator decisions 2026-11-14) ────────────────────────────────────────────────────────────────────────
import { bookingFee, priceWithFees, parseFeeConfig } from "../../src/lib/public/fees";
import { coversPoint, withinMiles, milesBetween, cityPoint, coverageMiles, DEFAULT_RADIUS_MILES } from "../../src/lib/marketplace/coverage";

test.describe("Q57 follow-ups · DMCC fee-inclusive prices", () => {
  test("price + mandatory booking fee, same formula as checkout; free stays free", () => {
    const cfg = parseFeeConfig({ fixed: 1, pct_bps: 0, seller_bps: 500 });
    expect(priceWithFees(20, cfg)).toBe(21);
    expect(bookingFee(0, cfg)).toBe(0); expect(priceWithFees(0, cfg)).toBe(0);
    expect(priceWithFees(10, parseFeeConfig({ fixed: 0.5, pct_bps: 250 }))).toBe(10.75);
    expect(parseFeeConfig(null)).toEqual({ fixed: 0, pct_bps: 0 });
  });
  test("every buy-facing price uses it", () => {
    expect(src("src/components/customer/public-event-client.tsx")).toContain("priceWithFees(t.price, fee) * n * 100");
    expect(src("src/app/events/[slug]/page.tsx")).toContain("price: priceWithFees(x.price, fee)");
    expect(src("src/lib/data/customer.ts")).toContain("priceWithFees(Math.min(");
    expect(src("src/lib/public/directory.ts")).toContain("priceWithFees(min.get(e.id)!, fee)");
    expect(src("src/components/public/directory-view.tsx")).toContain("incl. fees");
    const c = src("src/app/checkout/[event]/client.tsx");
    expect(c).toContain("gbp(priceWithFees(t.price, fee))"); expect(c).toContain("gbp(priceWithFees(r.price, fee))");
  });
});

test.describe("Q57 follow-ups · service coverage radius", () => {
  const london = cityPoint("London")!, manchester = cityPoint("manchester")!;
  test("stated radius, national cover and the default", () => {
    expect(milesBetween(london, manchester)).toBeGreaterThan(150);
    const dj = { lat: 51.5017, lng: -0.1182, details: { service: { coverage: { mode: "local", radius_miles: 40 } } } };
    expect(coversPoint(dj, london)).toBe(true); expect(coversPoint(dj, manchester)).toBe(false);
    expect(coversPoint({ lat: null, lng: null, details: { service: { coverage: { mode: "national" } } } }, manchester)).toBe(true);
    expect(coverageMiles({ lat: 1, lng: 1, details: {} })).toBe(DEFAULT_RADIUS_MILES);
    expect(coversPoint({ lat: null, lng: null, details: {} }, london)).toBe(false);
    expect(withinMiles(dj, london, 10)).toBe(true); expect(withinMiles(dj, manchester, 100)).toBe(false);
  });
  test("organiser and customer marketplaces filter on it", () => {
    expect(src("src/app/organizer/marketplace/page.tsx")).toContain("coversPoint(l, pt)");
    expect(src("src/components/organizer/marketplace-client.tsx")).toContain('params.get("covers") === "1"');
    expect(src("src/lib/actions/provider-search.ts")).toContain("coversPoint(l, pt)");
    expect(src("src/components/customer/add-provider.tsx")).toContain('chip("coversEvent"');
  });
});

test.describe("Q57 follow-ups · pages and routes", () => {
  test("postponed / cancelled public events have a status page; held tickets can't be printed", () => {
    const e = src("src/app/events/[slug]/page.tsx");
    expect(e).toContain('"event_public_status_page"'); expect(e).toContain("This event has been postponed."); expect(e).toContain("This event has been cancelled.");
    expect(src("src/lib/tickets/printable.ts")).toContain("dispute_hold_at) return { ok: false, status: 409, error: HOLD_MESSAGE }");
  });
  test("request page edits the existing RFQ, invites into it and names the creator", () => {
    const p = src("src/app/organizer/marketplace/requests/[id]/page.tsx");
    expect(p).toContain("<RequestEdit"); expect(p).toContain("<RequestInvite");
    expect(p).not.toContain("requests/new?step=1&event=${ev.id}&category=${r.category}`}><PenLine");
    expect(p).toContain("Created the request");
    const a = src("src/lib/actions/request-edit.ts");
    expect(a).toContain("export async function updateRequest"); expect(a).toContain("export async function inviteToRequest");
  });
  test("proposal expiry in London; marketplace event picker excludes finished events", () => {
    expect(src("src/app/proposal/[token]/page.tsx")).toContain('toLocaleDateString("en-CA", { timeZone: "Europe/London" })');
    expect(src("src/app/organizer/marketplace/page.tsx")).toContain('.not("status", "in", "(cancelled,completed,closed,archived)")');
  });
  test("resale legal info: original face value, entry window, ticket/listing refs, merchant identity", () => {
    const r = src("src/app/(customer)/account/tickets/[id]/resale/page.tsx");
    expect(r).toContain("Number(t.face_value ?? tier?.price ?? 0)"); expect(r).toContain("restr.entry_from || restr.entry_to");
    const c = src("src/app/checkout/[event]/client.tsx");
    expect(c).toContain("entryWindow(r.restrictions)"); expect(c).toContain("r.ticket_ref"); expect(c).toContain("r.listing_ref");
    expect(c).toContain("Sold through official resale by ${merchant.name}");
    expect(src("src/app/checkout/[event]/page.tsx")).toContain('"checkout_unlocked_tiers"');
  });
  test("insurance badge follows Gala Dock's review, not self-typed details", () => {
    const x = src("src/components/customer/public-listing-extras.tsx");
    expect(x).toContain("const insured = insuranceVerified;"); expect(x).not.toContain('c.name?.startsWith("Public liability")');
    expect(src("src/components/customer/public-listing.tsx")).toContain("insurance_verified === true");
  });
  test("migrations: face value, status page, tier/media/structure policies, London proposals, trust booking block", () => {
    const m = src("supabase/migrations/202611146702_marketplace_followups.sql");
    for (const s of ["add column if not exists face_value", "create trigger gd_face_value_carry", "function public.event_public_status_page", "not access_code_required",
      "function public.checkout_unlocked_tiers", "l.published and l.paused_at is null", "(now() at time zone 'Europe/London')::date", "'GLD-••••-••' || upper(right(t.code, 4))"]) expect(m).toContain(s);
    const t = src("supabase/migrations/202611146703_marketplace_trust_booking_block.sql");
    expect(t).toContain("raise exception 'provider_unavailable'"); expect(t).toContain("'provider_unavailable'");
  });
});
