import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Q74 legal engineering (owner legal decisions 2026-11-14): pure modules + source checks (no app server), plus a read-only check that
// the live database mirrors (sanctions list, insurance minimums, grants) match the app modules when management credentials are set.
function load(file: string, deps: Record<string, unknown> = {}): Record<string, any> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const req = (n: string) => n in deps ? deps[n] : (() => { throw new Error(`Unexpected dependency: ${n}`); })();
  runInNewContext(code, { module: m, exports: m.exports, require: req, URLSearchParams, decodeURIComponent, Intl, Date });
  return m.exports as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
}
const src = (f: string) => readFileSync(f, "utf8");
const sanctions = load("src/lib/legal/sanctions.ts");
const porr = load("src/lib/tax/platform-reporting.ts");
const vat = load("src/lib/tax/eu-vat.ts", { "@/lib/legal/sanctions": sanctions });
const ins = load("src/lib/trust/insurance.ts");
const reports = load("src/lib/safety/content-reports.ts");
const nc = load("src/lib/legal/non-circumvention.ts");
const MIG = src("supabase/migrations/202611147401_legal_engineering.sql");
const hdr = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

test.describe("Q74 · sanctions block (D4)", () => {
  test("countries and occupied regions; names resolve; no false positives", () => {
    for (const c of ["CU", "IR", "KP", "SY", "RU", "BY", "ru", "Russia", "north korea"]) expect(sanctions.isSanctioned(c)).toBe(true);
    for (const c of ["GB", "UA", "IE", "US", "", null, "XX"]) expect(sanctions.isSanctioned(c)).toBe(false);
    expect(sanctions.sanctionedJurisdiction("UA", "43")).toEqual({ code: "UA-43", name: "Crimea" });
    expect(sanctions.sanctionedJurisdiction("UA", "UA-14")?.code).toBe("UA-14");
    expect(sanctions.sanctionedJurisdiction("UA", "30")).toBeNull();                       // Kyiv
    expect(sanctions.SANCTIONS_CHECKED_ON).toBe("2026-11-14");
    expect(sanctions.SANCTIONS_SOURCES.length).toBeGreaterThanOrEqual(3);
  });
  test("edge geolocation headers drive the sign-up / checkout refusal", () => {
    expect(sanctions.requestSanctioned(hdr({ "x-vercel-ip-country": "IR" }))?.code).toBe("IR");
    expect(sanctions.requestSanctioned(hdr({ "x-vercel-ip-country": "UA", "x-vercel-ip-country-region": "43" }))?.name).toBe("Crimea");
    expect(sanctions.requestSanctioned(hdr({ "x-vercel-ip-country": "GB" }))).toBeNull();
    expect(sanctions.requestSanctioned(hdr({}))).toBeNull();
    expect(sanctions.sanctionsErrorMessage({ message: "sanctioned_jurisdiction", hint: "Gala Dock can’t be used for businesses or sales in Iran because …" })).toMatch(/Iran/);
    expect(sanctions.sanctionsErrorMessage({ message: "other" })).toBeNull();
  });
  test("TS list and the migration's sanctioned_jurisdictions seed agree", () => {
    const seeded = [...MIG.matchAll(/\('([A-Z]{2}(?:-[A-Z0-9]{1,3})?)', '[^']+', '(country|region)'/g)].map(m => m[1]).sort();
    expect(seeded).toEqual([...Object.keys(sanctions.SANCTIONED_COUNTRIES), ...Object.keys(sanctions.SANCTIONED_REGIONS)].sort());
  });
  test("every surface is gated", () => {
    expect(src("src/app/register/page.tsx")).toMatch(/requestSanctioned\(await headers\(\)\)/);
    expect(src("src/app/api/onboarding/route.ts")).toMatch(/sanctionedJurisdiction\(values\.country\)/);
    expect(src("src/app/api/payouts/route.ts")).toMatch(/SANCTIONS_COPY\.payouts/);
    expect(src("src/app/partner/payouts/route.ts")).toMatch(/SANCTIONS_COPY\.payouts/);
    expect(src("src/app/partner/actions.ts")).toMatch(/SANCTIONS_COPY\.partner/);
    expect(src("src/app/api/checkout/session/route.ts")).toMatch(/SANCTIONS_COPY\.checkout/);
    expect(src("src/lib/commerce/orchestrator.ts")).toMatch(/SANCTIONS_COPY\.checkout/);
    expect(src("src/lib/actions/billing.ts").match(/SANCTIONS_COPY\.checkout/g)?.length).toBe(2);
    expect(src("src/lib/workspace/rpc.ts")).toMatch(/sanctionsErrorMessage\(error\)/);
    for (const t of ["sanctions_workspace_country", "sanctions_listing_publish", "sanctions_event_publish", "sanctions_partner_application"]) expect(MIG).toContain(`create trigger ${t}`);
    expect(MIG).toMatch(/admin_sanctions_override_set[\s\S]*has_admin_permission\('trust'\)[\s\S]*reason_required[\s\S]*sanctions\.override_granted/);
  });
});

test.describe("Q74 · UK platform reporting (D7)", () => {
  const ok = { seller_type: "individual", legal_name: "Ann Seller", date_of_birth: "1990-01-01", tin: "AB123456C", country: "GB", address_line1: "1 High St", city: "London", confirmed_accurate: true };
  test("validation mirrors the database rules", () => {
    const today = new Date("2026-11-14T00:00:00Z");
    expect(porr.validateTaxDetails(ok, today)).toEqual({});
    expect(porr.validateTaxDetails({ ...ok, tin: "1234567890" }, today)).toEqual({});                          // UTR
    expect(porr.validateTaxDetails({ ...ok, tin: "12345" }, today).tin).toBeTruthy();
    expect(porr.validateTaxDetails({ ...ok, date_of_birth: "2015-01-01" }, today).date_of_birth).toBeTruthy();   // under 18
    expect(porr.validateTaxDetails({ ...ok, tin: "", tin_not_issued: true }, today)).toEqual({});
    expect(porr.validateTaxDetails({ ...ok, vat_number: "GB12" }, today).vat_number).toBeTruthy();
    expect(porr.validateTaxDetails({ ...ok, seller_type: "entity", date_of_birth: undefined, company_number: "" , tin: ""}, today).company_number).toBeTruthy();
    expect(porr.validateTaxDetails({ ...ok, seller_type: "entity", company_number: "SC123456" }, today)).toEqual({});
    expect(porr.validateTaxDetails({ ...ok, confirmed_accurate: false }, today).confirmed_accurate).toBeTruthy();
    expect(porr.vatNumberValid("GB123456789")).toBe(true); expect(porr.vatNumberValid("FR12345678901")).toBe(true); expect(porr.vatNumberValid("GB1")).toBe(false);
  });
  test("due diligence: initial request, two reminders, hold only after both and 60 days (verify)", () => {
    const d0 = "2026-01-01T00:00:00Z", at = (days: number) => new Date(Date.parse(d0) + days * 86_400_000);
    expect(porr.nextDueDiligenceAction({ complete: false, held: false }, at(0))).toBe("initial");
    expect(porr.nextDueDiligenceAction({ step0: d0, complete: false, held: false }, at(19))).toBe("none");
    expect(porr.nextDueDiligenceAction({ step0: d0, complete: false, held: false }, at(20))).toBe("reminder_1");
    expect(porr.nextDueDiligenceAction({ step0: d0, step1: d0, complete: false, held: false }, at(40))).toBe("reminder_2");
    expect(porr.nextDueDiligenceAction({ step0: d0, step1: d0, step2: d0, complete: false, held: false }, at(59))).toBe("none");
    expect(porr.nextDueDiligenceAction({ step0: d0, step1: d0, step2: d0, complete: false, held: false }, at(60))).toBe("hold");
    expect(porr.nextDueDiligenceAction({ step0: d0, step1: d0, step2: d0, complete: true, held: false }, at(90))).toBe("none");
    expect(MIG).toMatch(/interval '20 days'[\s\S]*interval '40 days'[\s\S]*interval '60 days'/);
    expect(porr.DUE_DILIGENCE).toEqual({ reminder1Day: 20, reminder2Day: 40, holdDay: 60 });
  });
  test("annual export: CSV is formula-safe; XML escapes and groups quarters", () => {
    const row = { workspace_id: "w1", seller_name: "=HYPERLINK(\"x\")", seller_type: "entity", legal_name: "A & B <Ltd>", date_of_birth: null, tin: "1234567890", tin_country: "GB",
      tin_not_issued: false, vat_number: null, company_number: "01234567", address: "1 High St, London", country: "GB", activity: "immovable_property", quarter: 2,
      consideration_minor: 10000, activities: 2, fees_minor: 900, currency: "GBP", details_complete: true };
    const csv = porr.reportCsv([row]);
    expect(csv.split("\r\n")[0]).toContain("consideration_minor");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    const xml = porr.reportXml(2026, [row, { ...row, quarter: 3, consideration_minor: 500 }]);
    expect(xml).toContain("A &amp; B &lt;Ltd&gt;"); expect(xml).toContain('<Q2><Consideration currency="GBP">10000</Consideration>');
    expect(xml).toContain("<Q3><Consideration currency=\"GBP\">500</Consideration>"); expect(xml).toContain("validate against HMRC");
  });
  test("sensitive storage: no table grants, masked reads, payouts gate and tax-reporting payout pause", () => {
    expect(MIG).toMatch(/revoke all on table public\.seller_tax_profiles from public, anon, authenticated/);
    expect(MIG).not.toMatch(/grant select on table public\.seller_tax_profiles to authenticated/);
    expect(MIG).toMatch(/'tin_masked', case when t\.tin is not null then repeat\('•'/);
    expect(MIG).toMatch(/seller_tax_profiles\.retain/);
    expect(MIG).toMatch(/dec107_payouts_paused[\s\S]*tax_reporting_holds h where h\.workspace_id = p_workspace and h\.lifted_at is null/);
    expect(src("src/app/api/payouts/route.ts")).toMatch(/taxDetailsRequired: true/);
    expect(src("src/app/provider/money/_components/connect-button.tsx")).toMatch(/TaxDetailsForm/);
    expect(src("src/app/admin/(console)/compliance/platform-reporting/route.ts")).toMatch(/admin_platform_reporting_export_logged/);
  });
});

test.describe("Q74 · EU VAT readiness", () => {
  const session = (o: Record<string, unknown>) => ({ id: "cs_1", object: "checkout.session", amount_total: 1200, currency: "eur", created: 1_763_000_000, livemode: false,
    automatic_tax: { enabled: true, status: "complete" }, total_details: { amount_tax: 0 }, customer_details: { address: { country: "FR" }, tax_ids: [] }, metadata: { workspace_id: "w" }, ...o });
  test("not_collecting consumer sale in a zero-threshold country raises a staff alert with the OSS deadline", () => {
    const s = vat.platformSaleSignals(session({}), "ai_credits");
    expect(s).toHaveLength(1); expect(s[0]).toMatchObject({ kind: "tax_not_collecting", country: "FR", product: "credit_pack" });
    expect(s[0].detail.oss_deadline).toBe(vat.ossDeadline(s[0].occurred_at));
    expect(vat.ossDeadline("2026-11-20T10:00:00Z")).toBe("2026-12-10");
  });
  test("no alert for business buyers with a tax ID, UK buyers charged VAT, or threshold countries", () => {
    expect(vat.platformSaleSignals(session({ customer_details: { address: { country: "FR" }, tax_ids: [{ type: "eu_vat", value: "FR123" }] } }), "subscription")).toEqual([]);
    expect(vat.platformSaleSignals(session({ customer_details: { address: { country: "GB" } }, total_details: { amount_tax: 200 } }), "subscription")).toEqual([]);
    expect(vat.platformSaleSignals(session({ customer_details: { address: { country: "US" } } }), "subscription")).toEqual([]);
    expect(vat.platformSaleSignals(session({ total_details: { amount_tax: 0, breakdown: { taxes: [{ amount: 0, taxability_reason: "not_collecting" }] } }, customer_details: { address: { country: "IN" } } }), "subscription")[0].kind).toBe("tax_not_collecting");
  });
  test("sanctioned billing country is flagged on own-sales and direct charges", () => {
    expect(vat.platformSaleSignals(session({ customer_details: { address: { country: "IR" } } }), "subscription").map((x: { kind: string }) => x.kind)).toContain("sanctioned_billing_country");
    expect(vat.directChargeSanctionsSignal(session({ customer_details: { address: { country: "UA", state: "43" } } }), "acct_1")?.detail.jurisdiction).toBe("UA-43");
    expect(vat.directChargeSanctionsSignal(session({}), "acct_1")).toBeNull();
  });
  test("tax_id_collection wherever Gala Dock is merchant; commission VAT by seller country; booking fee TODO", () => {
    const core = src("src/lib/billing/core.ts");
    expect(core).toMatch(/\.\.\.taxParams\(!!o\.automaticTax\), \.\.\.businessTaxIdParams\(true\),\n    mode: "subscription"/);
    expect(core).toMatch(/\.\.\.taxParams\(!!o\.automaticTax\), \.\.\.businessTaxIdParams\(true\),\n    \/\/ A one-off payment/);
    expect(src("src/lib/ads/checkout.ts")).toMatch(/"tax_id_collection\[enabled\]": "true", customer_creation: "always"/);
    expect(src("src/app/api/stripe/webhook/route.ts")).toMatch(/platformSaleSignals/);
    expect(MIG).toMatch(/if t = 'reverse_charge' then new\.commission_vat := 0/);
    expect(MIG).toMatch(/TODO\(tax adviser\): booking-fee VAT/);
    expect(src("src/app/provider/money/statement/page.tsx")).toMatch(/reverse charge/);
  });
  test("plans and credit packs are business-only (D15)", () => {
    const svc = src("src/lib/billing/service.ts");
    expect(svc.match(/if \(!details\) return \{ ok: false, error: BUSINESS_ONLY_COPY\.required/g)?.length).toBe(2);
    expect(src("src/components/billing/plan-billing.tsx")).toMatch(/<BillingBusinessDetails/);
    expect(MIG).toMatch(/workspace_billing_details[\s\S]*confirmed_business boolean not null default false check \(confirmed_business\)/);
  });
});

test.describe("Q74 · insurance, non-circumvention, payout grounds, reports", () => {
  test("insurance minimums £1m / £2m by category (D10)", () => {
    expect(ins.STANDARD_PUBLIC_LIABILITY_MINOR).toBe(100_000_000); expect(ins.HIGHER_RISK_PUBLIC_LIABILITY_MINOR).toBe(200_000_000);
    expect(Object.keys(ins.HIGHER_RISK_CATEGORIES).sort()).toEqual(["AV & Production", "Marquees & Structures", "Security"]);
    expect(ins.publicLiabilityMinimum("Security")).toBe(200_000_000); expect(ins.publicLiabilityMinimum("Catering")).toBe(100_000_000);
    for (const c of Object.keys(ins.HIGHER_RISK_CATEGORIES)) expect(MIG).toContain(`'${c}'`);
  });
  test("non-circumvention: 12 months, enquiry-only carve-out shown in-app (D11)", () => {
    expect(nc.NON_CIRCUMVENTION_MONTHS).toBe(12);
    expect(nc.NON_CIRCUMVENTION_COPY.enquiryOnlySeller).toMatch(/allowed/);
    expect(src("src/app/provider/_components/enquiry-only.tsx")).toMatch(/NON_CIRCUMVENTION_COPY\.enquiryOnlySeller/);
    expect(src("src/components/customer/public-listing.tsx")).toMatch(/NON_CIRCUMVENTION_COPY\.enquiryOnlyBuyer/);
  });
  test("payout grounds: no automatic risk hold on DEC-107 payouts or resale refunds (D5)", () => {
    expect(MIG).toMatch(/create or replace function public\.payout_eligible[\s\S]*and not public\.dec107_payouts_paused\(p_workspace\);/);
    const pe = MIG.slice(MIG.indexOf("create or replace function public.payout_eligible"), MIG.indexOf("$function$;", MIG.indexOf("create or replace function public.payout_eligible")));
    expect(pe).not.toMatch(/risk_hold_active/);
    expect(MIG).toMatch(/claim_resale_refunds\(integer\)[\s\S]*no automatic risk hold/);
  });
  test("Report on listings, events, reviews and profiles feeds one queue with messages (D8)", () => {
    expect(reports.reportReasons("review").map((r: { code: string }) => r.code)).toContain("fake_review");
    expect(reports.reportReasons("listing").map((r: { code: string }) => r.code)).toContain("scam_or_payment_diversion");
    expect(reports.isReportSubject("message")).toBe(false);                 // messages: report_message (Q52)
    expect(src("src/components/customer/public-listing.tsx").match(/<ReportContentButton/g)?.length).toBe(2);   // listing + each review
    expect(src("src/app/events/[slug]/page.tsx")).toMatch(/<ReportContentButton subject="event"/);
    expect(MIG).toMatch(/from public\.message_reports m where m\.status = p_status/);
    expect(src("src/app/admin/(console)/moderation/actions.ts")).toMatch(/admin_decide_message_report[\s\S]*admin_decide_content_report/);
  });
});

// Live mirror check (read-only). Skipped without management credentials.
const REF = process.env.SUPABASE_PROJECT_REF, PAT = process.env.SUPABASE_PAT_KEY;
async function sql<T>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error(`sql ${r.status}`); return (await r.json()) as T[];
}
test("live database mirrors the app modules (sanctions, insurance, grants)", async () => {
  test.skip(!REF || !PAT, "needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY");
  const codes = (await sql<{ code: string }>("select code from public.sanctioned_jurisdictions where active order by 1")).map(r => r.code);
  expect(codes).toEqual([...Object.keys(sanctions.SANCTIONED_COUNTRIES), ...Object.keys(sanctions.SANCTIONED_REGIONS)].sort());
  const cover = await sql<{ category: string; min_cover_minor: number }>("select category, min_cover_minor from public.credential_requirements where credential_key = 'public_liability' and capability = 'service' and category is not null");
  for (const r of cover) expect(Number(r.min_cover_minor), r.category).toBe(ins.publicLiabilityMinimum(r.category));
  const g = await sql<{ f: boolean; v: boolean; c: boolean }>("select has_function_privilege('authenticated','public.fee_vat_treatment(uuid)','execute') f, has_function_privilege('authenticated','public.workspace_vat_number(uuid)','execute') v, has_function_privilege('authenticated','public.platform_reporting_complete(uuid)','execute') c");
  expect(g[0]).toEqual({ f: false, v: false, c: false });
  const t = await sql<{ n: number }>("select count(*)::int n from information_schema.role_table_grants where table_schema = 'public' and table_name = 'seller_tax_profiles' and grantee in ('anon','authenticated')");
  expect(t[0]!.n).toBe(0);
});
