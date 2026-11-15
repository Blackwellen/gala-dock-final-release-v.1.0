/**
 * Website lead intake -> Twenty CRM (https://crm.blackwellen-operations.cloud).
 *
 * Server-side only. Dependency-free on purpose (no framework imports, no path aliases) so it runs
 * unchanged under the repo's test runner; the Next.js scheduling wrapper lives in `twenty-intake-schedule.ts`.
 *
 * Rules (from the Blackwellen CRM website-integration guide):
 *  - Never blocks or fails the user's form submission: `forwardLeadToTwenty` never throws, has a hard
 *    overall deadline, and logs only a short code (no personal data, no request or response bodies).
 *  - Off by default. Needs TWENTY_INTAKE_ENABLED=true, TWENTY_API_URL and TWENTY_INTAKE_API_KEY.
 *  - People are upserted by email, Companies by domain (free mail domains are skipped). Multi-selects are merged.
 *  - Marketing consent fields are written ONLY when the visitor ticked an optional box, with the exact wording
 *    (kept as a Note) and a timestamp. A reply to an enquiry is not marketing, so no tick means no consent fields.
 *  - Do-not-contact wins: a contact flagged do-not-contact is never re-subscribed, and a review task is raised.
 *  - Never call this for tenants, event attendees, or support, privacy, legal, billing or press requests.
 *  - Twenty select values are UPPER_SNAKE_CASE.
 */

export type TwentyBrand = "clientturn" | "propvora" | "gala_dock" | "gigvora";
export type TwentyFormType = "signup" | "demo_request" | "contact" | "partner" | "supplier_signup";
export type TwentySide = "a_customer" | "b_supply" | "c_partner";
export type TwentyApplicantType = "supplier" | "venue" | "freelancer" | "agency" | "affiliate" | "other";

export interface TwentyLead {
  brand: TwentyBrand;
  formType: TwentyFormType;
  /** Twenty `brandRoles` value, e.g. "ct_a_customer" (any case). */
  roles: string[];
  side: TwentySide;
  email: string;
  firstName?: string;
  lastName?: string;
  /** Used only when firstName/lastName are not given. */
  fullName?: string;
  jobTitle?: string;
  company?: string;
  country?: string;
  message?: string;
  /** Path of the page the form is on, e.g. "/contact-sales". */
  landingPath?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  /** Present ONLY when the visitor ticked the optional marketing box. */
  consent?: { wording: string; version: string; source: string };
  /** Create an Opportunity (buyer demand only, never supply-side signups). */
  opportunity?: { name: string; partner?: boolean };
  /** Create a Supplier / Partner Application record. */
  application?: { type: TwentyApplicantType; categories?: string; website?: string };
}

export interface TwentyResult {
  ok: boolean;
  skipped?: "disabled" | "invalid";
}

export interface TwentyOptions {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  /** Overall deadline for one lead, ms. */
  deadlineMs?: number;
  log?: (event: string, detail: Record<string, string | number>) => void;
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "yahoo.com", "yahoo.co.uk",
  "icloud.com", "me.com", "live.com", "msn.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "btinternet.com",
]);

const STAGE_FIELD: Record<TwentyBrand, string> = {
  clientturn: "ctStage",
  propvora: "pvStage",
  gala_dock: "gdStage",
  gigvora: "gvStage",
};

const BRAND_LABEL: Record<TwentyBrand, string> = {
  clientturn: "ClientTurn",
  propvora: "Propvora",
  gala_dock: "Gala Dock",
  gigvora: "Gigvora",
};

const LEAD_SOURCE: Record<TwentyFormType, string> = {
  signup: "WEBSITE_SIGNUP",
  demo_request: "WEBSITE_DEMO_REQUEST",
  contact: "WEBSITE_CONTACT",
  partner: "WEBSITE_PARTNER_APPLICATION",
  supplier_signup: "WEBSITE_SUPPLIER_SIGNUP",
};

const LIFECYCLE_RANK: Record<string, number> = {
  SUBSCRIBER: 1, LEAD: 2, MARKETING_QUALIFIED: 3, SALES_QUALIFIED: 4, OPPORTUNITY: 5, CUSTOMER: 6,
};

const MAX_TEXT = 2000;
const DEFAULT_DEADLINE_MS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clip = (value: unknown, max = MAX_TEXT): string => String(value ?? "").trim().slice(0, max);
const upper = (value: string): string => value.trim().toUpperCase();
const union = (a: unknown, b: string[]): string[] =>
  Array.from(new Set([...(Array.isArray(a) ? (a as string[]) : []), ...b]));

export function isTwentyIntakeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TWENTY_INTAKE_ENABLED === "true" && !!env.TWENTY_API_URL && !!env.TWENTY_INTAKE_API_KEY;
}

export function leadSourceFor(formType: TwentyFormType): string {
  return LEAD_SOURCE[formType];
}

/** The lifecycle a new person gets: buyer enquiries are sales qualified, signups are leads, supply/partners are "other". */
export function lifecycleFor(lead: Pick<TwentyLead, "formType" | "side">): string {
  if (lead.side !== "a_customer") return "OTHER";
  return lead.formType === "signup" ? "LEAD" : "SALES_QUALIFIED";
}

function domainOf(email: string): string | undefined {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && !FREE_MAIL.has(domain) ? domain : undefined;
}

/** Fields written when a person is created. Contains consent fields only when the box was ticked. */
export function buildNewPerson(lead: TwentyLead, now: Date, companyId?: string): Record<string, unknown> {
  const email = lead.email.trim().toLowerCase();
  const [first, ...rest] = (lead.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const person: Record<string, unknown> = {
    name: {
      firstName: clip(lead.firstName ?? first ?? "", 200),
      lastName: clip(lead.lastName ?? rest.join(" "), 200),
    },
    emails: { primaryEmail: email },
    brand: upper(lead.brand),
    side: upper(lead.side),
    brandRoles: lead.roles.map(upper),
    leadSource: LEAD_SOURCE[lead.formType],
    lifecycleStage: lifecycleFor(lead),
    leadStatus: "NEW",
  };
  if (lead.jobTitle) person.jobTitle = clip(lead.jobTitle, 200);
  if (companyId) person.companyId = companyId;
  if (lead.country && /^[a-z]{2}$/i.test(lead.country.trim())) person.countryCode = lead.country.trim().toUpperCase();
  if (lead.landingPath) person.landingPath = clip(lead.landingPath, 500);
  if (lead.utm?.source) person.utmSource = clip(lead.utm.source, 200);
  if (lead.utm?.medium) person.utmMedium = clip(lead.utm.medium, 200);
  if (lead.utm?.campaign) person.utmCampaign = clip(lead.utm.campaign, 200);
  if (lead.formType === "signup") person.signedUpAt = now.toISOString();
  if (lead.formType === "demo_request") person.demoRequestedAt = now.toISOString();
  return person;
}

/** The consent patch for a person. Empty object unless the visitor ticked the box. */
export function buildConsentPatch(
  lead: TwentyLead,
  existingBrands: unknown,
  now: Date,
): Record<string, unknown> {
  if (!lead.consent) return {};
  return {
    marketingConsentBrands: union(existingBrands, [upper(lead.brand)]),
    consentRecordedAt: now.toISOString(),
    consentSource: clip(lead.consent.source, 200),
    consentWordingVersion: clip(lead.consent.version, 100),
  };
}

class TwentyHttpError extends Error {
  constructor(label: string) {
    super(label);
    this.name = "TwentyHttpError";
  }
}

export async function forwardLeadToTwenty(lead: TwentyLead, options: TwentyOptions = {}): Promise<TwentyResult> {
  const env = options.env ?? process.env;
  const log =
    options.log ?? ((event, detail) => console.error(event, JSON.stringify(detail)));
  if (!isTwentyIntakeEnabled(env)) return { ok: true, skipped: "disabled" };

  const email = (lead.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: true, skipped: "invalid" };

  const base = (env.TWENTY_API_URL as string).replace(/\/+$/, "");
  const key = env.TWENTY_INTAKE_API_KEY as string;
  const doFetch = options.fetchImpl ?? fetch;
  const now = (options.now ?? (() => new Date()))();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), options.deadlineMs ?? DEFAULT_DEADLINE_MS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Json = any;
  const call = async (method: string, path: string, body?: unknown, retry = true): Promise<Json> => {
    const response = await doFetch(`${base}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": `blackwellen-site-${lead.brand}/1.0`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429 && retry) {
      const wait = Math.min(3000, Math.max(1, Number(response.headers.get("retry-after") ?? 2)) * 1000);
      await new Promise((resolve) => setTimeout(resolve, wait));
      return call(method, path, body, false);
    }
    // Never include the response body: it can echo personal data.
    if (!response.ok) throw new TwentyHttpError(`${method} ${path.split("?")[0].replace(/\/[0-9a-f-]{36}/g, "/:id")} ${response.status}`);
    return response.json();
  };
  const firstOf = (r: Json, k: string): Json => r?.data?.[k]?.[0];
  const one = (r: Json): Json => Object.values(r?.data ?? {})[0];

  try {
    const domain = domainOf(email);

    // 1. Company by domain (only when a company name was given and the address is not a free mail provider).
    let companyId: string | undefined;
    if (domain && lead.company?.trim()) {
      const found = firstOf(
        await call("GET", `/rest/companies?limit=1&depth=0&filter=${encodeURIComponent(`domainName.primaryLinkUrl[like]:"%${domain}%"`)}`),
        "companies",
      );
      companyId =
        found?.id ??
        one(
          await call("POST", "/rest/companies?depth=0", {
            name: clip(lead.company, 200),
            domainName: { primaryLinkUrl: `https://${domain}` },
            brand: upper(lead.brand),
            side: upper(lead.side),
            brandRoles: lead.roles.map(upper),
            leadSource: LEAD_SOURCE[lead.formType],
            lifecycleStage: lifecycleFor(lead),
          }),
        )?.id;
    }

    // 2. Person by email (merge, never replace).
    const existing = firstOf(
      await call("GET", `/rest/people?limit=1&depth=0&filter=${encodeURIComponent(`emails.primaryEmail[eq]:"${email}"`)}`),
      "people",
    );
    const dnc = !!existing && (existing.globalDoNotContact === true || !!existing.optOutDate);
    let personId: string;
    if (!existing) {
      personId = one(await call("POST", "/rest/people?depth=0", buildNewPerson(lead, now, companyId)))?.id;
    } else {
      personId = existing.id;
      const patch: Record<string, unknown> = { brandRoles: union(existing.brandRoles, lead.roles.map(upper)) };
      if (!existing.companyId && companyId) patch.companyId = companyId;
      if (!existing.brand) patch.brand = upper(lead.brand);
      if (!existing.side) patch.side = upper(lead.side);
      if (!existing.utmSource && lead.utm?.source) patch.utmSource = clip(lead.utm.source, 200);
      if (!existing.utmMedium && lead.utm?.medium) patch.utmMedium = clip(lead.utm.medium, 200);
      if (!existing.utmCampaign && lead.utm?.campaign) patch.utmCampaign = clip(lead.utm.campaign, 200);
      if (!existing.landingPath && lead.landingPath) patch.landingPath = clip(lead.landingPath, 500);
      if (!dnc) {
        // Only ever move a lifecycle forward.
        const want = lifecycleFor(lead);
        const have = LIFECYCLE_RANK[existing.lifecycleStage as string] ?? 0;
        if (have === 0 && want) patch.lifecycleStage = want;
        else if ((LIFECYCLE_RANK[want] ?? 0) > have) patch.lifecycleStage = want;
      }
      await call("PATCH", `/rest/people/${personId}?depth=0`, patch);
    }
    if (!personId) throw new TwentyHttpError("people create returned no id");

    // 3. Consent: only when ticked, never for a do-not-contact person, with the wording kept as evidence.
    if (lead.consent && !dnc) {
      if (existing) await call("PATCH", `/rest/people/${personId}?depth=0`, buildConsentPatch(lead, existing.marketingConsentBrands, now));
      else await call("PATCH", `/rest/people/${personId}?depth=0`, buildConsentPatch(lead, [], now));
      const note = one(
        await call("POST", "/rest/notes?depth=0", {
          title: `Marketing consent (${BRAND_LABEL[lead.brand]}) ${clip(lead.consent.version, 100)}`,
          bodyV2: { markdown: clip(lead.consent.wording) },
        }),
      );
      if (note?.id) await call("POST", "/rest/noteTargets?depth=0", { noteId: note.id, targetPersonId: personId });
    }

    // 4. Record the enquiry itself (form type + message) as a note.
    if (lead.formType !== "signup" || lead.message) {
      const note = one(
        await call("POST", "/rest/notes?depth=0", {
          title: `Website form: ${lead.formType} (${BRAND_LABEL[lead.brand]})`,
          bodyV2: { markdown: clip([lead.landingPath ? `Page: ${lead.landingPath}` : "", lead.message ?? ""].filter(Boolean).join("\n\n")) || "(no message)" },
        }),
      );
      if (note?.id) await call("POST", "/rest/noteTargets?depth=0", { noteId: note.id, targetPersonId: personId });
    }

    // 5. A do-not-contact person who re-enquired: flag it for a human, do not market.
    if (dnc) {
      const task = one(await call("POST", "/rest/tasks?depth=0", { title: "DNC contact re-enquired: review before any marketing", status: "TODO" }));
      if (task?.id) await call("POST", "/rest/taskTargets?depth=0", { taskId: task.id, targetPersonId: personId });
    }

    // 6. Opportunity for buyer demand, never for supply-side signups.
    if (lead.opportunity) {
      const partner = lead.opportunity.partner === true;
      await call("POST", "/rest/opportunities?depth=0", {
        name: clip(lead.opportunity.name, 200),
        pointOfContactId: personId,
        companyId,
        stage: "NEW",
        brand: partner ? "BLACKWELLEN" : upper(lead.brand),
        side: upper(lead.side),
        brandRoles: lead.roles.map(upper),
        leadSource: LEAD_SOURCE[lead.formType],
        [partner ? "partnerStage" : STAGE_FIELD[lead.brand]]: partner ? "IDENTIFIED" : "NEW_ENQUIRY",
        dealType: partner ? "PARTNER" : lead.brand === "gigvora" ? "MARKETPLACE_CLIENT" : "NEW_BUSINESS",
        lifecycleStage: "LEAD",
        leadStatus: "NEW",
      });
    }

    // 7. Supplier / partner application record.
    if (lead.application) {
      await call("POST", "/rest/partnerApplications?depth=0", {
        name: clip(lead.company || email, 200),
        brandKey: upper(lead.brand),
        applicantType: upper(lead.application.type),
        status: "NEW",
        applicantEmail: email,
        applicantCompany: clip(lead.company, 200),
        website: clip(lead.application.website, 300),
        categories: clip(lead.application.categories, 500),
        message: clip(lead.message),
        consentGiven: !!lead.consent,
        consentWording: lead.consent ? clip(lead.consent.version, 100) : undefined,
        consentAt: lead.consent ? now.toISOString() : undefined,
        submittedAt: now.toISOString(),
        sourcePage: clip(lead.landingPath, 300),
        personId,
        companyId,
      });
    }
    return { ok: true };
  } catch (error) {
    // Route and status only. Never the body, never an address.
    log("crm_sync_failed", {
      brand: lead.brand,
      form: lead.formType,
      reason: error instanceof TwentyHttpError ? error.message : error instanceof Error ? error.name : "unknown",
    });
    return { ok: false };
  } finally {
    clearTimeout(deadline);
  }
}
