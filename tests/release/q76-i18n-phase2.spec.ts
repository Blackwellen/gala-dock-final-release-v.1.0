import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { settlementNet, planReleaseGroups, type DueRelease } from "../../src/lib/payments/releases-core";
import { FEE_CATALOGUE, localFixedFeeMinor, formatMoney, CHECKOUT_CURRENCIES, fromMinorUnits } from "../../src/lib/i18n/money";
import { bookingAdminFee, bookingAdminMinimum, feeMoney, gbpPence } from "../../src/lib/fees";
import { addBusinessDays, zonedToUtc } from "../../src/lib/i18n/tz";
import { optionalPhone, checkPostcode } from "../../src/lib/i18n/countries";
import { parseSchedule, nextRunAt } from "../../src/lib/agent/schedule";
import { londonDateKey, londonMonthKey, londonMonthRange, currentLondonMonth } from "../../src/lib/provider/london-month";
import { cancellationNotice } from "../../src/lib/i18n/rules";

/** Q76 i18n phase 2: money paths (settlement currency, fee catalogue), release days per country, routines/statements per zone. */
const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const M1 = src("supabase/migrations/202611147651_q76_i18n_money_paths.sql");
const M2 = src("supabase/migrations/202611147652_q76_i18n_notification_formats.sql");
const M3 = src("supabase/migrations/202611147653_q76_i18n_listings_resale.sql");

test.describe("Q76 · payout settlement currency (C13)", () => {
  test("same currency: the net is unchanged (gross − refunds − kept fee − disputes)", () => {
    expect(settlementNet({ amount: 10000, refunded: 1000, feeKept: 500, disputed: 0, currency: "gbp", bt: { amount: 10000, net: 9500, currency: "gbp" } })).toEqual({ netMinor: 8500, currency: "GBP" });
    expect(settlementNet({ amount: 10000, refunded: 0, feeKept: 500, disputed: 0, currency: "eur", bt: null })).toEqual({ netMinor: 9500, currency: "EUR" });
    expect(settlementNet({ amount: 1000, refunded: 900, feeKept: 500, disputed: 0, currency: "gbp" }).netMinor).toBe(0);   // never negative
  });
  test("EUR charge settling in GBP: converted at the charge's own rate, floored, capped at what the balance got", () => {
    // €100.00 charge, credited £86.00 (bt.amount 8600), app fee €5, a €10 refund → €85 net → £73.10
    const s = settlementNet({ amount: 10000, refunded: 1000, feeKept: 500, disputed: 0, currency: "eur", bt: { amount: 8600, net: 8170, currency: "gbp" } });
    expect(s).toEqual({ netMinor: 7310, currency: "GBP" });
    // floor, not round: €0.99 at 0.86 = 85.14p → 85p
    expect(settlementNet({ amount: 99, refunded: 0, feeKept: 0, disputed: 0, currency: "eur", bt: { amount: 85, net: 85, currency: "gbp" } }).netMinor).toBe(85);
    // never more than the balance transaction credited
    expect(settlementNet({ amount: 10000, refunded: 0, feeKept: 0, disputed: 0, currency: "usd", bt: { amount: 7700, net: 7000, currency: "gbp" } }).netMinor).toBe(7000);
    expect(settlementNet({ amount: 0, refunded: 0, feeKept: 0, disputed: 0, currency: "eur", bt: { amount: 0, net: 0, currency: "gbp" } })).toEqual({ netMinor: 0, currency: "GBP" });
  });
  test("releases group and pay out in the settlement currency; each item carries it for dec107_release_paid", () => {
    const row = (o: Partial<DueRelease>): DueRelease => ({ id: "r", part: "main", workspace_id: "ws", stripe_account_id: "acct_S", payment_intent: "pi_1", event_id: "ev",
      sale_kind: "ticket_sale", currency: "EUR", source_type: "checkout_order", source_ref: "GD-1", reserve_minor: null, trigger: "t", ...o });
    const nets = new Map([["pi_1", { netMinor: 7310, currency: "GBP" }], ["pi_2", { netMinor: 900 }]]);
    const groups = planReleaseGroups([row({ id: "a" }), row({ id: "b", payment_intent: "pi_2" }), row({ id: "c", part: "reserve", currency: "GBP", reserve_minor: 50, payment_intent: null })], nets, new Map());
    const gbp = groups.find(g => g.currency === "GBP")!, eur = groups.find(g => g.currency === "EUR")!;
    expect(gbp.items.map(i => [i.id, i.currency])).toEqual([["a", "GBP"], ["c", "GBP"]]);
    expect(gbp.payoutMinor).toBe(7360);
    expect(eur.items).toEqual([{ id: "b", amount_minor: 900, currency: "EUR" }]);
  });
  test("worker and SQL: balance transaction expanded, settlement currency recorded on the release and its reserve part", () => {
    expect(src("src/lib/payments/stripe-client.ts")).toContain("expand[]=latest_charge.balance_transaction");
    expect(src("src/lib/commerce/releases.ts")).toContain("settlementNet(");
    expect(src("src/lib/commerce/releases.ts")).not.toMatch(/"£"|\/ 100\)\.toFixed/);
    expect(M1).toContain("settlement_currency = coalesce(public.dec107_settlement_currency(it->>'currency'), settlement_currency, currency)");
    expect(M1).toMatch(/pr\.sale_kind, coalesce\(public\.dec107_settlement_currency\(it->>'currency'\), pr\.currency\), pr\.livemode/);
  });
});

test.describe("Q76 · fee catalogue per currency (O3)", () => {
  test("GBP is unchanged; other currencies use local price points", () => {
    expect(localFixedFeeMinor("ticket_fixed", 100, "GBP")).toBe(100);
    expect(localFixedFeeMinor("ticket_fixed", 49, "GBP")).toBe(49);
    expect(localFixedFeeMinor("ticket_fixed", 100, "EUR")).toBe(120);
    expect(localFixedFeeMinor("booking_admin_min", 100, "SEK")).toBe(1500);
    expect(localFixedFeeMinor("ticket_fixed", 150, "EUR")).toBe(170);   // changed GBP basis → rate × step rounding
    expect(localFixedFeeMinor("ticket_fixed", 100, "XXX")).toBe(100);
    expect(localFixedFeeMinor("ticket_fixed", 0, "EUR")).toBe(0);
  });
  test("every transactional currency has a catalogue row, and the TS mirror equals the migration seed", () => {
    for (const c of CHECKOUT_CURRENCIES) expect(FEE_CATALOGUE[c], c).toBeTruthy();
    const rows = [...M1.matchAll(/\('([A-Z]{3})',\s*([\d.]+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),/g)];
    expect(rows.length).toBe(Object.keys(FEE_CATALOGUE).length);
    for (const [, cur, rate, step, tb, tf, bb, bm] of rows) {
      expect(FEE_CATALOGUE[cur!], cur).toEqual({ rate: Number(rate), step: Number(step), basis: Number(tb), ticket_fixed: Number(tf), booking_admin_min: Number(bm) });
      expect(Number(bb)).toBe(Number(tb));
    }
  });
  test("booking admin fee: 2.5% with the local minimum; GBP copy unchanged", () => {
    expect(bookingAdminFee(200)).toBe(5); expect(bookingAdminFee(10)).toBe(1); expect(bookingAdminFee(0)).toBe(0);
    expect(bookingAdminFee(10, "EUR")).toBe(1.2); expect(bookingAdminFee(1000, "EUR")).toBe(25);
    expect(bookingAdminMinimum("CHF")).toBe(1.1);
    expect(gbpPence(1)).toBe("£1"); expect(gbpPence(2.5)).toBe("£2.50");
    expect(feeMoney(1.2, "EUR")).toBe("€1.20"); expect(feeMoney(15, "SEK").replace(/ /g, " ")).toBe("SEK 15");   // Intl uses a no-break space; SQL a plain space
  });
  test("checkout_quote and create_payment_order use the catalogue in the charge currency", () => {
    expect(M1).toContain("fixed_minor := public.fee_fixed_minor_in('ticket_fixed'");
    expect(M1).toContain("public.booking_admin_fee_minor(round(amt * 100)::bigint, public.booking_charge_currency(b.id))");
  });
});

test.describe("Q76 · bookings in the seller's currency, resale in the order currency (O2, C15)", () => {
  test("payment orders and new quotes take booking_charge_currency (existing order → quote → listing → seller → event)", () => {
    expect(M1).toContain("public.booking_charge_currency(b.id), fee,");
    expect(M1).not.toMatch(/coalesce\(e\.currency, 'GBP'\), fee,/);
    expect(M1).toContain("if new.build_item_id is not null then c := public.booking_charge_currency(new.build_item_id); end if;");
    expect(M1).toMatch(/payment_orders po\s+where po\.build_item_id = p_item[\s\S]*provider_quotes q[\s\S]*listing_charge_currency\(b\.listing_id\)[\s\S]*event_checkout_currency\(b\.event_id\)/);
  });
  test("resale guards accept the event's checkout currency, not only GBP", () => {
    expect(M1).not.toMatch(/upper\(o\.currency\)\s*(<>|=)\s*'GBP'/);
    expect((M1.match(/event_checkout_currency\(o\.event_id\)/g) ?? []).length).toBe(3);
  });
  test("customer booking checkout shows the charge currency and the buyer-country cancellation notice", () => {
    const page = src("src/app/(customer)/account/events/[id]/book/page.tsx"), flow = src("src/components/customer/booking-flow.tsx");
    expect(page).toContain('rpc("booking_charge_currency"');
    expect(page).toContain('cancellationNotice({ buyerCountry:');
    expect(flow).toContain("data.cancellation.text");
    expect(flow).not.toMatch(/`£\$\{/);
    expect(cancellationNotice({ buyerCountry: "FR", kind: "booking" }).text).toContain("art. 16(l)");
    expect(cancellationNotice({ buyerCountry: "GB", kind: "booking" }).text).toContain("reg. 28(1)(b)");
  });
});

test.describe("Q76 · release dates per country (T07)", () => {
  test("SQL: dec107_add_business_days_in(from, days, tz, country) is used by the sweep and the sales-open rule", () => {
    expect(M1).toContain("create or replace function public.dec107_add_business_days_in(p_from timestamptz, p_days integer, p_tz text, p_country text)");
    expect(M1).toContain("c = 'GB' and exists (select 1 from public.uk_bank_holidays");
    expect((M1.match(/public\.dec107_ticket_release_at\(e\.id\)/g) ?? []).length).toBe(2);
  });
  test("TS mirror: weekdays in the event zone; UK holidays only when told (same answers as the SQL exercise)", () => {
    expect(addBusinessDays("2026-12-24T18:00:00Z", 2, { tz: "Europe/Paris" }).toISOString()).toBe("2026-12-28T18:00:00.000Z");
    expect(addBusinessDays("2026-12-24T18:00:00Z", 2, { tz: "Europe/London", holidays: ["2026-12-25", "2026-12-28"] }).toISOString()).toBe("2026-12-30T18:00:00.000Z");
    expect(addBusinessDays("2026-11-21T04:30:00Z", 1, { tz: "America/New_York" }).toISOString()).toBe("2026-11-24T04:30:00.000Z");
    // across a DST change (Sydney goes to daylight time on 4 Oct 2026)
    expect(addBusinessDays("2026-10-02T13:00:00Z", 1, { tz: "Australia/Sydney" }).toISOString()).toBe("2026-10-04T13:00:00.000Z");
  });
});

test.describe("Q76 · money in SQL-composed notifications (C11, T09)", () => {
  test("fmt_money mirrors formatMoney(…, { decimals: true }) for every expected string in the SQL exercise", () => {
    const cases: [number, string, string][] = [[1234.5, "GBP", "£1,234.50"], [1234.5, "EUR", "€1,234.50"], [90, "USD", "US$90.00"], [12, "CAD", "CA$12.00"], [12, "AUD", "A$12.00"],
      [12, "NZD", "NZ$12.00"], [12, "HKD", "HK$12.00"], [1234.5, "CHF", "CHF 1,234.50"], [99.999, "SEK", "SEK 100.00"], [5, "PLN", "PLN 5.00"], [1234.5, "JPY", "JP¥1,235"],
      [-1234.5, "GBP", "-£1,234.50"], [1234567.891, "EUR", "€1,234,567.89"]];
    const ex = src("scripts/db/exercises/202611147652_q76_i18n_notification_formats.sql");
    for (const [n, c, s] of cases) {
      expect(formatMoney(n, c, { decimals: true }).replace(/ /g, " "), `${n} ${c}`).toBe(s);   // Intl: no-break space after a code
      expect(ex).toContain(`'${s}'`);
    }
    expect(formatMoney(fromMinorUnits(123450, "EUR"), "EUR", { decimals: true })).toBe("€1,234.50");
  });
  test("the transactional bodies no longer print £ (GBP-by-rule bodies are listed as unchanged)", () => {
    const bodies = M2.split("═══ 3.")[1]!;
    expect(bodies).not.toContain("£");
    for (const f of ["payment_order_succeeded", "payment_order_transferred", "record_invoice_payment", "dispute_offer_settlement", "dec107_dispute_close", "dec107_default_rule_notice",
      "provider_offer_standby", "activate_standby", "accept_emergency_candidate", "provider_emergency_respond", "cancel_event_with_refunds", "admin_review_force_majeure"]) expect(bodies, f).toContain(`FUNCTION public.${f}(`);
    for (const f of ["trg_shift_notify", "request_crew_availability", "request_leave", "decide_leave", "marketplace_sweep", "create_emergency_request", "team_conflicts"]) {
      const body = bodies.split(`FUNCTION public.${f}(`)[1]!.split("$function$;")[0]!;
      expect(body, f).not.toContain("'Europe/London'");
      expect(body, f).toContain("public.fmt_event_time(");
    }
    expect(M1.split("═══ Replaced function bodies")[1]).not.toContain("'Deposit of £'");
  });
});

test.describe("Q76 · routines and statements in the workspace zone (T10, T11)", () => {
  test("a daily 09:00 routine runs at 09:00 in the workspace's zone; London unchanged", () => {
    const daily = parseSchedule("Daily 09:00")!;
    const after = new Date("2026-07-01T00:00:00Z");
    expect(nextRunAt(daily, after)!.at.toISOString()).toBe("2026-07-01T08:00:00.000Z");                         // London BST
    expect(nextRunAt(daily, after, { tz: "Europe/Paris" })!.at.toISOString()).toBe("2026-07-01T07:00:00.000Z");  // CEST
    expect(nextRunAt(daily, after, { tz: "America/New_York" })!.at.toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(nextRunAt(daily, new Date("2026-12-01T00:00:00Z"), { tz: "Australia/Sydney" })!.at.toISOString()).toBe("2026-12-01T22:00:00.000Z"); // AEDT
    expect(nextRunAt(daily, after, { tz: "Not/AZone" })!.at.toISOString()).toBe("2026-07-01T08:00:00.000Z");      // invalid → London
    // day-after-event at a set local time
    const dayAfter = parseSchedule("Day after event at 10:00")!;
    expect(nextRunAt(dayAfter, after, { tz: "Europe/Paris", occurrences: [{ id: "e", starts_at: "2026-07-03T18:00:00Z", ends_at: "2026-07-03T21:00:00Z" }] })!.at.toISOString()).toBe("2026-07-04T08:00:00.000Z");
  });
  test("provider statement months follow the workspace zone (London default unchanged)", () => {
    expect(londonDateKey("2026-06-30T23:30:00Z")).toBe("2026-07-01");                    // BST
    expect(londonDateKey("2026-06-30T23:30:00Z", "America/New_York")).toBe("2026-06-30");
    expect(londonMonthKey("2026-06-30T15:00:00Z", "Australia/Sydney")).toBe("2026-07");
    expect(londonMonthRange("2026-07")).toEqual([Date.parse("2026-06-30T23:00:00Z"), Date.parse("2026-07-31T23:00:00Z")]);
    expect(londonMonthRange("2026-07", "Europe/Paris")).toEqual([zonedToUtc(2026, 7, 1, 0, 0, "Europe/Paris").getTime(), Date.parse("2026-07-31T22:00:00Z")]);
    expect(currentLondonMonth(Date.parse("2026-12-31T23:30:00Z"), "Asia/Tokyo")).toBe("2027-01");
    expect(londonDateKey("not a date")).toBe("not a date");
  });
});

test.describe("Q76 · forms: phones, postcodes, tax options, listings", () => {
  test("optional phones: blank stays blank, others become E.164 in the workspace's country", () => {
    expect(optionalPhone("", "FR")).toEqual({ ok: true, e164: "" });
    expect(optionalPhone("06 12 34 56 78", "FR")).toEqual({ ok: true, e164: "+33612345678" });
    expect(optionalPhone("07700 900123", "GB")).toEqual({ ok: true, e164: "+447700900123" });
    expect(optionalPhone("(212) 555-0100", "US")).toEqual({ ok: true, e164: "+12125550100" });
    expect(optionalPhone("12", "GB").ok).toBe(false);
  });
  test("tax-details and onboarding validate postcodes for the address country", () => {
    expect(checkPostcode("d02 x285", "IE")).toEqual({ ok: true, value: "D02 X285" });
    expect(checkPostcode("75001", "FR").ok).toBe(true);
    expect(checkPostcode("ABC", "DE").ok).toBe(false);
    expect(checkPostcode("", "HK").ok).toBe(true);
    expect(src("src/lib/actions/tax-details.ts")).toContain("checkPostcode(input.postal_code, input.country)");
    expect(src("src/lib/onboarding-schema.ts")).toContain("checkPostcode(postcode, context.country)");
    expect(src("src/components/payments/tax-details-form.tsx")).toContain("prof?.postcodeLabel");
  });
  test("create-event tax options come from the workspace country (ref_countries.tax_options)", () => {
    expect(src("src/app/organizer/events/new/page.tsx")).toContain('countryBy(loc0.country ?? "GB")?.tax');
    expect(src("src/components/organizer/create-event.tsx")).toContain("data.taxOptions");
  });
  test("provider_save_listing writes country / timezone / currency; calendars use the listing zone", () => {
    expect(M3).toContain("update public.listings x set country = coalesce(cty, x.country), timezone = coalesce(tz, x.timezone), currency = coalesce(cur, x.currency)");
    expect(M3).toContain("v_tz := public.listing_timezone(l.id);");
    const avail = M3.split("FUNCTION public.public_listing_availability(")[1]!.split("$function$;")[0]!;
    expect(avail).not.toContain("'Europe/London'::");
    expect((avail.match(/at time zone v_tz/g) ?? []).length).toBe(5);
  });
  test("resale policies: sourced jurisdictions only, at face value, flagged for review", () => {
    const seeded = [...M3.matchAll(/\('([A-Z]{2})', 1, 'published', now\(\), 100, 'face_value'/g)].map(m => m[1]);
    expect(seeded.sort()).toEqual(["BE", "FR", "IE", "IT"]);
    expect((M3.match(/\(verify\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(M3.match(/'needs_review'\)/g)?.length).toBe(4);
  });
  test("no transactional £ left in the Q76 surfaces", () => {
    for (const f of ["src/components/shared/ticket-setup.tsx", "src/components/organizer/ticket-pro/step-tiers.tsx", "src/components/organizer/ticket-pro/step-access.tsx",
      "src/components/organizer/ticket-pro/step-review.tsx", "src/components/customer/public-listing.tsx", "src/components/venue/rate-cards.tsx", "src/components/venue/menus-client.tsx",
      "src/components/marketplace/dispute-client.tsx", "src/components/marketplace/emergency-client.tsx", "src/components/marketplace/lifecycle-client.tsx",
      "src/app/provider/venues/new/steps.tsx", "src/app/provider/bookings/new/steps.tsx", "src/app/provider/services/new/steps.tsx", "src/app/provider/packages/new/steps.tsx"]) {
      const code = src(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(code, f).not.toContain("£");
    }
  });
});
