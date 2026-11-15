// Q72 · Country profiles: the per-country facts the product needs (EU membership, currency, units, postcode/address/phone
// formats, consumer-law regime, alcohol age, licence-pack coverage, resale price rules, cookie model, consumer price display).
// Pure data + helpers, no I/O: client, server and tests. The seller-payout gate stays in src/lib/payments/connect-countries.ts and
// the sanctions block belongs to the legal-engineering lane (Q74); this file never decides either.
//
// Sources and review status: every legal fact here is a REFERENCE for product copy and defaults, not legal advice. `reviewed`
// is false until counsel confirms it (owner decision D14). docs/release/i18n/country-launch-matrix.md is generated from the same
// facts by hand and must be kept in step (tests/release/q72-i18n.spec.ts checks the codes match).

export type ConsumerRegime = "uk_ccr" | "eu_crd" | "ch_or" | "no_angrerett" | "us_state" | "au_acl" | "nz_cga" | "ca_provincial" | "jp_sctl" | "sg_cpfta" | "hk_tdo" | "other";
export type ResaleRule =
  | { kind: "face_value_cap"; plusPct?: number; scope: string; source: string }
  | { kind: "organiser_consent"; scope: string; source: string }
  | { kind: "no_statutory_cap"; scope: string; source: string }
  | { kind: "varies_by_region"; scope: string; source: string }
  | { kind: "unknown"; scope: string; source: string };
export type AlcoholRule = { min: number; spiritsMin?: number; varies?: string; covered: boolean };
export type AddressField = "line1" | "line2" | "city" | "region" | "postcode";
export type CountryProfile = {
  code: string; name: string; eu: boolean; eea: boolean; currency: string; distance: "mi" | "km";
  postcode: RegExp | null; postcodeLabel: string; regionLabel?: string; address: readonly AddressField[]; calling: string; trunk0: boolean; nsn: readonly [number, number];
  consumer: ConsumerRegime; alcohol: AlcoholRule; licencePack: "complete" | "partial" | "none"; resale: ResaleRule;
  consumerPrices: "tax_inclusive" | "tax_exclusive"; taxName: string;
};

const ADDR_EU: readonly AddressField[] = ["line1", "line2", "postcode", "city"];
const ADDR_UK: readonly AddressField[] = ["line1", "line2", "city", "postcode"];
const ADDR_NA: readonly AddressField[] = ["line1", "line2", "city", "region", "postcode"];
/** EU calling codes (kept apart so the EUP() rows stay readable). */
const EU_CALLING: Readonly<Record<string, string>> = { AT: "43", BE: "32", BG: "359", CY: "357", CZ: "420", DE: "49", DK: "45", EE: "372", ES: "34", FI: "358", FR: "33", GR: "30",
  HU: "36", IT: "39", LT: "370", LU: "352", LV: "371", MT: "356", NL: "31", PL: "48", PT: "351", RO: "40", SE: "46", SI: "386", SK: "421" };
const UNK = (scope = "Not reviewed for this country."): ResaleRule => ({ kind: "unknown", scope, source: "" });
const NOCAP = (scope: string, source = ""): ResaleRule => ({ kind: "no_statutory_cap", scope, source });
const EUP = (code: string, name: string, currency: string, postcode: RegExp, alcohol: AlcoholRule, resale: ResaleRule, extra: Partial<CountryProfile> = {}): CountryProfile => ({
  code, name, eu: true, eea: true, currency, distance: "km", postcode, postcodeLabel: "Postal code", address: ADDR_EU, calling: EU_CALLING[code] ?? "", trunk0: code !== "DK" && code !== "LU" && code !== "MT" && code !== "GR" && code !== "EE" && code !== "LV" && code !== "CY", nsn: [6, 12],
  consumer: "eu_crd", alcohol, licencePack: "none", resale, consumerPrices: "tax_inclusive", taxName: "VAT", ...extra,
});

/** Profiles for every seller country (Connect list), the onboarding countries outside it (AE, ZA) and the main buyer countries. */
export const COUNTRY_PROFILES: Readonly<Record<string, CountryProfile>> = Object.fromEntries(([
  { code: "GB", name: "United Kingdom", eu: false, eea: false, currency: "GBP", distance: "mi", postcode: /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i, postcodeLabel: "Postcode", regionLabel: "County",
    address: ADDR_UK, calling: "44", trunk0: true, nsn: [9, 10], consumer: "uk_ccr", alcohol: { min: 18, covered: true }, licencePack: "complete",
    resale: { kind: "no_statutory_cap", scope: "No statutory price cap yet; Consumer Rights Act 2015 s.90 information duties (face value, seat, restrictions) apply to resale. Government has proposed a face-value cap — re-check before launch.", source: "https://www.legislation.gov.uk/ukpga/2015/15/part/3/chapter/5" },
    consumerPrices: "tax_inclusive", taxName: "VAT" },
  { code: "IE", name: "Ireland", eu: true, eea: true, currency: "EUR", distance: "km", postcode: /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W) ?[0-9AC-FHKNPRTV-Y]{4}$/i, postcodeLabel: "Eircode", regionLabel: "County",
    address: ["line1", "line2", "city", "region", "postcode"], calling: "353", trunk0: true, nsn: [7, 9], consumer: "eu_crd", alcohol: { min: 18, covered: true }, licencePack: "none",
    resale: { kind: "face_value_cap", scope: "Sale of Tickets Act 2021: no resale above face value for designated events and venues (capacity over 1,000).", source: "https://www.irishstatutebook.ie/eli/2021/act/14/enacted/en/html" },
    consumerPrices: "tax_inclusive", taxName: "VAT" },
  EUP("AT", "Austria", "EUR", /^\d{4}$/, { min: 16, spiritsMin: 18, covered: false }, UNK()),
  EUP("BE", "Belgium", "EUR", /^\d{4}$/, { min: 16, spiritsMin: 18, covered: false }, { kind: "face_value_cap", scope: "Law of 30 July 2013: occasional resale allowed at no more than the original price (plus documented costs); habitual resale banned.", source: "https://economie.fgov.be/" }),
  EUP("BG", "Bulgaria", "EUR", /^\d{4}$/, { min: 18, covered: false }, UNK(), { taxName: "VAT" }),
  EUP("CY", "Cyprus", "EUR", /^\d{4}$/, { min: 17, covered: false }, UNK()),
  EUP("CZ", "Czech Republic", "CZK", /^\d{3} ?\d{2}$/, { min: 18, covered: false }, UNK()),
  EUP("DE", "Germany", "EUR", /^\d{5}$/, { min: 16, spiritsMin: 18, covered: false }, NOCAP("No statutory cap; organisers may restrict transfer in their terms (personalised tickets).")),
  EUP("DK", "Denmark", "DKK", /^\d{4}$/, { min: 18, varies: "16 for shop sales under 16.5% ABV", covered: false }, { kind: "face_value_cap", scope: "Resale above the original price is prohibited for cultural and sporting events.", source: "" }),
  EUP("EE", "Estonia", "EUR", /^\d{5}$/, { min: 18, covered: false }, UNK()),
  EUP("ES", "Spain", "EUR", /^\d{5}$/, { min: 18, covered: false }, { kind: "varies_by_region", scope: "Regional rules (e.g. some autonomous communities ban resale above face value); national reform pending — check per region.", source: "" }),
  EUP("FI", "Finland", "EUR", /^\d{5}$/, { min: 18, spiritsMin: 20, covered: false }, UNK()),
  EUP("FR", "France", "EUR", /^\d{5}$/, { min: 18, covered: false }, { kind: "organiser_consent", scope: "Law 2012-348: habitual resale without the producer's/organiser's authorisation is an offence.", source: "https://www.legifrance.gouv.fr/" }),
  EUP("GR", "Greece", "EUR", /^\d{3} ?\d{2}$/, { min: 18, covered: false }, UNK()),
  EUP("HU", "Hungary", "HUF", /^\d{4}$/, { min: 18, covered: false }, UNK()),
  EUP("IT", "Italy", "EUR", /^\d{5}$/, { min: 18, covered: false }, { kind: "face_value_cap", scope: "Secondary ticketing above face value prohibited; nominative tickets for venues over 5,000 capacity.", source: "https://www.gazzettaufficiale.it/" }),
  EUP("LT", "Lithuania", "EUR", /^(LT-)?\d{5}$/i, { min: 20, covered: false }, UNK()),
  EUP("LU", "Luxembourg", "EUR", /^(L-)?\d{4}$/i, { min: 16, spiritsMin: 18, covered: false }, UNK()),
  EUP("LV", "Latvia", "EUR", /^(LV-)?\d{4}$/i, { min: 18, covered: false }, UNK()),
  EUP("MT", "Malta", "EUR", /^[A-Z]{3} ?\d{2,4}$/i, { min: 17, covered: false }, UNK()),
  EUP("NL", "Netherlands", "EUR", /^\d{4} ?[A-Z]{2}$/i, { min: 18, covered: false }, NOCAP("No statutory cap (proposals have been debated).")),
  EUP("PL", "Poland", "PLN", /^\d{2}-\d{3}$/, { min: 18, covered: false }, UNK()),
  EUP("PT", "Portugal", "EUR", /^\d{4}-\d{3}$/, { min: 18, covered: false }, { kind: "face_value_cap", scope: "Resale above the box-office price is prohibited.", source: "" }),
  EUP("RO", "Romania", "RON", /^\d{6}$/, { min: 18, covered: false }, UNK()),
  EUP("SE", "Sweden", "SEK", /^\d{3} ?\d{2}$/, { min: 18, varies: "20 for retail (Systembolaget)", covered: false }, UNK()),
  EUP("SI", "Slovenia", "EUR", /^\d{4}$/, { min: 18, covered: false }, UNK()),
  EUP("SK", "Slovakia", "EUR", /^\d{3} ?\d{2}$/, { min: 18, covered: false }, UNK()),
  { code: "CH", name: "Switzerland", eu: false, eea: false, currency: "CHF", distance: "km", postcode: /^\d{4}$/, postcodeLabel: "Postal code", address: ADDR_EU, calling: "41", trunk0: true, nsn: [9, 9],
    consumer: "ch_or", alcohol: { min: 16, spiritsMin: 18, covered: false }, licencePack: "none", resale: UNK(), consumerPrices: "tax_inclusive", taxName: "VAT (MWST)" },
  { code: "NO", name: "Norway", eu: false, eea: true, currency: "NOK", distance: "km", postcode: /^\d{4}$/, postcodeLabel: "Postal code", address: ADDR_EU, calling: "47", trunk0: false, nsn: [8, 8],
    consumer: "no_angrerett", alcohol: { min: 18, spiritsMin: 20, covered: false }, licencePack: "none", resale: { kind: "face_value_cap", scope: "Ticket resale above face value prohibited for cultural and sporting events.", source: "" }, consumerPrices: "tax_inclusive", taxName: "VAT (MVA)" },
  { code: "US", name: "United States", eu: false, eea: false, currency: "USD", distance: "mi", postcode: /^\d{5}(-\d{4})?$/, postcodeLabel: "ZIP code", regionLabel: "State", address: ADDR_NA, calling: "1", trunk0: false, nsn: [10, 10],
    consumer: "us_state", alcohol: { min: 21, covered: false }, licencePack: "none", resale: { kind: "varies_by_region", scope: "State law: some states cap resale (e.g. face value or a fixed premium), others require price disclosure (e.g. New York).", source: "" }, consumerPrices: "tax_exclusive", taxName: "Sales tax" },
  { code: "CA", name: "Canada", eu: false, eea: false, currency: "CAD", distance: "km", postcode: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i, postcodeLabel: "Postal code", regionLabel: "Province",
    address: ADDR_NA, calling: "1", trunk0: false, nsn: [10, 10], consumer: "ca_provincial", alcohol: { min: 19, varies: "18 in Alberta, Manitoba and Quebec", covered: false }, licencePack: "none",
    resale: { kind: "varies_by_region", scope: "Provincial law (e.g. Quebec requires the producer's consent to resell above the advertised price).", source: "" }, consumerPrices: "tax_exclusive", taxName: "GST/HST" },
  { code: "AU", name: "Australia", eu: false, eea: false, currency: "AUD", distance: "km", postcode: /^\d{4}$/, postcodeLabel: "Postcode", regionLabel: "State", address: ADDR_NA, calling: "61", trunk0: true, nsn: [9, 9],
    consumer: "au_acl", alcohol: { min: 18, covered: false }, licencePack: "none", resale: { kind: "face_value_cap", plusPct: 10, scope: "NSW, Victoria, Queensland and South Australia cap resale at face value + 10% (state law; varies).", source: "" }, consumerPrices: "tax_inclusive", taxName: "GST" },
  { code: "NZ", name: "New Zealand", eu: false, eea: false, currency: "NZD", distance: "km", postcode: /^\d{4}$/, postcodeLabel: "Postcode", address: ADDR_UK, calling: "64", trunk0: true, nsn: [8, 10],
    consumer: "nz_cga", alcohol: { min: 18, covered: false }, licencePack: "none", resale: { kind: "face_value_cap", scope: "Fair Trading Act: resale above face value banned for designated major events.", source: "" }, consumerPrices: "tax_inclusive", taxName: "GST" },
  { code: "JP", name: "Japan", eu: false, eea: false, currency: "JPY", distance: "km", postcode: /^\d{3}-?\d{4}$/, postcodeLabel: "Postal code", regionLabel: "Prefecture", address: ["postcode", "region", "city", "line1", "line2"], calling: "81", trunk0: true, nsn: [9, 10],
    consumer: "jp_sctl", alcohol: { min: 20, covered: false }, licencePack: "none", resale: { kind: "face_value_cap", scope: "Ticket Resale Act 2019: unauthorised resale above face value of specified tickets is prohibited.", source: "" }, consumerPrices: "tax_inclusive", taxName: "Consumption tax" },
  { code: "SG", name: "Singapore", eu: false, eea: false, currency: "SGD", distance: "km", postcode: /^\d{6}$/, postcodeLabel: "Postal code", address: ADDR_UK, calling: "65", trunk0: false, nsn: [8, 8],
    consumer: "sg_cpfta", alcohol: { min: 18, covered: false }, licencePack: "none", resale: UNK(), consumerPrices: "tax_inclusive", taxName: "GST" },
  { code: "HK", name: "Hong Kong", eu: false, eea: false, currency: "HKD", distance: "km", postcode: null, postcodeLabel: "Postal code", address: ["line1", "line2", "city"], calling: "852", trunk0: false, nsn: [8, 8],
    consumer: "hk_tdo", alcohol: { min: 18, covered: false }, licencePack: "none", resale: UNK(), consumerPrices: "tax_inclusive", taxName: "Tax" },
  { code: "AE", name: "United Arab Emirates", eu: false, eea: false, currency: "AED", distance: "km", postcode: null, postcodeLabel: "Postal code", regionLabel: "Emirate", address: ["line1", "line2", "city", "region"], calling: "971", trunk0: true, nsn: [8, 9],
    consumer: "other", alcohol: { min: 21, covered: false }, licencePack: "none", resale: UNK(), consumerPrices: "tax_inclusive", taxName: "VAT" },
  { code: "ZA", name: "South Africa", eu: false, eea: false, currency: "ZAR", distance: "km", postcode: /^\d{4}$/, postcodeLabel: "Postal code", regionLabel: "Province", address: ADDR_NA, calling: "27", trunk0: true, nsn: [9, 9],
    consumer: "other", alcohol: { min: 18, covered: false }, licencePack: "none", resale: UNK(), consumerPrices: "tax_inclusive", taxName: "VAT" },
] as CountryProfile[]).map(p => [p.code, p]));

/** EU member states (27). */
export const EU_MEMBERS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"] as const;
export const isEu = (code: unknown) => typeof code === "string" && (EU_MEMBERS as readonly string[]).includes(code.trim().toUpperCase());

const up = (c: unknown) => (typeof c === "string" ? c.trim().toUpperCase() : "");
export const countryProfile = (code: unknown): CountryProfile | null => COUNTRY_PROFILES[up(code)] ?? null;

// ── Units ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const MI_KM = 1.609344;
/** Miles for the UK and US; kilometres everywhere else (and for unknown countries). */
export const distanceUnit = (country: unknown): "mi" | "km" => countryProfile(country)?.distance ?? (up(country) === "GB" || up(country) === "US" ? "mi" : "km");
/** Coverage radius is STORED in miles (listings.details.service.coverage.radius_miles); these convert for display and input. */
export const milesToUnit = (miles: number, unit: "mi" | "km") => (unit === "km" ? Math.round(miles * MI_KM) : Math.round(miles));
export const unitToMiles = (value: number, unit: "mi" | "km") => (unit === "km" ? Math.round((value / MI_KM) * 10) / 10 : value);
export const formatDistance = (miles: number, unit: "mi" | "km") => `${milesToUnit(miles, unit).toLocaleString("en-GB")} ${unit === "km" ? "km" : miles === 1 ? "mile" : "miles"}`;

// ── Postcodes and addresses ──────────────────────────────────────────────────────────────────────────────────────
export type PostcodeCheck = { ok: true; value: string } | { ok: false; error: string };
/** Validates a postcode for a country. Countries without postcodes accept blank; unknown countries accept any 2–10 chars. */
export function checkPostcode(value: string | null | undefined, country: unknown): PostcodeCheck {
  const v = (value ?? "").trim().replace(/\s+/g, " ").toUpperCase(); const p = countryProfile(country);
  if (p && !p.postcode) return { ok: true, value: v };
  if (!v) return { ok: false, error: `Enter a ${p?.postcodeLabel.toLowerCase() ?? "postcode"}.` };
  if (!p) return /^[A-Z0-9][A-Z0-9 -]{1,9}$/.test(v) ? { ok: true, value: v } : { ok: false, error: "Enter a valid postal code." };
  return p.postcode!.test(v) ? { ok: true, value: v } : { ok: false, error: `Enter a valid ${p.name} ${p.postcodeLabel.toLowerCase()}.` };
}
export type Address = Partial<Record<AddressField, string | null>> & { country?: string | null };
export const addressFields = (country: unknown): readonly AddressField[] => countryProfile(country)?.address ?? ADDR_UK;
/** One-line address in the country's order: "Rue X 1, 75001 Paris, France"; "1 High St, London SW1A 1AA, United Kingdom". */
export function formatAddress(a: Address, opts: { includeCountry?: boolean } = {}): string {
  const p = countryProfile(a.country); const order = p?.address ?? ADDR_UK; const val = (f: AddressField) => (a[f] ?? "").trim();
  const parts: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const f = order[i]!, next = order[i + 1];
    // Postcode and city share a segment (EU "75001 Paris", UK "London SW1A 1AA", NA "Austin, TX 78701").
    if ((f === "postcode" && next === "city") || (f === "city" && next === "postcode") || (f === "region" && next === "postcode")) {
      const seg = [val(f), val(next!)].filter(Boolean).join(" "); if (seg) parts.push(seg); i++; continue;
    }
    if (val(f)) parts.push(val(f));
  }
  if (opts.includeCountry !== false && (p?.name || a.country)) parts.push(p?.name ?? String(a.country));
  return parts.join(", ");
}

// ── Phone numbers (E.164) ────────────────────────────────────────────────────────────────────────────────────────
export type PhoneCheck = { ok: true; e164: string } | { ok: false; error: string };
/**
 * Normalises a phone number to E.164 ("+447700900123"). Accepts "+44 7700 900123", "0044…", and national numbers with the
 * country's trunk 0 ("07700 900123" with GB). Length is checked against the country's national-number range when known
 * (a structural check, not a carrier lookup — libphonenumber can replace it later without changing callers).
 */
export function normalisePhone(input: string | null | undefined, defaultCountry: unknown = "GB"): PhoneCheck {
  const raw = (input ?? "").trim(); if (!raw) return { ok: false, error: "Enter a phone number." };
  if (/[^\d\s()+.\-/]/.test(raw.replace(/\s*(ext\.?|x)\s*\d+$/i, ""))) return { ok: false, error: "Use digits only (and + for the country code)." };
  let d = raw.replace(/\s*(ext\.?|x)\s*\d+$/i, "").replace(/[\s().\-/]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  let cc: string, nsn: string;
  if (d.startsWith("+")) {
    const digits = d.slice(1); if (!/^\d+$/.test(digits)) return { ok: false, error: "Enter a valid phone number." };
    const hit = Object.values(COUNTRY_PROFILES).map(p => p.calling).filter(Boolean).sort((a, b) => b.length - a.length).find(c => digits.startsWith(c));
    if (!hit) { return digits.length >= 8 && digits.length <= 15 ? { ok: true, e164: `+${digits}` } : { ok: false, error: "Enter a valid phone number with its country code." }; }
    cc = hit; nsn = digits.slice(hit.length);
    if (nsn.startsWith("0") && cc === "39") { /* Italy keeps the leading 0 in international form */ } else if (nsn.startsWith("0")) nsn = nsn.slice(1);
  } else {
    const p = countryProfile(defaultCountry); if (!p) return { ok: false, error: "Add the country code (for example +44)." };
    if (!/^\d+$/.test(d)) return { ok: false, error: "Enter a valid phone number." };
    cc = p.calling; nsn = p.trunk0 && d.startsWith("0") && p.code !== "IT" ? d.slice(1) : d;
    if (p.code === "US" || p.code === "CA") nsn = nsn.replace(/^1(?=\d{10}$)/, "");
  }
  const prof = Object.values(COUNTRY_PROFILES).find(p => p.calling === cc && (cc !== "1" || p.code === "US"));
  const [lo, hi] = prof?.nsn ?? [4, 14];
  if (nsn.length < lo || nsn.length > hi || `${cc}${nsn}`.length > 15) return { ok: false, error: `That number doesn't look right for ${prof?.name ?? "that country"}.` };
  return { ok: true, e164: `+${cc}${nsn}` };
}

/** Q76: an OPTIONAL phone field (workspace contact, team members): blank stays blank, anything else must normalise to E.164. */
export function optionalPhone(input: string | null | undefined, defaultCountry: unknown = "GB"): PhoneCheck | { ok: true; e164: "" } {
  return (input ?? "").trim() ? normalisePhone(input, defaultCountry) : { ok: true, e164: "" };
}

// ── Consumer law, alcohol, licence packs, resale, cookies, tax display ───────────────────────────────────────────
export const consumerRegime = (buyerCountry: unknown): ConsumerRegime => countryProfile(buyerCountry)?.consumer ?? (isEu(buyerCountry) ? "eu_crd" : "other");
/** Legal age for buying alcohol (general rule) and whether a Gala Dock rule pack covers it. Unknown countries: not covered. */
export function alcoholRule(country: unknown): AlcoholRule & { country: string } {
  const p = countryProfile(country); return { country: up(country), ...(p?.alcohol ?? { min: 18, covered: false, varies: "Not reviewed for this country — check local law." }) };
}
/** Licence/compliance pack coverage: GB is complete (England & Wales pack; Scotland and Northern Ireland flagged), others none yet. */
export function licencePackCoverage(country: unknown, activePackCountries: readonly string[] = []): { country: string; status: "complete" | "partial" | "none"; note: string } {
  const c = up(country) || "GB"; const has = activePackCountries.map(up).includes(c); const p = countryProfile(c);
  const status = has ? (p?.licencePack === "none" ? "partial" : p?.licencePack ?? "partial") : "none";
  const note = status === "complete" ? (c === "GB" ? "England & Wales rules (Licensing Act 2003). Scotland and Northern Ireland have different licensing law — check locally." : "Rule pack available.")
    : status === "partial" ? "A rule pack exists but has not been reviewed for every region." : `Gala Dock has no licensing rule pack for ${p?.name ?? (c || "this country")} yet. The checks below are general only — confirm every licence and permit with the local authority.`;
  return { country: c, status, note };
}
export const resaleRule = (country: unknown): ResaleRule => countryProfile(country)?.resale ?? UNK();
/**
 * Resale cap (% of face value) for an event in `country`: the platform cap (ticketing.resale_cap_pct, default 100) or the legal cap,
 * whichever is lower. Face-value countries cap at 100 (+plusPct where the law allows a premium); unknown countries keep the platform cap.
 */
export function effectiveResaleCapPct(platformCapPct: number | null | undefined, country: unknown): number {
  const base = Number.isFinite(Number(platformCapPct)) && Number(platformCapPct) > 0 ? Number(platformCapPct) : 100; const r = resaleRule(country);
  if (r.kind === "face_value_cap") return Math.min(base, 100 + (r.plusPct ?? 0));
  return base;
}
/** Cookie consent model. Gala Dock applies the strictest (EU/UK ePrivacy prior opt-in, equal "reject" button, GPC/DNT honoured) everywhere. */
export const cookieConsentModel = (country: unknown): { model: "opt_in"; reason: string } => ({ model: "opt_in", reason: isEu(country) || up(country) === "GB" || !countryProfile(country) ? "ePrivacy / PECR: prior consent required for non-essential cookies." : "Applied globally: the strictest model is used everywhere." });
/** Consumer prices: tax-inclusive in the UK, EU/EEA, CH, AU, NZ, JP, SG; tax-exclusive (tax added at checkout) in the US and Canada. */
export const consumerPriceDisplay = (buyerCountry: unknown) => countryProfile(buyerCountry)?.consumerPrices ?? (isEu(buyerCountry) ? "tax_inclusive" : "tax_inclusive");
export const currencyForCountry = (country: unknown): string | null => countryProfile(country)?.currency ?? null;
