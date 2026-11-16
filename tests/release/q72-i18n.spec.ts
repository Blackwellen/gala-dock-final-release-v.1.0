import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { zonedToUtc, wallToUtcIso, utcToWallString, todayIn, tzOffsetMinutes, tzAbbrev, addDaysYmd, isValidTimeZone, safeTz, defaultTzForCountry, startOfDayIn, addBusinessDays } from "../../src/lib/i18n/tz";
import { wallToIso, isoToWall } from "../../src/lib/events/wall-time";
import { formatMoney, formatMoneyExplicit, currencySymbol, toMinorUnits, fromMinorUnits, minorDigits, totalsByCurrency, formatTotals, sellerCurrency, isCheckoutCurrency, CHECKOUT_CURRENCIES } from "../../src/lib/i18n/money";
import { COUNTRY_PROFILES, checkPostcode, normalisePhone, formatAddress, distanceUnit, milesToUnit, unitToMiles, formatDistance, effectiveResaleCapPct, licencePackCoverage, alcoholRule, consumerPriceDisplay, isEu, cookieConsentModel } from "../../src/lib/i18n/countries";
import { cancellationNotice, taxDisplayNote, reverseChargeWording, alcoholNotice, resaleCapNotice } from "../../src/lib/i18n/rules";
import { MESSAGES, t, resolveLocale, languageName } from "../../src/lib/i18n/messages";
import { workspaceLocale } from "../../src/lib/i18n/workspace";
import { localeDirective } from "../../src/lib/agent/locale";
import { CURRENCIES, COUNTRIES, TIMEZONES } from "../../src/lib/master-data";
import { CONNECT_SUPPORTED_COUNTRIES } from "../../src/lib/payments/connect-countries";

/** Q72 internationalisation: pure helpers across zones (DST both hemispheres), currencies and countries + source checks. */
const src = (f: string) => readFileSync(f, "utf8");

test.describe("Q72 · time zones", () => {
  test("London stays the default and matches the pre-Q72 behaviour (GMT, BST, both DST edges)", () => {
    expect(wallToIso("2026-07-04T19:00")).toBe("2026-07-04T18:00:00.000Z");            // BST
    expect(wallToIso("2026-12-01T09:30")).toBe("2026-12-01T09:30:00.000Z");            // GMT
    expect(wallToIso("2026-03-29T00:30")).toBe("2026-03-29T00:30:00.000Z");            // before the jump
    expect(wallToIso("2026-03-29T01:30")).toBe("2026-03-29T01:30:00.000Z");            // in the gap → forward (02:30 BST)
    expect(isoToWall("2026-03-29T01:30:00.000Z")).toBe("2026-03-29T02:30");
    expect(wallToIso("2026-03-29T03:00")).toBe("2026-03-29T02:00:00.000Z");
    expect(wallToIso("2026-10-25T01:30")).toBe("2026-10-25T00:30:00.000Z");            // repeated hour → first (BST) occurrence
    expect(isoToWall("2026-07-04T18:00:00.000Z")).toBe("2026-07-04T19:00");
    expect(wallToIso("2026-07-04T19:00:00+01:00")).toBe("2026-07-04T18:00:00.000Z");   // instants pass through
    expect(wallToIso("nope")).toBeNull(); expect(isoToWall(null)).toBe("");
  });

  test("an event's own zone: Paris, New York, Sydney (southern DST), Tokyo (no DST), Auckland", () => {
    expect(wallToIso("2026-07-04T19:00", "Europe/Paris")).toBe("2026-07-04T17:00:00.000Z");
    expect(wallToIso("2026-01-15T19:00", "Europe/Paris")).toBe("2026-01-15T18:00:00.000Z");
    expect(wallToIso("2026-07-04T19:00", "America/New_York")).toBe("2026-07-04T23:00:00.000Z");
    expect(wallToIso("2026-01-15T19:00", "America/New_York")).toBe("2026-01-16T00:00:00.000Z");
    expect(wallToIso("2026-01-15T19:00", "Australia/Sydney")).toBe("2026-01-15T08:00:00.000Z");   // AEDT +11
    expect(wallToIso("2026-07-04T19:00", "Australia/Sydney")).toBe("2026-07-04T09:00:00.000Z");   // AEST +10
    expect(wallToIso("2026-07-04T19:00", "Asia/Tokyo")).toBe("2026-07-04T10:00:00.000Z");
    expect(wallToIso("2026-12-31T23:30", "Pacific/Auckland")).toBe("2026-12-31T10:30:00.000Z");
    for (const tz of ["Europe/London", "Europe/Paris", "America/New_York", "Australia/Sydney", "Asia/Tokyo", "America/Los_Angeles"])
      for (const w of ["2026-03-08T12:00", "2026-03-29T12:00", "2026-07-04T19:00", "2026-10-04T10:00", "2026-11-01T12:00", "2026-12-24T18:30"])
        expect(isoToWall(wallToIso(w, tz), tz), `${tz} ${w}`).toBe(w);   // round trip outside gaps
  });

  test("DST gaps resolve forward and overlaps to the first occurrence in every hemisphere", () => {
    // New York spring forward 2026-03-08 02:00 → 03:00: 02:30 doesn't exist → 03:30 EDT.
    expect(utcToWallString(wallToUtcIso("2026-03-08T02:30", "America/New_York"), "America/New_York")).toBe("2026-03-08T03:30");
    // New York fall back 2026-11-01 02:00 → 01:00: 01:30 twice → first (EDT, UTC−4).
    expect(wallToUtcIso("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
    // Paris spring forward 2026-03-29 02:00 → 03:00.
    expect(utcToWallString(wallToUtcIso("2026-03-29T02:30", "Europe/Paris"), "Europe/Paris")).toBe("2026-03-29T03:30");
    // Sydney: DST ends 2026-04-05 03:00 → 02:00 (02:30 twice → AEDT first); starts 2026-10-04 02:00 → 03:00.
    expect(wallToUtcIso("2026-04-05T02:30", "Australia/Sydney")).toBe("2026-04-04T15:30:00.000Z");
    expect(utcToWallString(wallToUtcIso("2026-10-04T02:30", "Australia/Sydney"), "Australia/Sydney")).toBe("2026-10-04T03:30");
    expect(zonedToUtc(2026, 6, 1, 0, 0, "Mars/Olympus").toISOString()).toBe(zonedToUtc(2026, 6, 1, 0, 0, "Europe/London").toISOString());   // invalid → London
  });

  test("today is the calendar date in the zone (the invoice / respond-by UTC bug)", () => {
    const t0 = Date.parse("2026-07-04T23:30:00Z");                          // 00:30 BST on 5 July
    expect(new Date(t0).toISOString().slice(0, 10)).toBe("2026-07-04");    // what the old code used
    expect(todayIn("Europe/London", t0)).toBe("2026-07-05");
    expect(todayIn("America/New_York", t0)).toBe("2026-07-04");
    expect(todayIn("Asia/Tokyo", t0)).toBe("2026-07-05");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01"); expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(startOfDayIn("2026-07-05", "Europe/London").toISOString()).toBe("2026-07-04T23:00:00.000Z");
  });

  test("release dates: business days in the event's zone; UK bank holidays only for UK sellers", () => {
    // Event ends Fri 2026-12-18 23:00 London; +5 business days: UK skips Christmas Day + Boxing Day (substitute 28th).
    const uk = addBusinessDays("2026-12-18T23:00:00Z", 5, { tz: "Europe/London", holidays: ["2026-12-25", "2026-12-28"] });
    expect(uk.toISOString()).toBe("2026-12-29T23:00:00.000Z");
    expect(addBusinessDays("2026-12-18T23:00:00Z", 5, { tz: "Europe/London" }).toISOString()).toBe("2026-12-25T23:00:00.000Z");
    // Sydney: Fri 23:00 UTC is already Saturday locally, so the weekday count follows the event's calendar.
    expect(addBusinessDays("2026-12-18T23:00:00Z", 1, { tz: "Australia/Sydney" }).toISOString()).toBe("2026-12-20T23:00:00.000Z");
    expect(addBusinessDays("2026-12-18T23:00:00Z", 0).toISOString()).toBe("2026-12-18T23:00:00.000Z");
  });

  test("offsets, zone names and defaults", () => {
    expect(tzOffsetMinutes(new Date("2026-07-04T12:00:00Z"), "Europe/London")).toBe(60);
    expect(tzOffsetMinutes(new Date("2026-01-04T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(tzOffsetMinutes(new Date("2026-01-04T12:00:00Z"), "Australia/Adelaide")).toBe(630);
    expect(tzAbbrev("2026-07-04T12:00:00Z", "Europe/London")).toBe("BST");
    expect(tzAbbrev("2026-01-04T12:00:00Z", "Europe/London")).toBe("GMT");
    expect(tzAbbrev("2026-07-04T12:00:00Z", "Europe/Paris")).toBe("CEST");
    expect(tzAbbrev("2026-07-04T12:00:00Z", "America/New_York")).toBe("EDT");
    expect(isValidTimeZone("Europe/Zurich")).toBe(true); expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(safeTz(null)).toBe("Europe/London"); expect(defaultTzForCountry("JP")).toBe("Asia/Tokyo"); expect(defaultTzForCountry("??")).toBe("Europe/London");
    for (const z of TIMEZONES) expect(isValidTimeZone(z.tz), z.tz).toBe(true);
  });
});

test.describe("Q72 · money", () => {
  test("Intl formatting per currency; unambiguous symbols in en-GB", () => {
    expect(formatMoney(1234.5, "GBP")).toBe("£1,235");
    expect(formatMoney(1234.5, "GBP", { decimals: true })).toBe("£1,234.50");
    expect(formatMoney(25, "EUR", { decimals: true })).toBe("€25.00");
    expect(formatMoney(25, "USD", { decimals: true })).toBe("US$25.00");
    expect(formatMoney(25, "CAD")).toBe("CA$25");
    expect(formatMoney(1200, "JPY", { decimals: true })).toBe("JP¥1,200");    // zero-decimal
    expect(formatMoney(25, "CHF", { decimals: true })).toMatch(/^CHF\s?25\.00$/);
    expect(formatMoney(25, "XYZ")).toMatch(/XYZ/);                            // unknown code never throws
    expect(formatMoney(12500, "GBP", { compact: true })).toBe("£12.5K");
    expect(formatMoney(null, null)).toBe("£0");
    expect(formatMoneyExplicit(25, "EUR")).toBe("€25.00 EUR");
    expect(formatMoneyExplicit(25, "GBP")).toBe("£25.00");
    expect(currencySymbol("EUR")).toBe("€"); expect(currencySymbol("USD")).toBe("US$"); expect(currencySymbol("SEK")).toBe("SEK");
  });

  test("minor units: two-decimal, zero-decimal, no float drift", () => {
    expect(toMinorUnits(12.5, "GBP")).toBe(1250); expect(toMinorUnits("19.99", "EUR")).toBe(1999); expect(toMinorUnits(0.1 + 0.2, "USD")).toBe(30);
    expect(toMinorUnits(1200, "JPY")).toBe(1200); expect(minorDigits("JPY")).toBe(0); expect(minorDigits("GBP")).toBe(2);
    expect(fromMinorUnits(1250, "GBP")).toBe(12.5); expect(fromMinorUnits(1200, "JPY")).toBe(1200);
  });

  test("checkout currencies = the catalog's transactional set; JPY/HUF/AED excluded", () => {
    expect([...CHECKOUT_CURRENCIES].sort()).toEqual(CURRENCIES.filter(c => c.transactional).map(c => c.code).sort());
    for (const c of CHECKOUT_CURRENCIES) expect(minorDigits(c), c).toBe(2);
    for (const c of ["JPY", "HUF", "AED", "ZAR", ""]) expect(isCheckoutCurrency(c), c).toBe(false);
    expect(isCheckoutCurrency("eur")).toBe(true);
  });

  test("seller currency follows the Connect default currency, then the workspace, then the country", () => {
    expect(sellerCurrency({ connectDefault: "eur", workspaceCurrency: "GBP" })).toBe("EUR");
    expect(sellerCurrency({ connectDefault: "jpy", workspaceCurrency: "USD" })).toBe("USD");   // not checkout-capable yet
    expect(sellerCurrency({ countryCurrency: "SEK" })).toBe("SEK");
    expect(sellerCurrency({})).toBe("GBP");
  });

  test("reporting never adds across currencies", () => {
    const rows = [{ a: 10, c: "GBP" }, { a: 5.5, c: "EUR" }, { a: 2, c: null }, { a: 0.1, c: "eur" }, { a: 0.2, c: "EUR" }, { a: "x", c: "USD" }];
    const tot = totalsByCurrency(rows, r => r.a, r => r.c);
    expect(tot).toEqual([{ currency: "GBP", total: 12, count: 2 }, { currency: "EUR", total: 5.8, count: 3 }]);
    expect(formatTotals(tot)).toBe("£12 · €6");
    expect(formatTotals([])).toBe("£0");
  });
});

test.describe("Q72 · countries, addresses, phones, units", () => {
  test("every Connect seller country and onboarding country has a profile; master data covers them", () => {
    for (const c of Object.keys(CONNECT_SUPPORTED_COUNTRIES)) {
      expect(COUNTRY_PROFILES[c], c).toBeTruthy();
      expect(COUNTRIES.find(x => x.code === c)?.business, c).toBe(true);
      expect(TIMEZONES.some(z => z.country === c), c).toBe(true);
      expect(CURRENCIES.some(x => x.code === COUNTRY_PROFILES[c]!.currency), c).toBe(true);
    }
    for (const c of COUNTRIES.filter(x => x.business)) expect(COUNTRY_PROFILES[c.code], c.code).toBeTruthy();
    expect(COUNTRY_PROFILES.BG!.currency).toBe("EUR");   // Bulgaria joined the euro on 1 Jan 2026
    expect(isEu("IE") && isEu("de") && !isEu("GB") && !isEu("CH") && !isEu("NO")).toBe(true);
  });

  test("postcodes per country (not UK-only)", () => {
    expect(checkPostcode("sw1a 1aa", "GB")).toEqual({ ok: true, value: "SW1A 1AA" });
    expect(checkPostcode("75001", "GB").ok).toBe(false);
    expect(checkPostcode("75001", "FR").ok).toBe(true);
    expect(checkPostcode("10115", "DE").ok).toBe(true);
    expect(checkPostcode("1012 AB", "NL").ok).toBe(true);
    expect(checkPostcode("D02 X285", "IE").ok).toBe(true);
    expect(checkPostcode("90210-1234", "US").ok).toBe(true);
    expect(checkPostcode("K1A 0B1", "CA").ok).toBe(true);
    expect(checkPostcode("00-950", "PL").ok).toBe(true);
    expect(checkPostcode("1000-001", "PT").ok).toBe(true);
    expect(checkPostcode("100-0001", "JP").ok).toBe(true);
    expect(checkPostcode("", "HK").ok).toBe(true);        // no postcodes
    expect(checkPostcode("", "GB").ok).toBe(false);
    expect(checkPostcode("AB-12", "ZZ").ok).toBe(true);   // unknown country: structural only
  });

  test("phones normalise to E.164", () => {
    expect(normalisePhone("07700 900123", "GB")).toEqual({ ok: true, e164: "+447700900123" });
    expect(normalisePhone("+44 (0)7700 900123", "US")).toEqual({ ok: true, e164: "+447700900123" });
    expect(normalisePhone("0044 7700 900123", "GB")).toEqual({ ok: true, e164: "+447700900123" });
    expect(normalisePhone("(212) 555-0123", "US")).toEqual({ ok: true, e164: "+12125550123" });
    expect(normalisePhone("01 23 45 67 89", "FR")).toEqual({ ok: true, e164: "+33123456789" });
    expect(normalisePhone("06 1234 5678", "IT")).toEqual({ ok: true, e164: "+390612345678" });   // Italy keeps the 0
    expect(normalisePhone("+81 3-1234-5678", "GB")).toEqual({ ok: true, e164: "+81312345678" });
    expect(normalisePhone("12", "GB").ok).toBe(false);
    expect(normalisePhone("call me", "GB").ok).toBe(false);
    expect(normalisePhone("7700900123", "ZZ").ok).toBe(false);   // national number, unknown country
  });

  test("address order per country", () => {
    expect(formatAddress({ line1: "1 High St", city: "London", postcode: "SW1A 1AA", country: "GB" })).toBe("1 High St, London SW1A 1AA, United Kingdom");
    expect(formatAddress({ line1: "1 Rue de Rivoli", city: "Paris", postcode: "75001", country: "FR" })).toBe("1 Rue de Rivoli, 75001 Paris, France");
    expect(formatAddress({ line1: "1 Main St", city: "Austin", region: "TX", postcode: "78701", country: "US" })).toBe("1 Main St, Austin, TX 78701, United States");
  });

  test("coverage radius: miles in the UK/US, km elsewhere; stored in miles", () => {
    expect(distanceUnit("GB")).toBe("mi"); expect(distanceUnit("US")).toBe("mi"); expect(distanceUnit("DE")).toBe("km"); expect(distanceUnit(null)).toBe("km");
    expect(milesToUnit(50, "km")).toBe(80); expect(unitToMiles(80, "km")).toBe(49.7); expect(unitToMiles(25, "mi")).toBe(25);
    expect(formatDistance(1, "mi")).toBe("1 mile"); expect(formatDistance(50, "km")).toBe("80 km");
  });
});

test.describe("Q72 · rules per buyer / event country", () => {
  test("cancellation notice by buyer country: tickets exempt from the 14-day right, said plainly", () => {
    const uk = cancellationNotice({ buyerCountry: "GB", kind: "ticket" }), fr = cancellationNotice({ buyerCountry: "FR", kind: "ticket" }), us = cancellationNotice({ buyerCountry: "US", kind: "ticket" });
    expect(uk.text).toMatch(/reg\. 28\(1\)\(b\)/); expect(fr.text).toMatch(/art\. 16\(l\)/); expect(us.text).not.toMatch(/14-day/);
    expect(cancellationNotice({ buyerCountry: "NO", kind: "booking" }).text).toMatch(/art\. 16\(l\)/);
    expect(cancellationNotice({ buyerCountry: null, kind: "ticket" }).regime).toBe("uk_ccr");
  });

  test("tax display and reverse-charge wording", () => {
    expect(consumerPriceDisplay("FR")).toBe("tax_inclusive"); expect(consumerPriceDisplay("US")).toBe("tax_exclusive");
    expect(taxDisplayNote("DE")).toMatch(/include VAT/); expect(taxDisplayNote("US")).toMatch(/exclude sales tax/);
    expect(reverseChargeWording("DE")).toMatch(/Article 196/); expect(reverseChargeWording("GB")).toMatch(/HMRC/); expect(reverseChargeWording("US")).toMatch(/No VAT charged/);
  });

  test("licence packs, alcohol and resale caps: GB covered, others flagged", () => {
    expect(licencePackCoverage("GB", ["GB"]).status).toBe("complete");
    expect(licencePackCoverage("FR", ["GB"])).toMatchObject({ status: "none" }); expect(licencePackCoverage("FR", ["GB"]).note).toMatch(/no licensing rule pack for France/);
    expect(alcoholRule("US").min).toBe(21); expect(alcoholRule("GB").covered).toBe(true); expect(alcoholRule("XX").covered).toBe(false);
    expect(alcoholNotice("DE").covered).toBe(false); expect(alcoholNotice("DE").text).toMatch(/16\+/);
    expect(effectiveResaleCapPct(100, "IE")).toBe(100); expect(effectiveResaleCapPct(150, "IE")).toBe(100); expect(effectiveResaleCapPct(150, "AU")).toBe(110);
    expect(effectiveResaleCapPct(150, "DE")).toBe(150); expect(effectiveResaleCapPct(null, "GB")).toBe(100);
    expect(resaleCapNotice(150, "IT").pct).toBe(100);
    expect(cookieConsentModel("FR").model).toBe("opt_in"); expect(cookieConsentModel("US").model).toBe("opt_in");
  });
});

test.describe("Q72 · language readiness and agent", () => {
  test("message catalogue: every locale has every key; t() fills placeholders", () => {
    const keys = Object.keys(MESSAGES["en-GB"]!).sort();
    for (const [loc, m] of Object.entries(MESSAGES)) expect(Object.keys(m).sort(), loc).toEqual(keys);
    expect(t("checkout.currency_short", { currency: "EUR" })).toBe("All prices in EUR");
    expect(t("checkout.currency_short")).toBe("All prices in {currency}");
    expect(resolveLocale("en")).toBe("en-GB"); expect(resolveLocale("fr")).toBe("en-GB"); expect(resolveLocale(null)).toBe("en-GB");
    expect(languageName("fr")).toBe("French"); expect(languageName("xx")).toBe("English");
  });

  test("Gala Agent: answers in the user's language and the event's zone", () => {
    const d = localeDirective({ language: "de", timezone: "Europe/Berlin", currency: "eur" }, new Date("2026-07-04T23:30:00Z"));
    expect(d).toMatch(/Today is 2026-07-05 in Europe\/Berlin \(CEST\)/); expect(d).toMatch(/Reply in German/); expect(d).toMatch(/in EUR/);
    expect(localeDirective({}, new Date("2026-01-01T12:00:00Z"))).toMatch(/Europe\/London \(GMT\)[\s\S]*British English/);
  });

  test("workspace locale from stored settings", () => {
    expect(workspaceLocale({ organisation: { country: "France" } })).toEqual({ country: "FR", currency: "EUR", timezone: "Europe/Paris", distance: "km" });
    expect(workspaceLocale({ business: { country: "United Kingdom" }, currency: "GBP" })).toEqual({ country: "GB", currency: "GBP", timezone: "Europe/London", distance: "mi" });
    expect(workspaceLocale({ country: "US", timezone: "America/Chicago" })).toMatchObject({ currency: "USD", timezone: "America/Chicago" });
    expect(workspaceLocale(null)).toEqual({ country: null, currency: "GBP", timezone: "Europe/London", distance: "mi" });
    expect(workspaceLocale({ currency: "GBP" }, { connectDefaultCurrency: "sek" }).currency).toBe("SEK");
  });
});

test.describe("Q72 · wiring (source checks)", () => {
  test("checkout charges and records the event currency; no hard-coded GBP", () => {
    const r = src("src/app/api/checkout/session/route.ts");
    expect(r).not.toMatch(/currency: "GBP"/); expect(r).toMatch(/isCheckoutCurrency\(currency\)/); expect(r).toMatch(/toMinorUnits\(n, currency\)/);
    const mig = src("supabase/migrations/202611147251_q72_internationalisation.sql");
    expect(mig).toMatch(/'currency', coalesce\(public\.event_checkout_currency\(p_event\), 'GBP'\)/);
    expect(mig).toMatch(/create trigger checkout_orders_currency_guard before insert on public\.checkout_orders/);
    const c = src("src/app/checkout/[event]/client.tsx");
    expect(c).not.toMatch(/currency: "GBP"/); expect(c).not.toMatch(/Europe\/London/); expect(c).toMatch(/notices\.cancellation/);
  });

  test("create-event: the timezone selector drives storage", () => {
    const w = src("src/components/organizer/create-event.tsx"), a = src("src/lib/actions/create-event.ts"), p = src("src/app/organizer/events/new/page.tsx");
    expect(w).toMatch(/iso\(s2\.starts_at, s2\.timezone\)/); expect(a).toMatch(/wallToIso\(p\.data\.starts_at, p\.data\.timezone\)/);
    expect(p).toMatch(/utcToWallString\(d, TZ\)/); expect(p).not.toMatch(/const TZ = "Europe\/London"/);
    expect(a).toMatch(/timezone: loc\.timezone, currency: loc\.currency/);
  });

  test("UTC 'today' fixed on invoices, RFQ respond-by and proposals", () => {
    expect(src("src/app/organizer/money/invoices/new/page.tsx")).toMatch(/todayIn\(workspaceLocale/);
    expect(src("src/components/organizer/rfq-wizard.tsx")).toMatch(/min=\{today\}/);
    for (const f of ["src/app/organizer/money/invoices/new/page.tsx", "src/components/organizer/rfq-wizard.tsx", "src/components/organizer/proposal-forms.tsx", "src/lib/actions/proposals.ts", "src/app/contract/[token]/page.tsx"])
      expect(src(f), f).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  test("coverage uses worldwide geocoding; html lang is en-GB; agent prompts carry the locale", () => {
    expect(src("src/app/organizer/marketplace/page.tsx")).toMatch(/await placePoint\(ev\?\.city\)/);
    expect(src("src/lib/actions/provider-search.ts")).toMatch(/await placePoint\(e\.city\)/);
    expect(src("src/app/provider/venues/new/actions.ts")).not.toMatch(/countrycodes=gb,ie/);
    expect(src("src/lib/maps/geocode.ts")).toMatch(/process\.env\.MAP_TILER_API_KEY/);
    expect(src("src/app/layout.tsx")).toMatch(/<html lang=\{DEFAULT_LOCALE\}/);
    expect(src("src/app/api/agent/ask/route.ts")).toMatch(/await ask\(user\.id/); expect(src("src/lib/agent/runtime.ts")).toMatch(/const locale = localeDirective\(/);   // 2026-11-16: page Ask delegates to runtime.ask (groundingFor) expect(src("src/lib/agent/runtime.ts")).toMatch(/localeDirective\(/);
    expect(src("src/lib/agent/runtime.ts")).not.toMatch(/anthropic/i);
  });

  test("the country launch matrix lists every Connect country", () => {
    const m = src("docs/release/i18n/country-launch-matrix.md");
    for (const [code, name] of Object.entries(CONNECT_SUPPORTED_COUNTRIES)) expect(m, code).toMatch(new RegExp(`\\| ${code} \\| ${name} \\|`));
  });
});
