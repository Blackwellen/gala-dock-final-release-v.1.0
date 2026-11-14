import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/** Seller-country gate for Stripe Connect (owner 2026-11-14): pure modules + source checks, no network, no app server. */
function load(file: string, deps: Record<string, unknown> = {}): Record<string, any> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const req = (n: string) => n in deps ? deps[n] : (() => { throw new Error(`Unexpected dependency: ${n}`); })();
  runInNewContext(code, { module: m, exports: m.exports, require: req });
  return m.exports as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
}
const cc = load("src/lib/payments/connect-countries.ts");
const catalog = load("src/lib/master-data/catalog.ts");
const COUNTRIES = catalog.COUNTRIES as { code: string; name: string; business: boolean }[];
const src = (f: string) => readFileSync(f, "utf8");
const MIGRATION = "supabase/migrations/202611146101_connect_seller_countries.sql";

test("supported list: the DEC-107 seller countries, with sources and check date", () => {
  const codes = Object.keys(cc.CONNECT_SUPPORTED_COUNTRIES).sort();
  expect(codes).toHaveLength(36);
  for (const c of ["GB", "IE", "US", "CA", "DE", "FR", "AU", "ES", "IT", "NL", "PT", "JP", "SG", "HK", "NZ", "CH", "NO"]) expect(cc.isConnectCountrySupported(c)).toBe(true);
  // Documented exclusions: no application fees (BR, MY), not self-serve (AE, TH, IN), review (MX), preview (ID, HR, GI, LI), Paystack network (ZA …).
  for (const c of ["BR", "MY", "AE", "TH", "IN", "MX", "ID", "HR", "GI", "LI", "ZA", "NG", "KE", "GH", "CI", "AR", "PH", "TR"]) expect(cc.isConnectCountrySupported(c)).toBe(false);
  expect(cc.CONNECT_COUNTRIES_CHECKED_ON).toBe("2026-11-14");
  expect(cc.CONNECT_COUNTRIES_SOURCES.every((u: string) => /^https:\/\/(docs|support)?\.?stripe\.com\//.test(u))).toBe(true);
  expect(cc.isConnectCountrySupported("gb")).toBe(true);
  expect(cc.isConnectCountrySupported("")).toBe(false);
  expect(cc.isConnectCountrySupported(null)).toBe(false);
});

test("support verdicts carry a reason; unknown country is 'unknown', never GB", () => {
  expect(cc.connectCountrySupport("GB")).toEqual({ code: "GB", supported: true });
  expect(cc.connectCountrySupport("BR")).toMatchObject({ code: "BR", supported: false, block: "no_application_fees" });
  expect(cc.connectCountrySupport("AE")).toMatchObject({ supported: false, block: "contact_sales" });
  expect(cc.connectCountrySupport("ZA")).toMatchObject({ supported: false, block: "not_stripe" });
  expect(cc.connectCountrySupport("AR")).toMatchObject({ supported: false, block: "not_available" });
  expect(cc.connectCountrySupport(undefined)).toMatchObject({ code: null, supported: false, block: "unknown" });
  for (const v of Object.values(cc.CONNECT_BLOCK_REASON)) expect(String(v).length).toBeGreaterThan(10);
});

test("every onboarding business country is classified; AE and South Africa are the unsupported ones today", () => {
  const business = COUNTRIES.filter(c => c.business);
  expect(business.length).toBeGreaterThan(0);
  const unsupported = business.filter(c => !cc.isConnectCountrySupported(c.code)).map(c => c.code).sort();
  expect(unsupported).toEqual(["AE", "ZA"]);
  // Names in the list match master data where both exist (settings store the master-data name).
  for (const c of COUNTRIES) if (cc.CONNECT_SUPPORTED_COUNTRIES[c.code]) expect(cc.CONNECT_SUPPORTED_COUNTRIES[c.code]).toBe(c.name);
});

test("country resolution: names or ISO-2, case-insensitive, null when unknown (no silent GB default)", () => {
  expect(cc.resolveCountryCode("United Kingdom", COUNTRIES)).toBe("GB");
  expect(cc.resolveCountryCode("south africa", COUNTRIES)).toBe("ZA");
  expect(cc.resolveCountryCode("ae", COUNTRIES)).toBe("AE");
  expect(cc.resolveCountryCode("Japan", COUNTRIES)).toBe("JP");   // not in master data, in the supported list
  expect(cc.resolveCountryCode("Atlantis", COUNTRIES)).toBeNull();
  expect(cc.resolveCountryCode("", COUNTRIES)).toBeNull();
  expect(cc.resolveCountryCode(undefined, COUNTRIES)).toBeNull();
  expect(cc.resolveCountryCode("XX", COUNTRIES)).toBeNull();
  expect(cc.workspaceCountryValue({ organisation: { country: "Ireland" }, country: "France" })).toBe("Ireland");
  expect(cc.workspaceCountryValue({ business: { country: "South Africa" } })).toBe("South Africa");
  expect(cc.workspaceCountryValue({ country: "France" })).toBe("France");
  expect(cc.workspaceCountryValue({ organisation: { country: "  " }, country: "FR" })).toBe("FR");
  expect(cc.workspaceCountryValue(null)).toBeNull();
  expect(cc.unsupportedWorkspaceCountry({ business: { country: "United Arab Emirates" } }, COUNTRIES)).toBe("United Arab Emirates");
  expect(cc.unsupportedWorkspaceCountry({ business: { country: "United Kingdom" } }, COUNTRIES)).toBeNull();
  expect(cc.unsupportedWorkspaceCountry({}, COUNTRIES)).toBeNull();
});

test("database mirror (migration) lists exactly the same countries and names", () => {
  const sql = src(MIGRATION);
  const rows = [...sql.matchAll(/\('([A-Z]{2})', '([^']+)', '2026-11-14', 'https:\/\/[^']+'\)/g)].map(m => [m[1], m[2]]);
  expect(rows.length).toBe(36);
  expect(Object.fromEntries(rows)).toEqual(cc.CONNECT_SUPPORTED_COUNTRIES);
  expect(sql).toMatch(/new\.booking_mode := 'enquiry'/);
  expect(sql).toMatch(/ws\.payout_status <> 'active' and country_ok/);
  expect(sql).toMatch(/ca\.country is null or public\.connect_country_supported\(ca\.country\)/);
});

test("sellerReadiness refuses a connected account in an unsupported country (checkout/booking backstop)", () => {
  const rules = load("src/lib/payments/rules.ts", { "./connect-countries": cc });
  const base = { workspace_id: "w", stripe_account_id: "acct_123", charges_enabled: true, card_payments: "active", details_submitted: true, disabled_reason: null, past_due: [], default_currency: "gbp" };
  expect(rules.sellerReadiness({ ...base, country: "GB" })).toEqual({ ready: true, account: "acct_123" });
  expect(rules.sellerReadiness({ ...base, country: null })).toEqual({ ready: true, account: "acct_123" });
  expect(rules.sellerReadiness({ ...base, country: "BR" })).toEqual({ ready: false, reason: "country_unsupported" });
  expect(rules.sellerReadiness({ ...base, stripe_account_id: null, country: "BR" })).toEqual({ ready: false, reason: "no_account" });
  expect(rules.NOT_READY_COPY.country_unsupported).toMatch(/country/);
});

test("payout setup: real business country to Stripe, unsupported refused before any Stripe call, no GB fallback", () => {
  const r = src("src/app/api/payouts/route.ts");
  expect(r).not.toMatch(/countryByName/);
  const gate = r.indexOf("connectCountrySupport(country)"), create = r.indexOf('stripe<{ id: string }>("accounts"'), terms = r.indexOf("payment_terms_accepted");
  expect(gate).toBeGreaterThan(0);
  expect(gate).toBeLessThan(create);
  expect(gate).toBeLessThan(terms);
  expect(r).toMatch(/countryUnsupported: true/);
  expect(r).toMatch(/countryRequired: true/);
  expect(r).toMatch(/wrongCountry/);
});

test("paid tickets, onboarding listing mode, onboarding UI, admin and help all use the one source", () => {
  for (const f of ["src/lib/actions/ticket-setup.ts", "src/lib/actions/ticket-pro.ts"]) expect(src(f)).toMatch(/CONNECT_COPY\.paidTicketsRefused\(offPlatform\)/);
  expect(src("src/app/api/onboarding/route.ts")).toMatch(/offPlatform \? "Enquiry Only"/);
  const ui = src("src/components/onboarding.tsx");
  expect(ui).toMatch(/CountryPaymentsNotice/);
  expect(ui).toMatch(/country=\{country\}/);
  expect(src("src/app/admin/(console)/workspaces/[id]/page.tsx")).toMatch(/"Seller country"/);
  expect(src("src/app/provider/money/_components/connect-status.tsx")).toMatch(/CONNECT_COPY\.payoutsRefused\(offPlatform\)/);
  expect(src("src/app/provider/money/_components/connect-button.tsx")).toMatch(/data\.countryUnsupported/);
  const help = src("src/lib/help/articles.ts");
  expect(help).toMatch(/slug: "where-you-can-get-paid"/);
  expect(help).toMatch(/supportedCountryNames\(\)/);
  expect(cc.CONNECT_COPY.helpPath).toBe("/help/where-you-can-get-paid");
  expect(src("src/app/(site)/pricing/page.tsx")).toMatch(/Where can sellers get paid\?/);
  expect(src("src/app/(site)/providers/page.tsx")).toMatch(/CONNECT_COPY\.helpPath/);
});
