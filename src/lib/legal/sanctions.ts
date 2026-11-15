/**
 * Sanctions block (owner decision D4, Q54 2026-11-14). ONE source of truth in the app for the comprehensively sanctioned
 * countries/regions Gala Dock refuses. Pure module (no imports): safe in client components, route handlers and release tests.
 * Database mirror: public.sanctioned_jurisdictions (migration 202611147401); tests/release/q74-legal-engineering.spec.ts fails if
 * the two drift.
 *
 * Sources checked 2026-11-14 (re-check monthly and on every OFSI / EU / OFAC change):
 *  - UK sanctions regimes and the OFSI consolidated list: https://www.gov.uk/government/collections/uk-sanctions-regimes
 *  - EU Sanctions Map: https://www.sanctionsmap.eu
 *  - US OFAC sanctions programs: https://ofac.treasury.gov/sanctions-programs-and-country-information
 *  - Stripe restricted territories: https://stripe.com/legal/restricted-businesses
 * Notes: Russia and Belarus are extensive (not comprehensive) UK/EU regimes, listed by owner policy (as Gigvora). Syria was eased by
 * the UK, EU and US in 2025 and is kept pending counsel (verify). Zaporizhzhia and Kherson are only partly occupied, so they are
 * not blocked by region code (manual review). This list never replaces Stripe's own screening of connected accounts.
 */

export const SANCTIONS_CHECKED_ON = "2026-11-14";
export const SANCTIONS_SOURCES = [
  "https://www.gov.uk/government/collections/uk-sanctions-regimes",
  "https://www.sanctionsmap.eu",
  "https://ofac.treasury.gov/sanctions-programs-and-country-information",
  "https://stripe.com/legal/restricted-businesses",
] as const;

/** ISO 3166-1 alpha-2 → name. */
export const SANCTIONED_COUNTRIES: Readonly<Record<string, string>> = {
  CU: "Cuba", IR: "Iran", KP: "North Korea", SY: "Syria", RU: "Russia", BY: "Belarus",
};
/** ISO 3166-2 → name (regions of otherwise-permitted countries). */
export const SANCTIONED_REGIONS: Readonly<Record<string, string>> = {
  "UA-43": "Crimea", "UA-40": "Sevastopol", "UA-14": "Donetsk region (non-government controlled)", "UA-09": "Luhansk region (non-government controlled)",
};

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : "");

/** ISO-2 code, or the English name of a sanctioned country ("Russia"), to ISO-2; anything else is returned upper-cased. */
export function sanctionsCountryCode(value: unknown): string {
  const v = norm(value);
  if (/^[A-Z]{2}$/.test(v)) return v;
  const hit = Object.entries(SANCTIONED_COUNTRIES).find(([, n]) => n.toUpperCase() === v);
  return hit ? hit[0] : v;
}

export type SanctionHit = { code: string; name: string };

/** The sanctioned jurisdiction for a country (+ optional ISO 3166-2 region, with or without the "UA-" prefix), or null. */
export function sanctionedJurisdiction(country: unknown, region?: unknown): SanctionHit | null {
  const c = sanctionsCountryCode(country);
  if (!c) return null;
  if (SANCTIONED_COUNTRIES[c]) return { code: c, name: SANCTIONED_COUNTRIES[c]! };
  const r = norm(region).replace(/^[A-Z]{2}-/, "");
  if (r) { const code = `${c}-${r}`; if (SANCTIONED_REGIONS[code]) return { code, name: SANCTIONED_REGIONS[code]! }; }
  return null;
}
export const isSanctioned = (country: unknown, region?: unknown) => sanctionedJurisdiction(country, region) !== null;

/** The visitor's country/region as the edge sees it (Vercel geo headers). Never trusted as proof of location — only as a block signal. */
export function requestJurisdiction(headers: { get(name: string): string | null }): { country: string | null; region: string | null } {
  const country = norm(headers.get("x-vercel-ip-country")) || null;
  const region = norm(decodeURIComponent(headers.get("x-vercel-ip-country-region") ?? "")) || null;
  return { country: country && /^[A-Z]{2}$/.test(country) ? country : null, region };
}
export function requestSanctioned(headers: { get(name: string): string | null }): SanctionHit | null {
  const j = requestJurisdiction(headers);
  return j.country ? sanctionedJurisdiction(j.country, j.region) : null;
}

/** Clear, non-accusatory copy. One message per surface; all point to support for mistakes. */
export const SANCTIONS_COPY = {
  helpPath: "/help/where-gala-dock-is-available",
  title: "Gala Dock isn’t available here",
  body: (place: string) => `Because of UK, EU, UN and US sanctions, Gala Dock can’t be used for businesses, payments or sales in ${place}. If you think this is a mistake, for example because you’re travelling, contact support.`,
  signUp: (place: string) => `We can’t create Gala Dock accounts from ${place} because of UK, EU, UN and US sanctions. If you’re not in ${place} (for example, using a VPN or travelling), contact support.`,
  businessCountry: (place: string) => `Gala Dock can’t be used for businesses in ${place} because of UK, EU, UN and US sanctions. Choose the country where your business is established.`,
  publish: (place: string) => `This can’t be published because the business country is ${place}, where sanctions prevent Gala Dock from operating.`,
  payouts: (place: string) => `Payouts can’t be set up for ${place} because of UK, EU, UN and US sanctions.`,
  partner: (place: string) => `We can’t accept partner applications from ${place} because of UK, EU, UN and US sanctions.`,
  checkout: (place: string) => `Payments from ${place} can’t be taken on Gala Dock because of UK, EU, UN and US sanctions. You haven’t been charged.`,
} as const;

/** Maps a database refusal (raise 'sanctioned_jurisdiction' … hint) to user copy. */
export function sanctionsErrorMessage(error: { message?: string | null; hint?: string | null } | null | undefined): string | null {
  if (!error || !/sanctioned_jurisdiction/.test(error.message ?? "")) return null;
  return error.hint && error.hint.length > 20 ? error.hint : SANCTIONS_COPY.body("this country");
}
