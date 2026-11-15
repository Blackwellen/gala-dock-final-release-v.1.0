import { test, expect } from "@playwright/test";
const describe = test.describe;
const it = test;
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  buildConsentPatch,
  buildNewPerson,
  forwardLeadToTwenty,
  isTwentyIntakeEnabled,
  type TwentyLead,
} from "../../src/lib/crm/twenty-intake";

const ENV_ON = { TWENTY_INTAKE_ENABLED: "true", TWENTY_API_URL: "https://crm.example.test/", TWENTY_INTAKE_API_KEY: "k_test" };
const NOW = new Date("2026-11-15T10:00:00.000Z");

type Call = { method: string; path: string; body: any; auth: string | null };

/** A fake Twenty. `person` seeds an existing person; every call is recorded. */
function fakeTwenty(opts: { person?: Record<string, unknown>; company?: Record<string, unknown>; status?: number } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: any) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path: u.pathname + u.search, body, auth: init.headers.Authorization });
    if (opts.status && opts.status >= 400) return new Response("{}", { status: opts.status });
    const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
    if (init.method === "GET" && u.pathname === "/rest/people") return json({ people: opts.person ? [opts.person] : [] });
    if (init.method === "GET" && u.pathname === "/rest/companies") return json({ companies: opts.company ? [opts.company] : [] });
    return json({ created: { id: `id-${calls.length}` } });
  }) as unknown as typeof fetch;
  const posts = (path: string) => calls.filter((c) => c.method === "POST" && c.path.startsWith(path));
  return { calls, fetchImpl, posts };
}

const baseLead = (over: Partial<TwentyLead> = {}): TwentyLead => ({
  brand: "clientturn",
  formType: "demo_request",
  roles: ["ct_a_customer"],
  side: "a_customer",
  email: "  Test+ClientTurn@Acme-Agency.example ",
  firstName: "Tess",
  lastName: "Tester",
  company: "Acme Agency",
  landingPath: "/contact-sales",
  utm: { source: "newsletter", medium: "email", campaign: "nov" },
  opportunity: { name: "Acme Agency (ClientTurn demo)" },
  ...over,
});

const run = (lead: TwentyLead, fake: ReturnType<typeof fakeTwenty>, extra: Record<string, unknown> = {}) =>
  forwardLeadToTwenty(lead, { env: ENV_ON, fetchImpl: fake.fetchImpl, now: () => NOW, log: () => {}, ...extra });

const CONSENT = { version: "v1", source: "clientturn:/contact-sales", wording: "Send me updates (optional)" };

describe("Twenty intake", () => {
  it("is off by default and makes no request", async () => {
    const fake = fakeTwenty();
    for (const env of [{}, { TWENTY_INTAKE_ENABLED: "false", TWENTY_API_URL: "x", TWENTY_INTAKE_API_KEY: "y" }, { TWENTY_INTAKE_ENABLED: "true", TWENTY_API_URL: "x" }]) {
      const result = await forwardLeadToTwenty(baseLead(), { env, fetchImpl: fake.fetchImpl, log: () => {} });
      expect(result).toEqual({ ok: true, skipped: "disabled" });
      expect(isTwentyIntakeEnabled(env)).toBe(false);
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("maps a demo request: brand, side, source, UPPER_SNAKE values, utm, company, opportunity", async () => {
    const fake = fakeTwenty();
    expect(await run(baseLead(), fake)).toEqual({ ok: true });
    const person = fake.posts("/rest/people")[0].body;
    expect(person.emails.primaryEmail).toBe("test+clientturn@acme-agency.example");
    expect(person).toMatchObject({
      brand: "CLIENTTURN", side: "A_CUSTOMER", brandRoles: ["CT_A_CUSTOMER"], leadSource: "WEBSITE_DEMO_REQUEST",
      lifecycleStage: "SALES_QUALIFIED", leadStatus: "NEW", utmSource: "newsletter", utmMedium: "email", utmCampaign: "nov",
      landingPath: "/contact-sales", demoRequestedAt: NOW.toISOString(),
    });
    expect(person.name).toEqual({ firstName: "Tess", lastName: "Tester" });
    expect(person.companyId).toBeTruthy();
    expect(fake.posts("/rest/companies")[0].body.domainName.primaryLinkUrl).toBe("https://acme-agency.example");
    const opp = fake.posts("/rest/opportunities")[0].body;
    expect(opp).toMatchObject({ brand: "CLIENTTURN", ctStage: "NEW_ENQUIRY", leadSource: "WEBSITE_DEMO_REQUEST", stage: "NEW" });
    expect(fake.calls.every((c) => c.auth === "Bearer k_test")).toBe(true);
    expect(fake.posts("/rest/notes").some((c) => c.body.title.includes("demo_request"))).toBe(true);
  });

  it("writes consent only when the box was ticked, with wording and timestamp", async () => {
    const ticked = fakeTwenty();
    await run(baseLead({ consent: CONSENT }), ticked);
    const patch = ticked.calls.find((c) => c.method === "PATCH" && c.body.consentRecordedAt)!;
    expect(patch.body).toMatchObject({
      marketingConsentBrands: ["CLIENTTURN"], consentRecordedAt: NOW.toISOString(),
      consentSource: "clientturn:/contact-sales", consentWordingVersion: "v1",
    });
    expect(ticked.posts("/rest/notes").some((c) => c.body.bodyV2.markdown === "Send me updates (optional)")).toBe(true);

    const unticked = fakeTwenty();
    await run(baseLead(), unticked);
    expect(JSON.stringify(unticked.calls)).not.toMatch(/marketingConsentBrands|consentRecordedAt|consentSource|consentWordingVersion/);
    expect(buildConsentPatch(baseLead(), [], NOW)).toEqual({});
    expect(Object.keys(buildNewPerson(baseLead(), NOW))).not.toContain("marketingConsentBrands");
  });

  it("merges into an existing person and never lifts a do-not-contact flag", async () => {
    const existing = { id: "p1", brandRoles: ["PV_A_OPERATOR"], marketingConsentBrands: ["PROPVORA"], lifecycleStage: "CUSTOMER", brand: "PROPVORA" };
    const fake = fakeTwenty({ person: existing });
    await run(baseLead({ consent: CONSENT }), fake);
    expect(fake.posts("/rest/people")).toHaveLength(0);
    const patches = fake.calls.filter((c) => c.method === "PATCH");
    expect([...patches[0].body.brandRoles].sort()).toEqual(["CT_A_CUSTOMER", "PV_A_OPERATOR"]);
    expect(patches[0].body.lifecycleStage).toBeUndefined();
    expect([...patches[1].body.marketingConsentBrands].sort()).toEqual(["CLIENTTURN", "PROPVORA"]);

    const dncFake = fakeTwenty({ person: { id: "p2", brandRoles: [], globalDoNotContact: true } });
    await run(baseLead({ consent: CONSENT }), dncFake);
    expect(JSON.stringify(dncFake.calls)).not.toMatch(/consentRecordedAt|marketingConsentBrands/);
    expect(dncFake.posts("/rest/tasks")).toHaveLength(1);
    expect(dncFake.calls.find((c) => c.method === "PATCH")!.body.lifecycleStage).toBeUndefined();
  });

  it("skips the company for free-mail addresses and when no company was given", async () => {
    const free = fakeTwenty();
    await run(baseLead({ email: "test+x@gmail.com" }), free);
    expect(free.calls.some((c) => c.path.startsWith("/rest/companies"))).toBe(false);
    const none = fakeTwenty();
    await run(baseLead({ company: undefined }), none);
    expect(none.calls.some((c) => c.path.startsWith("/rest/companies"))).toBe(false);
  });

  it("supply-side forms never create a deal; partner deals use the partner pipeline", async () => {
    const supplier = fakeTwenty();
    await run(
      baseLead({ formType: "supplier_signup", roles: ["pv_b_supplier"], side: "b_supply", opportunity: undefined, application: { type: "supplier", categories: "plumbing" } }),
      supplier,
    );
    expect(supplier.posts("/rest/opportunities")).toHaveLength(0);
    expect(supplier.posts("/rest/people")[0].body).toMatchObject({ lifecycleStage: "OTHER", leadSource: "WEBSITE_SUPPLIER_SIGNUP", side: "B_SUPPLY" });
    expect(supplier.posts("/rest/partnerApplications")[0].body).toMatchObject({ applicantType: "SUPPLIER", brandKey: "CLIENTTURN", status: "NEW", consentGiven: false });

    const partner = fakeTwenty();
    await run(baseLead({ formType: "partner", roles: ["ct_c_partner"], side: "c_partner", opportunity: { name: "P", partner: true } }), partner);
    expect(partner.posts("/rest/opportunities")[0].body).toMatchObject({ brand: "BLACKWELLEN", partnerStage: "IDENTIFIED", dealType: "PARTNER" });
  });

  it("Twenty down or erroring: resolves ok:false, never throws, logs no personal data", async () => {
    const logs: string[] = [];
    const log = (event: string, detail: Record<string, unknown>) => logs.push(event + JSON.stringify(detail));
    const down = (async () => {
      throw new TypeError("connect ECONNREFUSED test+clientturn@acme-agency.example");
    }) as unknown as typeof fetch;
    expect(await forwardLeadToTwenty(baseLead(), { env: ENV_ON, fetchImpl: down, log })).toEqual({ ok: false });
    expect(await run(baseLead(), fakeTwenty({ status: 500 }), { log })).toEqual({ ok: false });
    expect(await run(baseLead(), fakeTwenty({ status: 401 }), { log })).toEqual({ ok: false });
    expect(logs).toHaveLength(3);
    for (const line of logs) {
      expect(line).toContain("crm_sync_failed");
      expect(line).not.toMatch(/acme-agency|Tess|Tester|@/);
    }
  });

  it("gives up at the deadline instead of hanging", async () => {
    const hang = ((_u: string, init: any) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const started = Date.now();
    const result = await forwardLeadToTwenty(baseLead(), { env: ENV_ON, fetchImpl: hang, deadlineMs: 50, log: () => {} });
    expect(result).toEqual({ ok: false });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("ignores an invalid email without calling Twenty", async () => {
    const fake = fakeTwenty();
    expect(await run(baseLead({ email: "not-an-email" }), fake)).toEqual({ ok: true, skipped: "invalid" });
    expect(fake.calls).toHaveLength(0);
  });
});
