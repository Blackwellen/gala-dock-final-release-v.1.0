// Q72 · Buyer-country rules shown at checkout and on quotes: cancellation information, tax display wording, alcohol notice,
// resale cap notice. Display only — the money rules (tax_id_collection, commission VAT, sanctions) belong to Q74. Pure module.
import { alcoholRule, consumerPriceDisplay, consumerRegime, countryProfile, effectiveResaleCapPct, isEu } from "./countries";
import { t } from "./messages";

export type CancellationNotice = { heading: string; text: string; regime: string; withdrawalRight: boolean };

/**
 * What the buyer is told about cancelling, by THEIR country (profile country, else the seller's/event's country, else GB).
 * Tickets for a dated leisure event are exempt from the 14-day right in the UK (CCR reg. 28(1)(b)) and the EU/EEA (CRD art. 16(l));
 * the notice says so plainly because the exemption must be disclosed before purchase.
 */
export function cancellationNotice(p: { buyerCountry?: string | null; kind: "ticket" | "booking"; locale?: string }): CancellationNotice {
  const regime = consumerRegime(p.buyerCountry || "GB");
  const fam = regime === "uk_ccr" ? "uk" : regime === "eu_crd" || regime === "no_angrerett" ? "eu" : "other";
  const key = `legal.cancel.${p.kind}.${fam}` as const;
  return { heading: t("legal.cancel.heading", {}, p.locale), text: t(key, {}, p.locale), regime, withdrawalRight: false };
}

/** "Prices include VAT where it applies." / "Prices exclude Sales tax; …" for the buyer's country. */
export function taxDisplayNote(buyerCountry: string | null | undefined, locale?: string): string {
  const c = buyerCountry || "GB"; const p = countryProfile(c); const taxName = p?.taxName ?? "VAT";
  return consumerPriceDisplay(c) === "tax_exclusive" ? t("checkout.price_excludes_tax", { taxName: taxName.toLowerCase() }, locale) : t("checkout.price_includes_tax", { taxName }, locale);
}

/**
 * Reverse-charge wording for a B2B invoice/quote where the supplier charges no VAT because the customer self-accounts.
 * EU customer with a VAT ID → Article 196; UK customer of a non-UK supplier → HMRC wording; others → generic.
 * Whether reverse charge APPLIES is decided by the Q74 tax rules; this only supplies the sentence.
 */
export function reverseChargeWording(customerCountry: string | null | undefined, locale?: string): string {
  const c = (customerCountry ?? "").toUpperCase();
  return isEu(c) ? t("legal.tax.reverse_charge.eu", {}, locale) : c === "GB" ? t("legal.tax.reverse_charge.uk", {}, locale) : t("legal.tax.reverse_charge.other", {}, locale);
}

/** Alcohol notice for an event country: covered (GB, IE rule rows exist) or "not covered" with the general minimum. */
export function alcoholNotice(country: string | null | undefined, locale?: string): { covered: boolean; text: string; min: number } {
  const r = alcoholRule(country || "GB"); const name = countryProfile(r.country)?.name ?? (r.country || "this country");
  return r.covered ? { covered: true, min: r.min, text: t("legal.alcohol.covered", { min: r.min, country: name }, locale) }
    : { covered: false, min: r.min, text: t("legal.alcohol.not_covered", { covered: "the UK and Ireland", country: name, min: r.min }, locale) };
}

/** Resale cap notice for the resale screens: the effective % and the sentence. */
export function resaleCapNotice(platformCapPct: number | null | undefined, country: string | null | undefined, locale?: string) {
  const pct = effectiveResaleCapPct(platformCapPct, country || "GB"); const name = countryProfile(country || "GB")?.name ?? String(country);
  return { pct, text: t("legal.resale.cap", { pct, country: name }, locale) };
}
