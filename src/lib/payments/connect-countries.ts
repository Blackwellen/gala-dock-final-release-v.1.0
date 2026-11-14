/**
 * Where Gala Dock sellers (suppliers, venues, organisers selling tickets/resales) can take payments through Gala Dock.
 * ONE source of truth for the seller-country gate (owner request 2026-11-14: "some countries won't verify").
 * Pure module: no imports, safe in client components, server routes and the release unit tests. The database mirror is
 * public.connect_supported_countries (migration 202611146101); tests/release/connect-countries.spec.ts fails if they drift.
 *
 * Our configuration (DEC-107): UK platform, DIRECT charges on the seller's connected account with an application fee, connected
 * accounts with NO Stripe dashboard (controller properties), card_payments + transfers capabilities, manual payouts.
 *
 * Stripe facts this list rests on (docs checked 2026-11-14):
 *  - Direct charges need the card_payments capability active, and funds always settle in the connected account's country.
 *    https://docs.stripe.com/connect/charges
 *  - card_payments needs the `full` service agreement; `recipient` accounts (the countries Stripe reaches only through
 *    cross-border payouts / Global Payouts) can't process payments or request card_payments.
 *    https://docs.stripe.com/connect/service-agreement-types
 *  - Cross-border payouts don't apply to us: they support only separate charges and transfers / destination charges without
 *    on_behalf_of, and top-ups — not direct charges. https://docs.stripe.com/connect/cross-border-payouts
 *  - UK platforms can create platform-controlled (no-dashboard) accounts for any country Stripe supports (https://stripe.com/global),
 *    except that UAE, India and Thailand aren't self-serve (contact Stripe sales), and Mexico settlement merchants for platforms
 *    outside Mexico need further Stripe review. https://docs.stripe.com/connect/custom-accounts
 *  - Platforms outside Brazil can't collect application fees on Brazilian connected accounts.
 *    https://docs.stripe.com/connect/direct-charges (application fee limitations)
 *  - Platforms outside Malaysia can't collect application fees on Malaysian connected accounts.
 *    https://support.stripe.com/questions/connect-availability-for-businesses-located-in-malaysia
 *  - Connect country availability (incl. the "available in preview" list: HR, GI, LI, IN, ID, BR, MY …).
 *    https://docs.stripe.com/connect/explore-connect-guide
 *  - stripe.com/global lists India and Indonesia as preview and Côte d'Ivoire, Ghana, Kenya, Nigeria and South Africa as the
 *    Paystack "extended network" — not Stripe accounts. https://stripe.com/global
 *
 * Rule: a country is listed as supported only when every fact above allows it self-serve. Preview / contact-sales / review-only
 * countries are NOT listed until Stripe enables them for this platform (re-check, test in sandbox, then add here AND in a new
 * migration). Singapore is listed: no current Stripe doc restricts it for a UK platform (a 2022 forum reply named it for US
 * platforms only) — confirm in sandbox before the first Singapore seller goes live.
 */

export const CONNECT_COUNTRIES_CHECKED_ON = "2026-11-14";
export const CONNECT_COUNTRIES_SOURCES = [
  "https://docs.stripe.com/connect/charges",
  "https://docs.stripe.com/connect/service-agreement-types",
  "https://docs.stripe.com/connect/cross-border-payouts",
  "https://docs.stripe.com/connect/custom-accounts",
  "https://docs.stripe.com/connect/direct-charges",
  "https://docs.stripe.com/connect/explore-connect-guide",
  "https://support.stripe.com/questions/connect-availability-for-businesses-located-in-malaysia",
  "https://stripe.com/global",
] as const;

/** ISO 3166-1 alpha-2 → English name. Countries where a seller can take payments through Gala Dock. */
export const CONNECT_SUPPORTED_COUNTRIES: Readonly<Record<string, string>> = {
  AT: "Austria", AU: "Australia", BE: "Belgium", BG: "Bulgaria", CA: "Canada", CH: "Switzerland", CY: "Cyprus", CZ: "Czech Republic",
  DE: "Germany", DK: "Denmark", EE: "Estonia", ES: "Spain", FI: "Finland", FR: "France", GB: "United Kingdom", GR: "Greece",
  HK: "Hong Kong", HU: "Hungary", IE: "Ireland", IT: "Italy", JP: "Japan", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia",
  MT: "Malta", NL: "Netherlands", NO: "Norway", NZ: "New Zealand", PL: "Poland", PT: "Portugal", RO: "Romania", SE: "Sweden",
  SG: "Singapore", SI: "Slovenia", SK: "Slovakia", US: "United States",
};

export type ConnectCountryBlock = "no_application_fees" | "contact_sales" | "review_required" | "preview" | "not_stripe" | "not_available" | "unknown";

/** Countries Stripe does operate in but which our configuration can't use yet, with the reason (for admin/support). */
export const CONNECT_BLOCKED_COUNTRIES: Readonly<Record<string, ConnectCountryBlock>> = {
  BR: "no_application_fees", MY: "no_application_fees",
  AE: "contact_sales", TH: "contact_sales", IN: "contact_sales",
  MX: "review_required",
  ID: "preview", HR: "preview", GI: "preview", LI: "preview",
  ZA: "not_stripe", NG: "not_stripe", KE: "not_stripe", GH: "not_stripe", CI: "not_stripe",
};

export const CONNECT_BLOCK_REASON: Record<ConnectCountryBlock, string> = {
  no_application_fees: "Stripe doesn’t let platforms outside this country collect fees on its sellers’ payments.",
  contact_sales: "Stripe doesn’t offer self-serve seller accounts here; it needs a separate agreement with Stripe.",
  review_required: "Stripe needs a separate review before sellers here can take card payments on a UK platform.",
  preview: "Stripe Connect is only in preview here.",
  not_stripe: "Stripe doesn’t offer seller accounts here.",
  not_available: "Stripe can’t take card payments for sellers here on a UK platform.",
  unknown: "Add your business country first.",
};

const norm = (code: unknown) => (typeof code === "string" ? code.trim().toUpperCase() : "");

export function isConnectCountrySupported(code: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(CONNECT_SUPPORTED_COUNTRIES, norm(code));
}

export type ConnectCountrySupport = { code: string; supported: true } | { code: string | null; supported: false; block: ConnectCountryBlock; reason: string };

export function connectCountrySupport(code: unknown): ConnectCountrySupport {
  const c = norm(code);
  if (!/^[A-Z]{2}$/.test(c)) return { code: null, supported: false, block: "unknown", reason: CONNECT_BLOCK_REASON.unknown };
  if (isConnectCountrySupported(c)) return { code: c, supported: true };
  const block = CONNECT_BLOCKED_COUNTRIES[c] ?? "not_available";
  return { code: c, supported: false, block, reason: CONNECT_BLOCK_REASON[block] };
}

/**
 * Resolves a stored country (workspace settings keep the master-data NAME, e.g. "United Kingdom"; Stripe uses ISO-2) to ISO-2.
 * Returns null when it can't be resolved — callers must never fall back to GB silently.
 */
export function resolveCountryCode(value: unknown, catalog: readonly { code: string; name: string }[]): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) { const c = v.toUpperCase(); return catalog.some(x => x.code === c) || c in CONNECT_SUPPORTED_COUNTRIES ? c : null; }
  const hit = catalog.find(x => x.name.toLowerCase() === v.toLowerCase());
  if (hit) return hit.code;
  const sup = Object.entries(CONNECT_SUPPORTED_COUNTRIES).find(([, n]) => n.toLowerCase() === v.toLowerCase());
  return sup ? sup[0] : null;
}

/**
 * The workspace's business country as stored: onboarding writes settings.organisation.country (organiser) or
 * settings.business.country (provider); organiser Settings → Locale & defaults edits settings.country. Null when none is set.
 */
export function workspaceCountryValue(settings: unknown): unknown {
  const s = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>;
  const nested = (k: string) => { const v = s[k]; return v && typeof v === "object" ? (v as { country?: unknown }).country : undefined; };
  const pick = [nested("organisation"), nested("business"), s.country].find(v => typeof v === "string" && v.trim());
  return pick ?? null;
}

/** The business country's name when it is set AND unsupported; null when supported or unknown (unknown → Stripe decides). */
export function unsupportedWorkspaceCountry(settings: unknown, catalog: readonly { code: string; name: string }[]): string | null {
  const code = resolveCountryCode(workspaceCountryValue(settings), catalog);
  if (!code || isConnectCountrySupported(code)) return null;
  return catalog.find(c => c.code === code)?.name ?? code;
}

/** Customer-facing and seller-facing copy. Accurate, no claims beyond the list. */
export const CONNECT_COPY = {
  helpPath: "/help/where-you-can-get-paid",
  unsupportedTitle: "Gala Dock payments aren’t available in this country yet",
  unsupportedBody: (country: string) =>
    `Stripe, our payment provider, can’t verify seller payout accounts for businesses in ${country} on Gala Dock yet. You can still create your profile and publish enquiry-only listings, and agree payment with clients yourself, but you can’t take bookings, deposits or paid tickets through Gala Dock.`,
  payoutsRefused: (country: string) => `Gala Dock can’t set up Stripe payouts for businesses in ${country} yet. Your listings can stay enquiry-only, and free events still work.`,
  paidTicketsRefused: (country: string) => `Paid tickets aren’t available for organisers in ${country} yet, because Stripe can’t set up payouts there for Gala Dock. Free tickets and registrations still work.`,
  listingFallback: "Your business country isn’t supported for Gala Dock payments yet, so this listing is published as enquiry-only. Clients can contact you, but can’t book or pay a deposit through Gala Dock.",
  checkoutRefused: "This seller can’t take payments through Gala Dock in their country yet. Contact them directly to arrange payment.",
} as const;

/** Sorted list for help/pricing pages. */
export function supportedCountryNames(): string[] {
  return Object.values(CONNECT_SUPPORTED_COUNTRIES).sort((a, b) => a.localeCompare(b, "en-GB"));
}
